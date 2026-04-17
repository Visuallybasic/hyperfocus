import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api.js";
import StatsPanel from "./StatsPanel.jsx";

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

// ── Ntfy Modal ────────────────────────────────────────────────────────────────

function NtfyModal({ show, onClose, config, onSave }) {
  const [server, setServer] = useState(config.server || "https://ntfy.sh");
  const [topic, setTopic] = useState(config.topic || "");
  const [hour, setHour] = useState(config.reminderHour ?? 9);
  const [enabled, setEnabled] = useState(config.enabled || false);
  const [testStatus, setTestStatus] = useState(null);

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
    } catch { setTestStatus("error"); }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Reminder Setup</h2>
        <p style={styles.modalDesc}>
          Connect to <strong>ntfy</strong> for push notifications. Install the ntfy app, pick a unique topic.
        </p>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Server URL</label>
          <input style={styles.input} value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://ntfy.sh or self-hosted" />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Topic</label>
          <input style={styles.input} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. my-focus-five-abc123" />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Daily reminder hour</label>
          <select style={styles.input} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}</option>
            ))}
          </select>
        </div>
        <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable daily reminders
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button style={styles.btnPrimary} onClick={() => { onSave({ server, topic, reminderHour: hour, enabled }); onClose(); }}>Save</button>
          <button style={{ ...styles.btnSecondary, opacity: topic ? 1 : 0.4 }} disabled={!topic} onClick={handleTest}>
            {testStatus === "sending" ? "Sending…" : "Test notification"}
          </button>
          <button style={styles.btnGhost} onClick={onClose}>Cancel</button>
        </div>
        {testStatus === "ok" && <p style={{ marginTop: 10, fontSize: 13, color: "#5a8a6a", fontWeight: 600 }}>✓ Sent — check your phone</p>}
        {testStatus === "error" && <p style={{ marginTop: 10, fontSize: 13, color: "#e05a33", fontWeight: 600 }}>✗ Failed — check server URL and topic</p>}
      </div>
    </div>
  );
}

// ── Check-in Modal ────────────────────────────────────────────────────────────

