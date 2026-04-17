import express from 'express';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'focus-five.db');
const db = new Database(DB_PATH);

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    progress          INTEGER NOT NULL DEFAULT 0,
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    last_touched      TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'active',
    weight_deadline   INTEGER NOT NULL DEFAULT 3,
    weight_impact     INTEGER NOT NULL DEFAULT 3,
    weight_dependency INTEGER NOT NULL DEFAULT 1,
    weight_avoidance  INTEGER NOT NULL DEFAULT 1,
    weight_decay      INTEGER NOT NULL DEFAULT 1,
    total_weight      INTEGER NOT NULL DEFAULT 9,
    blocked_by_id     TEXT,
    blocker_badge     INTEGER NOT NULL DEFAULT 0,
    unlocks           TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS earned_log (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL,
    task_title TEXT NOT NULL,
    weight     INTEGER NOT NULL,
    earned_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migrations for existing databases (safe to run repeatedly)
const migrations = [
  `ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE tasks ADD COLUMN weight_deadline INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE tasks ADD COLUMN weight_impact INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE tasks ADD COLUMN weight_dependency INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tasks ADD COLUMN weight_avoidance INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tasks ADD COLUMN weight_decay INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tasks ADD COLUMN total_weight INTEGER NOT NULL DEFAULT 9`,
  `ALTER TABLE tasks ADD COLUMN blocked_by_id TEXT`,
  `ALTER TABLE tasks ADD COLUMN blocker_badge INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN unlocks TEXT NOT NULL DEFAULT '[]'`,
];
for (const m of migrations) {
  try { db.exec(m); } catch (_) { /* column already exists */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const taskFromRow = (row) => ({
  id: row.id,
  title: row.title,
  progress: row.progress,
  notes: row.notes,
  createdAt: row.created_at,
  lastTouched: row.last_touched,
  status: row.status,
  weights: {
    deadline: row.weight_deadline,
    impact: row.weight_impact,
    dependency: row.weight_dependency,
    avoidance: row.weight_avoidance,
    decay: row.weight_decay,
  },
  totalWeight: row.total_weight,
  blockedById: row.blocked_by_id,
  blockerBadge: row.blocker_badge === 1,
  unlocks: JSON.parse(row.unlocks || '[]'),
});

const computeWeight = (w) =>
  (w.deadline ?? 3) + (w.impact ?? 3) + (w.dependency ?? 1) + (w.avoidance ?? 1) + (w.decay ?? 1);

const getFullConfig = () => {
  const ntfyRow = db.prepare('SELECT value FROM config WHERE key = ?').get('ntfy');
  const thrRow = db.prepare('SELECT value FROM config WHERE key = ?').get('weight_threshold');
  return {
    ntfy: ntfyRow
      ? JSON.parse(ntfyRow.value)
      : { server: 'https://ntfy.sh', topic: '', reminderHour: 9, enabled: false },
    weightThreshold: thrRow ? Number(thrRow.value) : 60,
  };
};

// ── ntfy ───────────────────────────────────────────────────────────────────────

const sendNtfy = async (cfg, body, { title = 'Focus Five', priority = 'default' } = {}) => {
  const res = await fetch(`${cfg.server.replace(/\/$/, '')}/${cfg.topic}`, {
    method: 'POST',
    body,
    headers: { Title: title, Priority: priority },
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
};

const buildReminderMessage = () => {
  const tasks = db.prepare(`SELECT * FROM tasks WHERE status='active' ORDER BY last_touched ASC`).all().map(taskFromRow);
  if (!tasks.length) return null;
  const now = Date.now();
  const hrs = (ts) => (now - new Date(ts).getTime()) / 3_600_000;
  const neglected = tasks.filter((t) => hrs(t.lastTouched) >= 24);
  if (neglected.length) {
    const h = Math.round(hrs(neglected[0].lastTouched));
    return {
      body: `"${neglected[0].title}" untouched for ${h}h — ${neglected.length} item${neglected.length > 1 ? 's' : ''} need attention`,
      priority: neglected.some((t) => hrs(t.lastTouched) >= 72) ? 'high' : 'default',
    };
  }
  const avg = Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length);
  return { body: `Daily check-in — ${tasks.length} active priorities, ${avg}% avg progress`, priority: 'min' };
};

// ── Cron ───────────────────────────────────────────────────────────────────────

let cronJob = null;
const scheduleCron = (ntfy) => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  if (!ntfy?.enabled || !ntfy?.topic) return;
  cronJob = cron.schedule(`0 ${ntfy.reminderHour} * * *`, async () => {
    const msg = buildReminderMessage();
    if (!msg) return;
    try { await sendNtfy(ntfy, msg.body, { priority: msg.priority }); }
    catch (err) { console.error('[cron] ntfy failed:', err.message); }
  });
  console.log(`[cron] scheduled → hour ${ntfy.reminderHour}, topic "${ntfy.topic}"`);
};
scheduleCron(getFullConfig().ntfy);

// ── Express ────────────────────────────────────────────────────────────────────

app.use(express.json());
if (isProd) app.use(express.static(path.join(__dirname, 'dist')));

// GET all tasks + config metadata
app.get('/api/tasks', (_req, res) => {
  const all = db.prepare('SELECT * FROM tasks ORDER BY total_weight DESC, created_at ASC').all().map(taskFromRow);
  const { ntfy, weightThreshold } = getFullConfig();
  const activeWeight = all.filter((t) => t.status === 'active').reduce((s, t) => s + t.totalWeight, 0);
  res.json({ tasks: all, ntfyConfig: ntfy, weightThreshold, activeWeight, backlogAvailable: activeWeight < weightThreshold });
});

// Create task
app.post('/api/tasks', (req, res) => {
  const {
    id, title, progress = 0, notes = '', createdAt, lastTouched,
    status = 'active',
    weights = { deadline: 3, impact: 3, dependency: 1, avoidance: 1, decay: 1 },
    unlocks = [],
  } = req.body;
  const totalWeight = computeWeight(weights);
  db.prepare(`
    INSERT INTO tasks
      (id,title,progress,notes,created_at,last_touched,status,
       weight_deadline,weight_impact,weight_dependency,weight_avoidance,weight_decay,total_weight,unlocks)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, title, progress, notes, createdAt, lastTouched, status,
    weights.deadline, weights.impact, weights.dependency, weights.avoidance, weights.decay,
    totalWeight, JSON.stringify(unlocks));
  res.json({ ok: true });
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { title, progress, notes, lastTouched, status, weights, unlocks } = req.body;
  const w = weights ?? { deadline: row.weight_deadline, impact: row.weight_impact,
    dependency: row.weight_dependency, avoidance: row.weight_avoidance, decay: row.weight_decay };
  db.prepare(`
    UPDATE tasks SET title=?,progress=?,notes=?,last_touched=?,status=?,
      weight_deadline=?,weight_impact=?,weight_dependency=?,weight_avoidance=?,weight_decay=?,
      total_weight=?,unlocks=?
    WHERE id=?
  `).run(
    title ?? row.title, progress ?? row.progress, notes ?? row.notes,
    lastTouched ?? row.last_touched, status ?? row.status,
    w.deadline, w.impact, w.dependency, w.avoidance, w.decay, computeWeight(w),
    unlocks !== undefined ? JSON.stringify(unlocks) : row.unlocks,
    req.params.id,
  );
  res.json({ ok: true });
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Complete task → earn points, resolve blockers, unlock tasks
app.post('/api/tasks/:id/complete', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();

  db.prepare(`UPDATE tasks SET status='completed', last_touched=? WHERE id=?`).run(now, row.id);
  db.prepare('INSERT INTO earned_log (id,task_id,task_title,weight,earned_at) VALUES (?,?,?,?,?)')
    .run(generateId(), row.id, row.title, row.total_weight, now);

  // Unlock locked tasks
  const unlocks = JSON.parse(row.unlocks || '[]');
  for (const uid of unlocks) {
    db.prepare(`UPDATE tasks SET status='backlog' WHERE id=? AND status='locked'`).run(uid);
  }

  // Resolve any task that was blocked by this one
  const activeCount = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status='active'`).get().c;
  db.prepare(`UPDATE tasks SET status=?, blocked_by_id=NULL WHERE blocked_by_id=?`)
    .run(activeCount < 5 ? 'active' : 'backlog', row.id);

  res.json({ ok: true, earned: row.total_weight, unlockedCount: unlocks.length });
});

// Block a task → creates a high-priority blocker task, takes the freed slot
app.post('/api/tasks/:id/block', (req, res) => {
  const { blockerTitle } = req.body;
  if (!blockerTitle?.trim()) return res.status(400).json({ error: 'blockerTitle required' });
  const blocked = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!blocked) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const blockerId = generateId();
  // Blocker always gets the highest possible weight so it tops the list
  const bw = { deadline: 5, impact: 5, dependency: 3, avoidance: 1, decay: 1 };
  db.prepare(`
    INSERT INTO tasks
      (id,title,progress,notes,created_at,last_touched,status,
       weight_deadline,weight_impact,weight_dependency,weight_avoidance,weight_decay,total_weight,
       blocker_badge,unlocks)
    VALUES (?,?,0,?,?,?,'active',?,?,?,?,?,?,1,'[]')
  `).run(blockerId, blockerTitle.trim(), `Blocking: ${blocked.title}`, now, now,
    bw.deadline, bw.impact, bw.dependency, bw.avoidance, bw.decay, computeWeight(bw));

  db.prepare(`UPDATE tasks SET status='blocked', blocked_by_id=? WHERE id=?`).run(blockerId, blocked.id);

  res.json({ ok: true, blocker: taskFromRow(db.prepare('SELECT * FROM tasks WHERE id=?').get(blockerId)) });
});

// Dismiss the ⚡ blocker badge
app.put('/api/tasks/:id/dismiss-badge', (req, res) => {
  db.prepare('UPDATE tasks SET blocker_badge=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ntfy config
app.get('/api/config', (_req, res) => res.json(getFullConfig().ntfy));
app.put('/api/config', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run('ntfy', JSON.stringify(req.body));
  scheduleCron(req.body);
  res.json({ ok: true });
});

// Weight threshold config
app.put('/api/config/threshold', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run('weight_threshold', String(req.body.threshold));
  res.json({ ok: true });
});

// Trigger reminder
app.post('/api/remind', async (req, res) => {
  const { ntfy } = getFullConfig();
  if (!ntfy.topic) return res.status(400).json({ error: 'ntfy topic not configured' });
  if (!req.body?.force && !ntfy.enabled) return res.status(400).json({ error: 'reminders disabled' });
  const msg = buildReminderMessage();
  if (!msg) return res.json({ ok: true, skipped: 'no tasks' });
  try { await sendNtfy(ntfy, msg.body, { priority: msg.priority }); res.json({ ok: true, sent: msg.body }); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

// Stats
app.get('/api/stats', (_req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const earned = (pattern) =>
    db.prepare(`SELECT COALESCE(SUM(weight),0) as t FROM earned_log WHERE earned_at LIKE ?`).get(pattern).t;

  const earnedToday = earned(`${today}%`);
  const earnedMonth = earned(`${month}%`);

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { date: d, total: earned(`${d}%`) };
  });
  const earnedWeek = weekData.reduce((s, d) => s + d.total, 0);

  const bestDayRow = db.prepare(
    `SELECT DATE(earned_at) as day, SUM(weight) as t FROM earned_log GROUP BY day ORDER BY t DESC LIMIT 1`
  ).get();

  // Best rolling 7-day window
  const allDays = db.prepare(
    `SELECT DATE(earned_at) as day, SUM(weight) as t FROM earned_log GROUP BY day`
  ).all();
  const dayMap = Object.fromEntries(allDays.map((d) => [d.day, d.t]));
  let bestWeek = 0;
  for (const { day } of allDays) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const dd = new Date(new Date(day).getTime() + i * 86400000).toISOString().slice(0, 10);
      sum += dayMap[dd] || 0;
    }
    if (sum > bestWeek) bestWeek = sum;
  }

  // Pacing: today vs average of previous 6 days
  const past6Avg = weekData.slice(0, 6).reduce((s, d) => s + d.total, 0) / 6;
  const pacing = past6Avg > 0 ? earnedToday / past6Avg : null;

  const recent = db.prepare(`SELECT * FROM earned_log ORDER BY earned_at DESC LIMIT 10`).all();

  res.json({ earnedToday, earnedWeek, earnedMonth, bestDay: bestDayRow ? { date: bestDayRow.day, total: bestDayRow.t } : null, bestWeek, pacing, weekData, recent });
});

if (isProd) app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => console.log(`Focus Five → http://localhost:${PORT}`));
