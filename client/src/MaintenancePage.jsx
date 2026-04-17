import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const STATUS_LABELS = { active: "Active", backlog: "Backlog", blocked: "Blocked", locked: "Locked", completed: "Completed" };
const STATUS_COLOR  = { active: "#5a8a6a", backlog: "#2d3a33", blocked: "#e05a33", locked: "#888", completed: "#999" };

const WEIGHT_DIMS = [
  { key: "deadline",   label: "Deadline",       lo: "Someday",      hi: "Today" },
  { key: "impact",     label: "Impact",          lo: "Trivial",      hi: "Catastrophic" },
  { key: "dependency", label: "Dependency",      lo: "Only me",      hi: "Blocking others" },
  { key: "avoidance",  label: "Avoidance risk",  lo: "Easy to start",hi: "Keep avoiding" },
  { key: "decay",      label: "Decay",           lo: "Static",       hi: "Gets worse fast" },
];

const computeWeight = (w) => (w.deadline ?? 3) + (w.impact ?? 3) + (w.dependency ?? 1) + (w.avoidance ?? 1) + (w.decay ?? 1);

// ── Weight Sliders ────────────────────────────────────────────────────────────

function WeightSliders({ weights, onChange }) {
  return (
    <div>
      {WEIGHT_DIMS.map(({ key, label, lo, hi }) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={s.dimLabel}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{weights[key]}/5</span>
          </div>
          <input type="range" min="1" max="5" value={weights[key]}
            onChange={(e) => onChange({ ...weights, [key]: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "#5a8a6a", cursor: "pointer" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={s.rangeLabel}>{lo}</span>
            <span style={s.rangeLabel}>{hi}</span>
          </div>
        </div>
      ))}
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
        Total weight: <span style={{ color: "#5a8a6a" }}>{computeWeight(weights)}</span> / 25
      </div>
    </div>
  );
}

// ── Block Modal ───────────────────────────────────────────────────────────────

function BlockModal({ task, onConfirm, onCancel }) {
  const [blockerTitle, setBlockerTitle] = useState("");
  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.modalTitle}>What's blocking it?</h2>
        <p style={s.modalDesc}>
          <strong>"{task.title}"</strong> will move off the active list. A new high-priority task will be added for the blocker.
        </p>
        <input style={s.input} value={blockerTitle} onChange={(e) => setBlockerTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && blockerTitle.trim() && onConfirm(blockerTitle)}
          placeholder="e.g. Wait for client approval" autoFocus />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={s.btnPrimary} disabled={!blockerTitle.trim()} onClick={() => onConfirm(blockerTitle)}>Add blocker</button>
          <button style={s.btnGhost} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Unlock Picker ─────────────────────────────────────────────────────────────

function UnlockPicker({ task, allTasks, onSave, onClose }) {
  const candidates = allTasks.filter((t) => t.id !== task.id && t.status !== "completed");
  const [selected, setSelected] = useState(new Set(task.unlocks || []));
  const toggle = (id) => setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.modalTitle}>Unlocks when completed</h2>
        <p style={s.modalDesc}>These backlog/locked tasks will become available when <strong>"{task.title}"</strong> is completed.</p>
        {candidates.length === 0 ? (
          <p style={{ opacity: 0.5, fontSize: 14 }}>No other tasks yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
            {candidates.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <span style={{ flex: 1, fontSize: 14 }}>{t.title}</span>
                <span style={{ fontSize: 11, opacity: 0.5, padding: "2px 6px", background: "rgba(0,0,0,0.06)", borderRadius: 4 }}>{STATUS_LABELS[t.status]}</span>
              </label>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button style={s.btnPrimary} onClick={() => { onSave([...selected]); onClose(); }}>Save</button>
          <button style={s.btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, allTasks, onUpdate, onDelete, onComplete, onBlock, onPromote, expanded, onToggle }) {
  const [weights, setWeights] = useState(task.weights || { deadline: 3, impact: 3, dependency: 1, avoidance: 1, decay: 1 });
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || "");
  const [progress, setProgress] = useState(task.progress);
  const [showUnlockPicker, setShowUnlockPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  const blockerTask = task.blockedById ? allTasks.find((t) => t.id === task.blockedById) : null;
  const unlockedBy = allTasks.find((t) => (t.unlocks || []).includes(task.id));
  const unlockNames = (task.unlocks || []).map((id) => allTasks.find((t) => t.id === id)?.title).filter(Boolean);

  const save = () => {
    onUpdate({ ...task, title, notes, progress, weights, lastTouched: new Date().toISOString() });
    setDirty(false);
  };

  const mark = (field, val) => { if (field === "weights") setWeights(val); if (field === "title") setTitle(val); if (field === "notes") setNotes(val); if (field === "progress") setProgress(val); setDirty(true); };

  return (
    <>
      <div style={{ ...s.taskRow, borderLeft: `3px solid ${STATUS_COLOR[task.status] || "#ccc"}` }}>
        <div style={s.taskRowHeader} onClick={onToggle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</span>
              <span style={{ ...s.statusBadge, background: `${STATUS_COLOR[task.status]}22`, color: STATUS_COLOR[task.status] }}>
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            <div style={s.rowMeta}>
              {task.totalWeight}wt
              {task.status === "blocked" && blockerTask && <> · blocked by "{blockerTask.title}"</>}
              {task.status === "locked" && unlockedBy && <> · waiting on "{unlockedBy.title}"</>}
              {unlockNames.length > 0 && <> · unlocks {unlockNames.length} task{unlockNames.length > 1 ? "s" : ""}</>}
            </div>
          </div>
          <span style={{ opacity: 0.4, fontSize: 13 }}>{expanded ? "▲" : "▼"}</span>
        </div>

        {expanded && (
          <div style={s.taskRowBody}>
            {/* Title */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Title</label>
              <input style={s.input} value={title} onChange={(e) => mark("title", e.target.value)} />
            </div>

            {/* Progress */}
            {task.status !== "locked" && (
              <div style={s.fieldGroup}>
                <label style={s.label}>Progress — {progress}%</label>
                <input type="range" min="0" max="100" value={progress}
                  onChange={(e) => mark("progress", Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#5a8a6a" }} />
              </div>
            )}

            {/* Notes */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Notes</label>
              <textarea style={s.textarea} value={notes} onChange={(e) => mark("notes", e.target.value)} rows={2} placeholder="Next step?" />
            </div>

            {/* Weights */}
            {task.status !== "completed" && (
              <div style={{ ...s.fieldGroup, paddingTop: 4 }}>
                <label style={s.label}>Weights</label>
                <WeightSliders weights={weights} onChange={(w) => mark("weights", w)} />
              </div>
            )}

            {dirty && (
              <button style={{ ...s.btnPrimary, marginBottom: 8 }} onClick={save}>Save changes</button>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.status === "backlog" && (
                <button style={s.btnAction} onClick={() => onPromote(task.id)}>→ Promote to active</button>
              )}
              {task.status === "locked" && (
                <button style={s.btnAction} onClick={() => onPromote(task.id)}>→ Move to backlog</button>
              )}
              {(task.status === "active" || task.status === "backlog") && (
                <button style={s.btnAction} onClick={() => onBlock(task)}>⛔ Mark blocked</button>
              )}
              {task.status !== "completed" && (
                <>
                  <button style={s.btnComplete} onClick={() => onComplete(task.id)}>✓ Complete</button>
                  <button style={s.btnGhost} onClick={() => setShowUnlockPicker(true)}>
                    🔓 Unlocks ({(task.unlocks || []).length})
                  </button>
                </>
              )}
              <button style={s.btnDelete} onClick={() => onDelete(task.id)}>Delete</button>
            </div>
          </div>
        )}
      </div>

      {showUnlockPicker && (
        <UnlockPicker task={task} allTasks={allTasks}
          onSave={(unlocks) => onUpdate({ ...task, unlocks })}
          onClose={() => setShowUnlockPicker(false)} />
      )}
    </>
  );
}

// ── Maintenance Page ──────────────────────────────────────────────────────────

const ALL_STATUSES = ["active", "backlog", "blocked", "locked", "completed"];

export default function MaintenancePage({ onNavigate }) {
  const [allTasks, setAllTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("active");
  const [expandedId, setExpandedId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState("backlog");
  const [weightThreshold, setWeightThreshold] = useState(60);
  const [thresholdDirty, setThresholdDirty] = useState(false);
  const [blockingTask, setBlockingTask] = useState(null);
  const [activeCount, setActiveCount] = useState(0);

  const refresh = useCallback(async () => {
    const data = await api.getAll();
    setAllTasks(data.tasks || []);
    setWeightThreshold(data.weightThreshold || 60);
    setActiveCount((data.tasks || []).filter((t) => t.status === "active").length);
  }, []);

  useEffect(() => { refresh().finally(() => setLoaded(false)); setLoaded(true); }, [refresh]);

  const visible = allTasks.filter((t) => t.status === filter);

  const counts = Object.fromEntries(ALL_STATUSES.map((st) => [st, allTasks.filter((t) => t.status === st).length]));

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    if (newStatus === "active" && activeCount >= 5) return alert("Already at 5 active tasks — promote from backlog or remove one.");
    const task = {
      id: generateId(), title, progress: 0, notes: "",
      createdAt: new Date().toISOString(), lastTouched: new Date().toISOString(),
      status: newStatus,
      weights: { deadline: 3, impact: 3, dependency: 1, avoidance: 1, decay: 1 },
    };
    await api.addTask(task);
    setNewTitle("");
    setFilter(newStatus);
    await refresh();
  };

  const updateTask = async (updated) => {
    await api.updateTask(updated);
    await refresh();
  };

  const deleteTask = async (id) => {
    if (!confirm("Delete this task permanently?")) return;
    await api.deleteTask(id);
    if (expandedId === id) setExpandedId(null);
    await refresh();
  };

  const completeTask = async (id) => {
    const result = await api.completeTask(id);
    if (expandedId === id) setExpandedId(null);
    await refresh();
    if (result.unlockedCount) alert(`✓ Completed! ${result.unlockedCount} task${result.unlockedCount > 1 ? "s" : ""} unlocked.`);
  };

  const promoteTask = async (id) => {
    const task = allTasks.find((t) => t.id === id);
    if (!task) return;
    const targetStatus = task.status === "locked" ? "backlog" : "active";
    if (targetStatus === "active" && activeCount >= 5) return alert("Already at 5 active tasks.");
    await api.updateTask({ ...task, status: targetStatus });
    await refresh();
  };

  const handleBlock = (task) => setBlockingTask(task);

  const confirmBlock = async (blockerTitle) => {
    if (!blockingTask) return;
    await api.blockTask(blockingTask.id, blockerTitle);
    setBlockingTask(null);
    setFilter("active");
    await refresh();
  };

  const saveThreshold = async () => {
    await api.saveThreshold(weightThreshold);
    setThresholdDirty(false);
  };

  if (!loaded) return (
    <div style={s.container}>
      <div style={{ textAlign: "center", padding: 60, opacity: 0.5 }}>Loading…</div>
    </div>
  );

  return (
    <div style={s.container}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <header style={s.header}>
        <div>
          <h1 style={s.title}>Manage Tasks</h1>
          <p style={s.subtitle}>{allTasks.length} total · {counts.active} active · {counts.backlog} backlog</p>
        </div>
        <button style={s.backBtn} onClick={() => onNavigate("main")}>← Focus Five</button>
      </header>

      {/* Add task */}
      <div style={s.addBox}>
        <div style={s.addRow}>
          <input style={{ ...s.input, flex: 1 }} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder="New task title…" maxLength={120} />
          <select style={{ ...s.input, width: "auto", flex: "0 0 auto" }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="backlog">Backlog</option>
            <option value="locked">Locked</option>
          </select>
          <button style={{ ...s.btnPrimary, whiteSpace: "nowrap" }} onClick={addTask} disabled={!newTitle.trim()}>Add</button>
        </div>
      </div>

      {/* Weight threshold config */}
      <div style={s.configBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={s.label}>Backlog threshold — {weightThreshold}wt</label>
          {thresholdDirty && <button style={s.btnSave} onClick={saveThreshold}>Save</button>}
        </div>
        <input type="range" min="10" max="125" value={weightThreshold}
          onChange={(e) => { setWeightThreshold(Number(e.target.value)); setThresholdDirty(true); }}
          style={{ width: "100%", accentColor: "#5a8a6a" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={s.rangeLabel}>Light load (10)</span>
          <span style={s.rangeLabel}>Full capacity (125)</span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.5 }}>
          When active task weight total falls below this, the backlog indicator appears on the main page.
        </p>
      </div>

      {/* Status tabs */}
      <div style={s.tabs}>
        {ALL_STATUSES.map((st) => (
          <button key={st} style={{ ...s.tab, ...(filter === st ? s.tabActive : {}) }} onClick={() => setFilter(st)}>
            {STATUS_LABELS[st]}
            {counts[st] > 0 && <span style={s.tabCount}>{counts[st]}</span>}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", opacity: 0.4, fontSize: 14 }}>
            No {STATUS_LABELS[filter].toLowerCase()} tasks
          </div>
        ) : (
          visible.map((task) => (
            <TaskRow key={task.id} task={task} allTasks={allTasks}
              onUpdate={updateTask} onDelete={deleteTask} onComplete={completeTask}
              onBlock={handleBlock} onPromote={promoteTask}
              expanded={expandedId === task.id}
              onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)} />
          ))
        )}
      </div>

      {blockingTask && (
        <BlockModal task={blockingTask} onConfirm={confirmBlock} onCancel={() => setBlockingTask(null)} />
      )}
    </div>
  );
}

const s = {
  container: { fontFamily: "'DM Sans', sans-serif", maxWidth: 680, margin: "0 auto", padding: "24px 16px 60px", color: "var(--text-primary, #1a1a1a)", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px" },
  subtitle: { margin: "4px 0 0", fontSize: 13.5, opacity: 0.5 },
  backBtn: { background: "rgba(0,0,0,0.05)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "inherit", whiteSpace: "nowrap" },
  addBox: { background: "rgba(0,0,0,0.02)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 },
  addRow: { display: "flex", gap: 8 },
  configBox: { background: "rgba(90,138,106,0.05)", border: "1px solid rgba(90,138,106,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 },
  tabs: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" },
  tab: { background: "rgba(0,0,0,0.04)", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "inherit", display: "flex", alignItems: "center", gap: 6 },
  tabActive: { background: "#2d3a33", color: "#fff" },
  tabCount: { fontSize: 11, background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "1px 6px" },
  taskRow: { background: "rgba(0,0,0,0.02)", borderRadius: 10, overflow: "hidden" },
  taskRowHeader: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" },
  taskRowBody: { padding: "0 16px 16px", borderTop: "1px solid rgba(0,0,0,0.05)" },
  rowMeta: { fontSize: 12, opacity: 0.45, marginTop: 3, fontWeight: 500 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, flexShrink: 0 },
  fieldGroup: { marginBottom: 12, marginTop: 12 },
  label: { display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.5, marginBottom: 6 },
  dimLabel: { fontSize: 12, fontWeight: 600, opacity: 0.6 },
  rangeLabel: { fontSize: 11, opacity: 0.4 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "2px solid rgba(0,0,0,0.08)", borderRadius: 8, outline: "none", fontFamily: "'DM Sans', sans-serif", background: "rgba(0,0,0,0.02)", color: "inherit", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "2px solid rgba(0,0,0,0.08)", borderRadius: 8, outline: "none", fontFamily: "'DM Sans', sans-serif", resize: "vertical", background: "rgba(0,0,0,0.02)", color: "inherit", boxSizing: "border-box" },
  btnPrimary: { background: "#2d3a33", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnSave: { background: "#5a8a6a", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnAction: { background: "rgba(0,0,0,0.05)", color: "inherit", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnComplete: { background: "#5a8a6a", color: "#fff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  btnGhost: { background: "transparent", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "inherit" },
  btnDelete: { background: "rgba(224,90,51,0.08)", color: "#c04020", border: "1px solid rgba(224,90,51,0.15)", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" },
  modal: { background: "#fff", borderRadius: 16, padding: "28px 24px", maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 6px", fontSize: 20, fontWeight: 700 },
  modalDesc: { margin: "0 0 18px", fontSize: 14, opacity: 0.6, lineHeight: 1.5 },
};
