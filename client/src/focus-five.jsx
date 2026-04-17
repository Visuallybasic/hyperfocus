import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const SLOT_COUNT = 5;
const NEGLECT_THRESHOLD_HOURS = 24;
const DANGER_THRESHOLD_HOURS = 72;

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const hoursSince = (dateStr) => {
  if (!dateStr) return 0;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
};

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return "just now";
  const h = hoursSince(dateStr);
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
};

const getNeglectLevel = (lastTouched) => {
  const h = hoursSince(lastTouched);
  if (h >= DANGER_THRESHOLD_HOURS) return "danger";
  if (h >= NEGLECT_THRESHOLD_HOURS) return "warning";
  return "ok";
};

// Ntfy config modal
function NtfyModal({ show, onClose, config, onSave }) {
  const [server, setServer] = useState(config.server || "https://ntfy.sh");
  const [topic, setTopic] = useState(config.topic || "");
  const [hour, setHour] = useState(config.reminderHour ?? 9);
  const [enabled, setEnabled] = useState(config.enabled || false);
  const [testStatus, setTestStatus] = useState(null); // null | 'sending' | 'ok' | 'error'

  useEffect(() => {
    if (show) {
      setServer(config.server || "https://ntfy.sh");
      setTopic(config.topic || "");
      setHour(config.reminderHour ?? 9);
      setEnabled(config.enabled || false);
      setTestStatus(null);
    }
  }, [show]);

  if (!show) return null;

  const handleTest = async () => {
    setTestStatus("sending");
    try {
      await onSave({ server, topic, reminderHour: hour, enabled });
      const result = await api.testReminder();
      setTestStatus(result.skipped ? "ok-empty" : "ok");
    } catch {
      setTestStatus("error");
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Reminder Setup</h2>
        <p style={styles.modalDesc}>
          Connect to <strong>ntfy</strong> to get push notifications on your phone.
          Install the ntfy app, then pick a unique topic name.
        </p>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Server URL</label>
          <input
            style={styles.input}
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="https://ntfy.sh or your self-hosted URL"
          />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Topic (unique to you)</label>
          <input
            style={styles.input}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. my-focus-five-abc123"
          />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Daily check-in reminder hour</label>
          <select style={styles.input} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
              </option>
            ))}
          </select>
        </div>
        <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable daily reminders (server-side cron)
        </label>

        <div style={styles.curlBox}>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 13 }}>Test it — run this in your terminal:</p>
          <code style={styles.code}>
            {`curl -d "Focus Five: time to check in!" ${server || "https://ntfy.sh"}/${topic || "your-topic"}`}
          </code>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            style={styles.btnPrimary}
            onClick={() => {
              onSave({ server, topic, reminderHour: hour, enabled });
              onClose();
            }}
          >
            Save
          </button>
          <button
            style={{ ...styles.btnSecondary, opacity: topic ? 1 : 0.4 }}
            disabled={!topic}
            onClick={handleTest}
          >
            {testStatus === "sending" ? "Sending…" : "Send test notification"}
          </button>
          <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
        </div>
        {testStatus === "ok" && (
          <p style={{ marginTop: 10, fontSize: 13, color: "#5a8a6a", fontWeight: 600 }}>
            ✓ Notification sent — check your phone
          </p>
        )}
        {testStatus === "ok-empty" && (
          <p style={{ marginTop: 10, fontSize: 13, color: "#5a8a6a" }}>
            ✓ Connected (no tasks yet to report)
          </p>
        )}
        {testStatus === "error" && (
          <p style={{ marginTop: 10, fontSize: 13, color: "#e05a33", fontWeight: 600 }}>
            ✗ Failed — check your server URL and topic
          </p>
        )}
      </div>
    </div>
  );
}