function CheckInModal({ show, tasks, onClose, onRemove, onComplete }) {
  const [confirming, setConfirming] = useState(null);
  if (!show || tasks.length === 0) return null;
  const sorted = [...tasks].sort((a, b) => hoursSince(b.lastTouched) - hoursSince(a.lastTouched));

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Daily Check-in</h2>
        <p style={styles.modalDesc}>Most neglected first. Complete what's done, drop what no longer matters.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((t) => {
            const level = getNeglectLevel(t.lastTouched);
            return (
              <div key={t.id} style={{ ...styles.checkInItem, borderLeft: `4px solid ${level === "danger" ? "#e05a33" : level === "warning" ? "#d4a03c" : "#5a8a6a"}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{t.progress}% · {formatTimeAgo(t.lastTouched)} · {t.totalWeight}wt</div>
                </div>
                {confirming === t.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...styles.btnTouch, fontSize: 12, padding: "4px 10px" }} onClick={() => { onComplete(t.id); setConfirming(null); }}>✓ Done</button>
                    <button style={{ ...styles.btnDanger, fontSize: 12, padding: "4px 10px" }} onClick={() => { onRemove(t.id); setConfirming(null); }}>Drop</button>
                    <button style={{ ...styles.btnGhost, fontSize: 12, padding: "4px 10px" }} onClick={() => setConfirming(null)}>Keep</button>
                  </div>
                ) : (
                  <button style={{ ...styles.btnGhost, fontSize: 12 }} onClick={() => setConfirming(t.id)}>Review</button>
                )}
              </div>
            );
          })}
        </div>
        <button style={{ ...styles.btnPrimary, marginTop: 16, width: "100%" }} onClick={onClose}>Let's focus</button>
      </div>
    </div>
  );
}

// ── Swap Modal ────────────────────────────────────────────────────────────────

function SwapModal({ show, tasks, newTitle, onSwap, onCancel }) {
  if (!show) return null;
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>You're at 5 — what goes?</h2>
        <p style={styles.modalDesc}>To add <strong>"{newTitle}"</strong>, remove something. This is the hard part.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((t) => (
            <button key={t.id} style={styles.swapItem} onClick={() => onSwap(t.id)}>
              <span style={{ flex: 1, textAlign: "left" }}>{t.title}</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{t.progress}%</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{t.totalWeight}wt</span>
              <span style={{ fontSize: 12, color: "#e05a33" }}>Remove</span>
            </button>
          ))}
        </div>
        <button style={{ ...styles.btnSecondary, marginTop: 14, width: "100%" }} onClick={onCancel}>Nevermind</button>
      </div>
    </div>
  );
}

// ── Completion Flash ──────────────────────────────────────────────────────────

function EarnedToast({ earned, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return (
    <div style={styles.toast}>
      +{earned} pts earned
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdate, onRemove, onComplete, onDismissBadge, isExpanded, onToggle }) {
  const level = getNeglectLevel(task.lastTouched);
  const accentColor = level === "danger" ? "#e05a33" : level === "warning" ? "#d4a03c" : "#5a8a6a";

  return (
    <div style={{ ...styles.card, borderLeft: `4px solid ${accentColor}`, background: level === "danger" ? "rgba(224,90,51,0.06)" : level === "warning" ? "rgba(212,160,60,0.04)" : "rgba(90,138,106,0.03)" }}>
      {task.blockerBadge && (
        <div style={styles.blockerBadge}>
          <span>⚡ Added as blocker</span>
          <button style={styles.badgeDismiss} onClick={(e) => { e.stopPropagation(); onDismissBadge(task.id); }}>✕</button>
        </div>
      )}
      <div style={styles.cardHeader} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.cardTitle}>{task.title}</div>
          <div style={styles.cardMeta}>
            Touched {formatTimeAgo(task.lastTouched)} · {task.totalWeight}wt
            {level === "danger" && <span style={{ color: "#e05a33", fontWeight: 600 }}> · needs attention</span>}
            {level === "warning" && <span style={{ color: "#d4a03c", fontWeight: 600 }}> · getting stale</span>}
          </div>
        </div>
        <div style={styles.progressBadge}>
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke={accentColor} strokeWidth="3"
              strokeDasharray={`${task.progress * 0.9425} 94.25`} strokeLinecap="round"
              transform="rotate(-90 18 18)" style={{ transition: "stroke-dasharray 0.5s ease" }} />
            <text x="18" y="19.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--text-primary)">{task.progress}%</text>
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div style={styles.cardBody}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Progress</label>
            <input type="range" min="0" max="100" value={task.progress}
              onChange={(e) => onUpdate({ ...task, progress: Number(e.target.value), lastTouched: new Date().toISOString() })}
              style={styles.slider} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Notes</label>
            <textarea style={styles.textarea} value={task.notes || ""}
              onChange={(e) => onUpdate({ ...task, notes: e.target.value, lastTouched: new Date().toISOString() })}
              placeholder="What's the next concrete step?" rows={2} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <button style={styles.btnTouch} onClick={() => onUpdate({ ...task, lastTouched: new Date().toISOString() })}>
              Mark touched
            </button>
            <button style={styles.btnComplete} onClick={() => onComplete(task.id)}>
              ✓ Complete
            </button>
            <button style={styles.btnGhost} onClick={() => onRemove(task.id)}>Abandon</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty Slot ────────────────────────────────────────────────────────────────

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

// ── Main App ──────────────────────────────────────────────────────────────────

export default function FocusFive({ onNavigate }) {
  const [allTasks, setAllTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [ntfyConfig, setNtfyConfig] = useState({ server: "https://ntfy.sh", topic: "", reminderHour: 9, enabled: false });
  const [activeWeight, setActiveWeight] = useState(0);
  const [weightThreshold, setWeightThreshold] = useState(60);
  const [backlogAvailable, setBacklogAvailable] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [showSwap, setShowSwap] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showNtfy, setShowNtfy] = useState(false);
  const [toast, setToast] = useState(null);
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    const data = await api.getAll();
    setAllTasks(data.tasks || []);
    if (data.ntfyConfig) setNtfyConfig(data.ntfyConfig);
    setActiveWeight(data.activeWeight || 0);
    setWeightThreshold(data.weightThreshold || 60);
    setBacklogAvailable(data.backlogAvailable || false);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
  }, [refresh]);

  const activeTasks = allTasks.filter((t) => t.status === "active");

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    if (activeTasks.length >= SLOT_COUNT) { setShowSwap(true); return; }
    const task = {
      id: generateId(), title, progress: 0, notes: "",
      createdAt: new Date().toISOString(), lastTouched: new Date().toISOString(),
      status: "active",
      weights: { deadline: 3, impact: 3, dependency: 1, avoidance: 1, decay: 1 },
    };
    setAllTasks((prev) => [...prev, { ...task, totalWeight: 9, blockerBadge: false, unlocks: [] }]);
    api.addTask(task).catch(console.error);
    setNewTitle("");
    setExpandedId(task.id);
  };

  const swapTask = (removeId) => {
    const task = {
      id: generateId(), title: newTitle.trim(), progress: 0, notes: "",
      createdAt: new Date().toISOString(), lastTouched: new Date().toISOString(),
      status: "active",
      weights: { deadline: 3, impact: 3, dependency: 1, avoidance: 1, decay: 1 },
    };
    setAllTasks((prev) => prev.filter((t) => t.id !== removeId));
    api.deleteTask(removeId).catch(console.error);
    setAllTasks((prev) => [...prev, { ...task, totalWeight: 9, blockerBadge: false, unlocks: [] }]);
    api.addTask(task).catch(console.error);
    setNewTitle(""); setShowSwap(false); setExpandedId(task.id);
  };

  const removeTask = (id) => {
    setAllTasks((prev) => prev.filter((t) => t.id !== id));
    api.deleteTask(id).catch(console.error);
    if (expandedId === id) setExpandedId(null);
  };

  const updateTask = (updated) => {
    setAllTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    api.updateTask(updated).catch(console.error);
  };

  const completeTask = async (id) => {
    try {
      const result = await api.completeTask(id);
      setToast(result.earned);
      if (expandedId === id) setExpandedId(null);
      await refresh();
    } catch (err) { console.error(err); }
  };

  const dismissBadge = (id) => {
    setAllTasks((prev) => prev.map((t) => t.id === id ? { ...t, blockerBadge: false } : t));
    api.dismissBadge(id).catch(console.error);
  };

  const neglectedCount = activeTasks.filter((t) => getNeglectLevel(t.lastTouched) !== "ok").length;
  const avgProgress = activeTasks.length ? Math.round(activeTasks.reduce((s, t) => s + t.progress, 0) / activeTasks.length) : 0;

  if (!loaded) {
    return <div style={styles.container}><div style={{ textAlign: "center", padding: 60, opacity: 0.5 }}>Loading…</div></div>;
  }

  return (
    <div style={styles.container}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {toast !== null && <EarnedToast earned={toast} onDone={() => setToast(null)} />}

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Focus Five</h1>
          <p style={styles.subtitle}>
            {activeTasks.length === 0
              ? "Add your top priorities. Max five."
              : `${activeTasks.length}/${SLOT_COUNT} slots · ${avgProgress}% avg · `}
            {activeTasks.length > 0 && (
              <span style={{ color: backlogAvailable ? "#5a8a6a" : "#d4a03c", fontWeight: 600 }}>
                {activeWeight}wt {backlogAvailable ? "· backlog open" : "· full load"}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {activeTasks.length > 0 && (
            <button style={styles.headerBtn} onClick={() => setShowCheckin(true)}>Check in</button>
          )}
          <button style={styles.headerBtn} onClick={() => onNavigate("manage")}>Manage</button>
          <button style={styles.headerBtn} onClick={() => setShowNtfy(true)}>
            {ntfyConfig.enabled ? "🔔" : "🔕"}
          </button>
        </div>
      </header>

      {neglectedCount > 0 && (
        <div style={styles.alertBar}>
          {neglectedCount === 1 ? "1 item needs attention" : `${neglectedCount} items need attention`} — you might be avoiding something
        </div>
      )}

      {backlogAvailable && activeTasks.length > 0 && (
        <div style={styles.backlogBar}>
          Active load below threshold — you can pull from your backlog on the Manage page
        </div>
      )}

      <div style={styles.inputRow}>
        <input ref={inputRef} style={styles.addInput} value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder={activeTasks.length >= SLOT_COUNT ? "At capacity — type to swap" : "What deserves a slot?"}
          maxLength={120} />
        <button style={{ ...styles.addBtn, opacity: newTitle.trim() ? 1 : 0.4 }} onClick={addTask} disabled={!newTitle.trim()}>
          {activeTasks.length >= SLOT_COUNT ? "Swap" : "Add"}
        </button>
      </div>

      <div style={styles.taskList}>
        {activeTasks.map((task) => (
          <TaskCard key={task.id} task={task} onUpdate={updateTask} onRemove={removeTask}
            onComplete={completeTask} onDismissBadge={dismissBadge}
            isExpanded={expandedId === task.id}
            onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)} />
        ))}
        {Array.from({ length: SLOT_COUNT - activeTasks.length }, (_, i) => (
          <EmptySlot key={`empty-${i}`} index={i} total={activeTasks.length} />
        ))}
      </div>

      <StatsPanel />

      <SwapModal show={showSwap} tasks={activeTasks} newTitle={newTitle} onSwap={swapTask} onCancel={() => setShowSwap(false)} />
      <CheckInModal show={showCheckin} tasks={activeTasks} onClose={() => setShowCheckin(false)}
        onRemove={removeTask} onComplete={completeTask} />
      <NtfyModal show={showNtfy} config={ntfyConfig} onClose={() => setShowNtfy(false)}
        onSave={async (cfg) => { setNtfyConfig(cfg); await api.saveConfig(cfg); }} />
    </div>
  );
}

const styles = {
  container: { fontFamily: "'DM Sans', sans-serif", maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px", color: "var(--text-primary, #1a1a1a)", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.2 },
  subtitle: { margin: "4px 0 0", fontSize: 13.5, opacity: 0.6, fontWeight: 500 },
  headerBtn: { background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "inherit" },
  alertBar: { background: "rgba(224,90,51,0.08)", border: "1px solid rgba(224,90,51,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, color: "#b04425", marginBottom: 12 },
  backlogBar: { background: "rgba(90,138,106,0.08)", border: "1px solid rgba(90,138,106,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, color: "#3d6b4a", marginBottom: 12 },
  inputRow: { display: "flex", gap: 8, marginBottom: 20 },
  addInput: { flex: 1, padding: "12px 14px", fontSize: 14, border: "2px solid rgba(0,0,0,0.08)", borderRadius: 10, outline: "none", fontFamily: "'DM Sans', sans-serif", background: "rgba(0,0,0,0.02)", color: "inherit" },
  addBtn: { padding: "12px 20px", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 10, background: "#2d3a33", color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" },
  taskList: { display: "flex", flexDirection: "column", gap: 8 },
  card: { borderRadius: 12, padding: "14px 16px", transition: "all 0.2s ease" },
  blockerBadge: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(212,160,60,0.12)", border: "1px solid rgba(212,160,60,0.25)", borderRadius: 8, padding: "5px 10px", marginBottom: 10, fontSize: 12, fontWeight: 600, color: "#8a6020" },
  badgeDismiss: { background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.6, padding: "0 2px", color: "inherit" },
  cardHeader: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer" },
  cardTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.3 },
  cardMeta: { fontSize: 12, opacity: 0.5, marginTop: 2, fontWeight: 500 },
  progressBadge: { flexShrink: 0 },
  cardBody: { marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" },
  fieldGroup: { marginBottom: 12 },
  label: { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.5, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "2px solid rgba(0,0,0,0.08)", borderRadius: 8, outline: "none", fontFamily: "'DM Sans', sans-serif", background: "rgba(0,0,0,0.02)", color: "inherit", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "2px solid rgba(0,0,0,0.08)", borderRadius: 8, outline: "none", fontFamily: "'DM Sans', sans-serif", resize: "vertical", background: "rgba(0,0,0,0.02)", color: "inherit", boxSizing: "border-box" },
  slider: { width: "100%", accentColor: "#5a8a6a", cursor: "pointer" },
  btnTouch: { background: "#5a8a6a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnComplete: { background: "#2d3a33", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnGhost: { background: "transparent", color: "inherit", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: 0.6 },
  btnPrimary: { background: "#2d3a33", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnSecondary: { background: "rgba(0,0,0,0.05)", color: "inherit", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnDanger: { background: "#e05a33", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  emptySlot: { borderRadius: 12, border: "2px dashed rgba(0,0,0,0.08)", padding: "18px 16px" },
  emptySlotInner: { display: "flex", alignItems: "center", gap: 10, justifyContent: "center" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" },
  modal: { background: "#fff", borderRadius: 16, padding: "28px 24px", maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 6px", fontSize: 20, fontWeight: 700 },
  modalDesc: { margin: "0 0 18px", fontSize: 14, opacity: 0.6, lineHeight: 1.5 },
  checkInItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(0,0,0,0.03)" },
  swapItem: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, background: "rgba(0,0,0,0.03)", border: "2px solid transparent", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: "inherit" },
  toast: { position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#2d3a33", color: "#fff", padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700, zIndex: 2000, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", animation: "fadeUp 0.3s ease" },
};
