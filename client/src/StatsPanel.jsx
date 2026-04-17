import { useState, useEffect } from "react";
import { api } from "./api.js";

const fmt = (n) => n.toLocaleString();

const PaceBar = ({ pacing }) => {
  if (pacing === null) return <span style={{ opacity: 0.4, fontSize: 13 }}>No data yet</span>;
  const pct = Math.min(Math.round(pacing * 100), 200);
  const color = pacing >= 1 ? "#5a8a6a" : pacing >= 0.5 ? "#d4a03c" : "#e05a33";
  const label = pacing >= 1.2 ? "Ahead of pace" : pacing >= 0.9 ? "On pace" : pacing >= 0.5 ? "Behind pace" : "Well behind";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
        <span style={{ fontSize: 13, opacity: 0.6 }}>{pct}% of avg day</span>
      </div>
      <div style={{ height: 6, background: "rgba(0,0,0,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
};

const Sparkline = ({ weekData }) => {
  if (!weekData?.length) return null;
  const max = Math.max(...weekData.map((d) => d.total), 1);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 44, marginTop: 12 }}>
      {weekData.map((d) => {
        const h = Math.max(4, Math.round((d.total / max) * 40));
        const isToday = d.date === today;
        const day = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
        return (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 10, opacity: 0.4, fontWeight: isToday ? 700 : 400 }}>{d.total || ""}</div>
            <div style={{ width: "100%", height: h, background: isToday ? "#2d3a33" : "rgba(0,0,0,0.12)", borderRadius: 3, transition: "height 0.4s ease" }} />
            <div style={{ fontSize: 10, opacity: isToday ? 0.8 : 0.4, fontWeight: isToday ? 700 : 400 }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
};

export default function StatsPanel() {
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || stats) return;
    setLoading(true);
    api.getStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, [open]);

  return (
    <div style={styles.wrap}>
      <button style={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span style={{ fontWeight: 700 }}>Focus Score</span>
        <span style={{ opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={styles.body}>
          {loading && <div style={{ textAlign: "center", padding: 24, opacity: 0.5 }}>Loading…</div>}
          {stats && (
            <>
              {/* Earned totals */}
              <div style={styles.grid3}>
                <div style={styles.scoreCard}>
                  <div style={styles.scoreLabel}>Today</div>
                  <div style={styles.scoreNum}>{fmt(stats.earnedToday)}</div>
                  <div style={styles.scoreUnit}>pts</div>
                </div>
                <div style={styles.scoreCard}>
                  <div style={styles.scoreLabel}>This week</div>
                  <div style={styles.scoreNum}>{fmt(stats.earnedWeek)}</div>
                  <div style={styles.scoreUnit}>pts</div>
                </div>
                <div style={styles.scoreCard}>
                  <div style={styles.scoreLabel}>This month</div>
                  <div style={styles.scoreNum}>{fmt(stats.earnedMonth)}</div>
                  <div style={styles.scoreUnit}>pts</div>
                </div>
              </div>

              {/* Records */}
              <div style={styles.grid2}>
                <div style={styles.recordCard}>
                  <div style={styles.scoreLabel}>Best day</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{stats.bestDay ? fmt(stats.bestDay.total) : "—"}</div>
                  {stats.bestDay && <div style={{ fontSize: 11, opacity: 0.5 }}>{stats.bestDay.date}</div>}
                </div>
                <div style={styles.recordCard}>
                  <div style={styles.scoreLabel}>Best 7-day</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{stats.bestWeek ? fmt(stats.bestWeek) : "—"}</div>
                </div>
              </div>

              {/* Pacing */}
              <div style={styles.section}>
                <div style={{ ...styles.scoreLabel, marginBottom: 8 }}>Today's pacing</div>
                <PaceBar pacing={stats.pacing} />
              </div>

              {/* Sparkline */}
              <div style={styles.section}>
                <div style={styles.scoreLabel}>Last 7 days</div>
                <Sparkline weekData={stats.weekData} />
              </div>

              {/* Recent completions */}
              {stats.recent?.length > 0 && (
                <div style={styles.section}>
                  <div style={{ ...styles.scoreLabel, marginBottom: 8 }}>Recent completions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {stats.recent.map((r) => (
                      <div key={r.id} style={styles.recentRow}>
                        <span style={{ flex: 1, fontSize: 13 }}>{r.task_title}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#5a8a6a" }}>+{r.weight}</span>
                        <span style={{ fontSize: 11, opacity: 0.4, marginLeft: 10 }}>
                          {new Date(r.earned_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button style={styles.refreshBtn} onClick={() => { setStats(null); setLoading(true); api.getStats().then(setStats).finally(() => setLoading(false)); }}>
                Refresh
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { marginTop: 32, borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" },
  toggle: { width: "100%", display: "flex", justifyContent: "space-between", padding: "14px 18px", background: "rgba(0,0,0,0.03)", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "inherit" },
  body: { padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  scoreCard: { background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: "12px 14px", textAlign: "center" },
  recordCard: { background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: "12px 14px" },
  scoreLabel: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.45, marginBottom: 4 },
  scoreNum: { fontSize: 26, fontWeight: 700, lineHeight: 1 },
  scoreUnit: { fontSize: 11, opacity: 0.4, marginTop: 2 },
  section: { paddingTop: 4 },
  recentRow: { display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" },
  refreshBtn: { alignSelf: "flex-end", background: "transparent", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: 0.6 },
};