// Check-in modal
function CheckInModal({ show, tasks, onClose, onRemove }) {
  const [removing, setRemoving] = useState(null);
  if (!show || tasks.length === 0) return null;

  const sorted = [...tasks].sort((a, b) => hoursSince(b.lastTouched) - hoursSince(a.lastTouched));

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Daily Check-in</h2>
        <p style={styles.modalDesc}>
          Still your top priorities? Remove anything that's done or no longer matters.
          Most neglected items are shown first.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((t) => {
            const level = getNeglectLevel(t.lastTouched);
            return (
              <div
                key={t.id}
                style={{
                  ...styles.checkInItem,
                  borderLeft: `4px solid ${level === "danger" ? "#e05a33" : level === "warning" ? "#d4a03c" : "#5a8a6a"}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {t.progress}% done · touched {formatTimeAgo(t.lastTouched)}
                  </div>
                </div>
                {removing === t.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...styles.btnDanger, fontSize: 12, padding: "4px 10px" }} onClick={() => { onRemove(t.id); setRemoving(null); }}>
                      Yes, remove
                    </button>
                    <button style={{ ...styles.btnSecondary, fontSize: 12, padding: "4px 10px" }} onClick={() => setRemoving(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <button style={{ ...styles.btnGhost, fontSize: 12 }} onClick={() => setRemoving(t.id)}>
                    Drop
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button style={{ ...styles.btnPrimary, marginTop: 16, width: "100%" }} onClick={onClose}>
          Looks good — let's focus
        </button>
      </div>
    </div>
  );
}

// Swap modal when at capacity
function SwapModal({ show, tasks, newTitle, onSwap, onCancel }) {
  if (!show) return null;
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>You're at 5 — what goes?</h2>
        <p style={styles.modalDesc}>
          To add <strong>"{newTitle}"</strong>, you need to remove something.
          This is the hard part, but it's the whole point.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((t) => (
            <button
              key={t.id}
              style={styles.swapItem}
              onClick={() => onSwap(t.id)}
            >
              <span style={{ flex: 1, textAlign: "left" }}>{t.title}</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{t.progress}%</span>
              <span style={{ fontSize: 12, color: "#e05a33" }}>Remove this</span>
            </button>
          ))}
        </div>
        <button style={{ ...styles.btnSecondary, marginTop: 14, width: "100%" }} onClick={onCancel}>
          Nevermind, keep current five
        </button>
      </div>
    </div>
  );
}

// Task card
function TaskCard({ task, onUpdate, onRemove, isExpanded, onToggle }) {
  const level = getNeglectLevel(task.lastTouched);
  const accentColor = level === "danger" ? "#e05a33" : level === "warning" ? "#d4a03c" : "#5a8a6a";

  return (
    <div
      style={{
        ...styles.card,
        borderLeft: `4px solid ${accentColor}`,
        background: level === "danger"
          ? "rgba(224,90,51,0.06)"
          : level === "warning"
          ? "rgba(212,160,60,0.04)"
          : "rgba(90,138,106,0.03)",
      }}
    >
      <div style={styles.cardHeader} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.cardTitle}>{task.title}</div>
          <div style={styles.cardMeta}>
            Touched {formatTimeAgo(task.lastTouched)}
            {level === "danger" && <span style={{ color: "#e05a33", fontWeight: 600 }}> · needs attention</span>}
            {level === "warning" && <span style={{ color: "#d4a03c", fontWeight: 600 }}> · getting stale</span>}
          </div>
        </div>
        <div style={styles.progressBadge}>
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke={accentColor}
              strokeWidth="3"
              strokeDasharray={`${task.progress * 0.9425} 94.25`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
            <text x="18" y="19.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--text-primary)">
              {task.progress}%
            </text>
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div style={styles.cardBody}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Progress</label>
            <input
              type="range"
              min="0"
              max="100"
              value={task.progress}
              onChange={(e) => onUpdate({ ...task, progress: Number(e.target.value), lastTouched: new Date().toISOString() })}
              style={styles.slider}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              style={styles.textarea}
              value={task.notes || ""}
              onChange={(e) => onUpdate({ ...task, notes: e.target.value, lastTouched: new Date().toISOString() })}
              placeholder="What's the next concrete step?"
              rows={2}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              style={styles.btnTouch}
              onClick={() => onUpdate({ ...task, lastTouched: new Date().toISOString() })}
            >
              Mark touched
            </button>
            <button style={styles.btnGhost} onClick={() => onRemove(task.id)}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Empty slot
function EmptySlot({ index, total }) {
  return (
    <div style={styles.emptySlot}>
      <div style={styles.emptySlotInner}>
        <span style={{ fontSize: 20, opacity: 0.25 }}>+</span>
        <span style={{ fontSize: 13, opacity: 0.35, fontWeight: 500 }}>Slot {total + index + 1} of {SLOT_COUNT}</span>
      </div>
    </div>
  );
}

// Main app
export default function FocusFive() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showNtfy, setShowNtfy] = useState(false);
  const [ntfyConfig, setNtfyConfig] = useState({ server: "https://ntfy.sh", topic: "", reminderHour: 9, enabled: false });
  const inputRef = useRef(null);

  useEffect(() => {
    api.getAll()
      .then(({ tasks: t, ntfyConfig: cfg }) => {
        setTasks(t || []);
        if (cfg) setNtfyConfig(cfg);
      })
      .catch((e) => console.error("Load failed:", e))
      .finally(() => setLoaded(true));
  }, []);

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    if (tasks.length >= SLOT_COUNT) {
      setShowSwap(true);
      return;
    }
    const task = {
      id: generateId(),
      title,
      progress: 0,
      notes: "",
      createdAt: new Date().toISOString(),
      lastTouched: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, task]);
    api.addTask(task).catch(console.error);
    setNewTitle("");
    setExpandedId(task.id);
  };

  const swapTask = (removeId) => {
    const task = {
      id: generateId(),
      title: newTitle.trim(),
      progress: 0,
      notes: "",
      createdAt: new Date().toISOString(),
      lastTouched: new Date().toISOString(),
    };
    setTasks((prev) => [...prev.filter((t) => t.id !== removeId), task]);
    api.deleteTask(removeId).catch(console.error);
    api.addTask(task).catch(console.error);
    setNewTitle("");
    setShowSwap(false);
    setExpandedId(task.id);
  };

  const removeTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.deleteTask(id).catch(console.error);
    if (expandedId === id) setExpandedId(null);
  };

  const updateTask = (updated) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    api.updateTask(updated).catch(console.error);
  };

  const saveNtfy = async (config) => {
    setNtfyConfig(config);
    await api.saveConfig(config);
  };

  const neglectedCount = tasks.filter((t) => getNeglectLevel(t.lastTouched) !== "ok").length;
  const avgProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;

  if (!loaded) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: 60, opacity: 0.5 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Focus Five</h1>
          <p style={styles.subtitle}>
            {tasks.length === 0
              ? "Add your top priorities. Max five. That's the rule."
              : `${tasks.length} of ${SLOT_COUNT} slots used · ${avgProgress}% avg progress`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tasks.length > 0 && (
            <button style={styles.headerBtn} onClick={() => setShowCheckin(true)}>
              Check in
            </button>
          )}
          <button style={styles.headerBtn} onClick={() => setShowNtfy(true)}>
            {ntfyConfig.enabled ? "🔔" : "🔕"}
          </button>
        </div>
      </header>

      {neglectedCount > 0 && (
        <div style={styles.alertBar}>
          {neglectedCount === 1 ? "1 item needs your attention" : `${neglectedCount} items need your attention`}
          — you might be avoiding something
        </div>
      )}

      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          style={styles.addInput}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder={tasks.length >= SLOT_COUNT ? "At capacity — remove one first or type to swap" : "What deserves a slot?"}
          maxLength={120}
        />
        <button
          style={{ ...styles.addBtn, opacity: newTitle.trim() ? 1 : 0.4 }}
          onClick={addTask}
          disabled={!newTitle.trim()}
        >
          {tasks.length >= SLOT_COUNT ? "Swap" : "Add"}
        </button>
      </div>

      <div style={styles.taskList}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onUpdate={updateTask}
            onRemove={removeTask}
            isExpanded={expandedId === task.id}
            onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
          />
        ))}
        {Array.from({ length: SLOT_COUNT - tasks.length }, (_, i) => (
          <EmptySlot key={`empty-${i}`} index={i} total={tasks.length} />
        ))}
      </div>

      {tasks.length > 0 && (
        <div style={styles.footer}>
          <div style={styles.footerTitle}>Self-host reminder script</div>
          <div style={styles.footerDesc}>
            The server already handles cron internally. You can also call the API from an external scheduler
            or pair with <a href="https://ntfy.sh" target="_blank" rel="noopener" style={{ color: "#5a8a6a" }}>ntfy</a> for
            phone push notifications.
          </div>
          <code style={styles.footerCode}>
            {`# External cron (optional): 0 ${ntfyConfig.reminderHour || 9} * * *\ncurl -s -X POST http://localhost:3000/api/remind`}
          </code>
        </div>
      )}

      <SwapModal
        show={showSwap}
        tasks={tasks}
        newTitle={newTitle}
        onSwap={swapTask}
        onCancel={() => setShowSwap(false)}
      />
      <CheckInModal
        show={showCheckin}
        tasks={tasks}
        onClose={() => setShowCheckin(false)}
        onRemove={(id) => { removeTask(id); }}
      />
      <NtfyModal
        show={showNtfy}
        config={ntfyConfig}
        onClose={() => setShowNtfy(false)}
        onSave={saveNtfy}
      />
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'DM Sans', sans-serif",
    maxWidth: 560,
    margin: "0 auto",
    padding: "24px 16px 60px",
    color: "var(--text-primary, #1a1a1a)",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    lineHeight: 1.2,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13.5,
    opacity: 0.5,
    fontWeight: 500,
  },
  headerBtn: {
    background: "rgba(0,0,0,0.05)",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    color: "inherit",
  },
  alertBar: {
    background: "rgba(224,90,51,0.08)",
    border: "1px solid rgba(224,90,51,0.2)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 500,
    color: "#b04425",
    marginBottom: 16,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
  },
  addInput: {
    flex: 1,
    padding: "12px 14px",
    fontSize: 14,
    border: "2px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    background: "rgba(0,0,0,0.02)",
    color: "inherit",
    transition: "border-color 0.2s",
  },
  addBtn: {
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 700,
    border: "none",
    borderRadius: 10,
    background: "#2d3a33",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "opacity 0.2s, transform 0.1s",
    whiteSpace: "nowrap",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  card: {
    borderRadius: 12,
    padding: "14px 16px",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  cardMeta: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
    fontWeight: 500,
  },
  progressBadge: {
    flexShrink: 0,
  },
  cardBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid rgba(0,0,0,0.06)",
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    opacity: 0.5,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "2px solid rgba(0,0,0,0.08)",
    borderRadius: 8,
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    background: "rgba(0,0,0,0.02)",
    color: "inherit",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "2px solid rgba(0,0,0,0.08)",
    borderRadius: 8,
    outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    resize: "vertical",
    background: "rgba(0,0,0,0.02)",
    color: "inherit",
    boxSizing: "border-box",
  },
  slider: {
    width: "100%",
    accentColor: "#5a8a6a",
    cursor: "pointer",
  },
  btnTouch: {
    background: "#5a8a6a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  btnGhost: {
    background: "transparent",
    color: "inherit",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    opacity: 0.6,
  },
  btnPrimary: {
    background: "#2d3a33",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  btnSecondary: {
    background: "rgba(0,0,0,0.05)",
    color: "inherit",
    border: "none",
    borderRadius: 10,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  btnDanger: {
    background: "#e05a33",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  emptySlot: {
    borderRadius: 12,
    border: "2px dashed rgba(0,0,0,0.08)",
    padding: "18px 16px",
  },
  emptySlotInner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 16,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: "28px 24px",
    maxWidth: 440,
    width: "100%",
    maxHeight: "85vh",
    overflowY: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalTitle: {
    margin: "0 0 6px",
    fontSize: 20,
    fontWeight: 700,
  },
  modalDesc: {
    margin: "0 0 18px",
    fontSize: 14,
    opacity: 0.6,
    lineHeight: 1.5,
  },
  checkInItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 10,
    background: "rgba(0,0,0,0.03)",
  },
  swapItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 10,
    background: "rgba(0,0,0,0.03)",
    border: "2px solid transparent",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    color: "inherit",
    transition: "border-color 0.15s",
  },
  curlBox: {
    background: "rgba(0,0,0,0.04)",
    borderRadius: 10,
    padding: "12px 14px",
    marginTop: 16,
  },
  code: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    wordBreak: "break-all",
    display: "block",
    lineHeight: 1.5,
  },
  footer: {
    marginTop: 32,
    padding: "20px",
    background: "rgba(0,0,0,0.03)",
    borderRadius: 14,
  },
  footerTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 6,
  },
  footerDesc: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  footerCode: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11.5,
    background: "rgba(0,0,0,0.05)",
    padding: "12px",
    borderRadius: 8,
    display: "block",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
  },
};
