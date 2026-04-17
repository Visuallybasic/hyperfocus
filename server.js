import express from 'express';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Database ──────────────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'focus-five.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    last_touched TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const taskFromRow = (row) => ({
  id: row.id,
  title: row.title,
  progress: row.progress,
  notes: row.notes,
  createdAt: row.created_at,
  lastTouched: row.last_touched,
});

const getConfig = () => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('ntfy');
  return row
    ? JSON.parse(row.value)
    : { server: 'https://ntfy.sh', topic: '', reminderHour: 9, enabled: false };
};

const saveConfig = (cfg) => {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('ntfy', JSON.stringify(cfg));
};

// ── ntfy helper ───────────────────────────────────────────────────────────────

const sendNtfy = async (cfg, message, { title = 'Focus Five', priority = 'default' } = {}) => {
  const url = `${cfg.server.replace(/\/$/, '')}/${cfg.topic}`;
  const res = await fetch(url, {
    method: 'POST',
    body: message,
    headers: { Title: title, Priority: priority },
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
};

const buildReminderMessage = () => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY last_touched ASC').all().map(taskFromRow);
  if (tasks.length === 0) return null;

  const now = Date.now();
  const hoursSince = (ts) => (now - new Date(ts).getTime()) / 3_600_000;

  const neglected = tasks.filter((t) => hoursSince(t.lastTouched) >= 24);
  const mostNeglected = tasks[0]; // already sorted oldest-first
  const avgProgress = Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length);

  if (neglected.length > 0) {
    const h = Math.round(hoursSince(mostNeglected.lastTouched));
    return {
      body: `"${mostNeglected.title}" hasn't been touched in ${h}h — ${neglected.length} item${neglected.length > 1 ? 's' : ''} need attention`,
      priority: neglected.some((t) => hoursSince(t.lastTouched) >= 72) ? 'high' : 'default',
    };
  }

  return {
    body: `Daily check-in — ${tasks.length} active priorities, ${avgProgress}% avg progress`,
    priority: 'min',
  };
};

// ── Cron scheduling ───────────────────────────────────────────────────────────

let cronJob = null;

const scheduleCron = (cfg) => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  if (!cfg.enabled || !cfg.topic) return;

  const expr = `0 ${cfg.reminderHour} * * *`;
  cronJob = cron.schedule(expr, async () => {
    const msg = buildReminderMessage();
    if (!msg) return;
    try {
      await sendNtfy(cfg, msg.body, { priority: msg.priority });
      console.log(`[cron] reminder sent: "${msg.body.slice(0, 60)}..."`);
    } catch (err) {
      console.error('[cron] ntfy failed:', err.message);
    }
  });
  console.log(`[cron] scheduled at hour ${cfg.reminderHour} → topic "${cfg.topic}"`);
};

scheduleCron(getConfig());

// ── Express ───────────────────────────────────────────────────────────────────

app.use(express.json());

if (isProd) {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// Tasks
app.get('/api/tasks', (_req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all().map(taskFromRow);
  res.json({ tasks, ntfyConfig: getConfig() });
});

app.post('/api/tasks', (req, res) => {
  const { id, title, progress = 0, notes = '', createdAt, lastTouched } = req.body;
  db.prepare(
    'INSERT INTO tasks (id, title, progress, notes, created_at, last_touched) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, progress, notes, createdAt, lastTouched);
  res.json({ ok: true });
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, progress, notes = '', lastTouched } = req.body;
  db.prepare(
    'UPDATE tasks SET title=?, progress=?, notes=?, last_touched=? WHERE id=?'
  ).run(title, progress, notes, lastTouched, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Config
app.get('/api/config', (_req, res) => res.json(getConfig()));

app.put('/api/config', (req, res) => {
  saveConfig(req.body);
  scheduleCron(req.body);
  res.json({ ok: true });
});

// Trigger reminder immediately (test or external cron script)
app.post('/api/remind', async (req, res) => {
  const cfg = getConfig();
  const force = req.body?.force === true; // bypass enabled check for test sends

  if (!cfg.topic) return res.status(400).json({ error: 'ntfy topic not configured' });
  if (!force && !cfg.enabled) return res.status(400).json({ error: 'reminders are disabled' });

  const msg = buildReminderMessage();
  if (!msg) return res.json({ ok: true, skipped: 'no tasks' });

  try {
    await sendNtfy(cfg, msg.body, { priority: msg.priority });
    res.json({ ok: true, sent: msg.body });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// SPA fallback
if (isProd) {
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Focus Five running → http://localhost:${PORT}`);
});
