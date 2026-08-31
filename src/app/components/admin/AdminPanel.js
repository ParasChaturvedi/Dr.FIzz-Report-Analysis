// src/app/components/admin/AdminPanel.js
// Admin-only dashboard overlay: every user, their credits/role (editable), and
// a live activity trail of what each user did in the tool. Data from
// /api/admin/overview (admin-gated server-side).
"use client";

import { useCallback, useEffect, useState } from "react";

const FONT = "var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif";

function fmtDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}
function fmtWhen(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d), diff = (Date.now() - dt.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  } catch { return "—"; }
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl px-5 py-4" style={{ background: "#fff", border: "1px solid #ECECEF" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#111", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export default function AdminPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // { user, activity }
  const [editing, setEditing] = useState(null); // userId being credit-edited
  const [creditVal, setCreditVal] = useState("");
  const [costs, setCosts] = useState(null); // realtime per-domain cost (usage_log)

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/overview", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Failed to load."); setData(null); }
      else setData(d);
      try { const cr = await fetch("/api/admin/costs", { cache: "no-store" }); const cd = await cr.json().catch(() => ({})); if (cr.ok) setCosts(cd); } catch {}
    } catch { setError("Network error."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openUser = async (u) => {
    setSelected({ user: u, activity: null });
    try {
      const r = await fetch(`/api/admin/overview?userId=${encodeURIComponent(u.id)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setSelected({ user: u, activity: d.activity || [] });
    } catch { setSelected({ user: u, activity: [] }); }
  };

  const saveCredits = async (u) => {
    const credits = Number(creditVal);
    if (Number.isNaN(credits)) return;
    await fetch("/api/admin/user-update", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id, credits }) });
    setEditing(null); setCreditVal(""); load();
  };
  const toggleRole = async (u) => {
    const role = u.role === "admin" ? "user" : "admin";
    if (!window.confirm(`Make ${u.email} a${role === "admin" ? "n admin" : " normal user"}?`)) return;
    await fetch("/api/admin/user-update", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id, role }) });
    load();
  };

  const users = data?.users || [];
  const activity = selected?.activity ?? data?.activity ?? [];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_tr]:cursor-pointer" style={{ background: "rgba(10,10,15,0.55)", fontFamily: FONT }}>
      <div className="w-full max-w-[1080px] max-h-[92vh] rounded-2xl overflow-hidden flex flex-col" style={{ background: "#F7F7F9", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid #ECECEF" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>Admin Dashboard</div>
            <div style={{ fontSize: 12.5, color: "#6B7280" }}>Users, roles, credits & activity</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]" style={{ fontSize: 13, fontWeight: 600, color: "#374151", border: "1px solid #E5E7EB" }}>Refresh</button>
            <button onClick={onClose} aria-label="Close" className="rounded-lg h-9 w-9 grid place-items-center hover:bg-[#F3F4F6]" style={{ border: "1px solid #E5E7EB", color: "#374151", fontSize: 18 }}>×</button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-center py-16" style={{ color: "#6B7280" }}>Loading…</div>}
          {error && <div className="text-center py-16" style={{ color: "#DC2626" }}>{error}</div>}

          {!loading && !error && data && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <Stat label="Total users" value={data.stats?.totalUsers ?? 0} />
                <Stat label="Admins" value={data.stats?.admins ?? 0} accent="#4338CA" />
                <Stat label="Activity events" value={data.stats?.totalEvents ?? 0} accent="#B45309" />
              </div>

              {/* Realtime cost per project (from usage_log, INR at 1 USD = Rs {rate}) */}
              {costs && (
                <div className="rounded-xl overflow-hidden mb-5" style={{ background: "#fff", border: "1px solid #ECECEF" }}>
                  <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: "1px solid #F1F1F4" }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: "#111" }}>Cost per project — realtime (1 USD = Rs {costs.rate})</span>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>last {costs.days} days · {costs.count} project(s)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4" style={{ borderBottom: "1px solid #F1F1F4" }}>
                    <Stat label="Total spend" value={`Rs ${costs.totals?.inr ?? 0}`} />
                    <Stat label="Avg / project" value={`Rs ${costs.totals?.avgINR ?? 0}`} accent="#C35328" />
                    <Stat label="Claude" value={`Rs ${costs.totals?.claudeINR ?? 0}`} accent="#4338CA" />
                    <Stat label="Other APIs" value={`Rs ${costs.totals?.apiINR ?? 0}`} accent="#B45309" />
                  </div>
                  <div className="overflow-x-auto" style={{ maxHeight: 240 }}>
                    <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
                      <thead><tr style={{ color: "#6B7280", textAlign: "left" }}>
                        <th className="px-4 py-2 font-medium">Project (domain)</th>
                        <th className="px-2 py-2 font-medium">Total</th>
                        <th className="px-2 py-2 font-medium">Claude</th>
                        <th className="px-2 py-2 font-medium">API</th>
                        <th className="px-3 py-2 font-medium">Calls</th>
                      </tr></thead>
                      <tbody>
                        {(costs.domains || []).map((d) => (
                          <tr key={d.domain} style={{ borderTop: "1px solid #F1F1F4" }}>
                            <td className="px-4 py-2.5" style={{ fontWeight: 600, color: "#111" }}>{d.domain}</td>
                            <td className="px-2 py-2.5" style={{ fontWeight: 700, color: "#111" }}>Rs {d.inr}</td>
                            <td className="px-2 py-2.5" style={{ color: "#4338CA" }}>Rs {d.claudeINR}</td>
                            <td className="px-2 py-2.5" style={{ color: "#6B7280" }}>Rs {d.apiINR}</td>
                            <td className="px-3 py-2.5" style={{ color: "#6B7280" }}>{d.calls}</td>
                          </tr>
                        ))}
                        {!(costs.domains || []).length && (
                          <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "#9CA3AF" }}>No cost logged yet (a report must be generated).</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2" style={{ fontSize: 11, color: "#9CA3AF", borderTop: "1px solid #F1F1F4" }}>
                    App-side (Vercel) cost only. The GEO scan engine runs on the VPS worker and is not counted here yet.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4">
                {/* users table */}
                <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #ECECEF" }}>
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid #F1F1F4", fontWeight: 600, fontSize: 13.5, color: "#111" }}>
                    Users ({users.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ color: "#6B7280", textAlign: "left" }}>
                          <th className="px-4 py-2 font-medium">User</th>
                          <th className="px-2 py-2 font-medium">Role</th>
                          <th className="px-2 py-2 font-medium">Credits</th>
                          <th className="px-2 py-2 font-medium">Actions</th>
                          <th className="px-3 py-2 font-medium">Last active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.id}
                            onClick={() => openUser(u)}
                            className="cursor-pointer hover:bg-[#F9FAFB]"
                            style={{ borderTop: "1px solid #F1F1F4", background: selected?.user?.id === u.id ? "#F5F3FF" : undefined }}
                          >
                            <td className="px-4 py-2.5">
                              <div style={{ fontWeight: 600, color: "#111" }}>{u.name}</div>
                              <div style={{ color: "#6B7280", fontSize: 12 }}>{u.email}</div>
                            </td>
                            <td className="px-2 py-2.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleRole(u); }}
                                className="rounded-full px-2.5 py-1"
                                style={{ fontSize: 11, fontWeight: 700, background: u.role === "admin" ? "#EEF2FF" : "#F3F4F6", color: u.role === "admin" ? "#4338CA" : "#374151" }}
                                title="Click to change role"
                              >
                                {u.role}
                              </button>
                            </td>
                            <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                              {editing === u.id ? (
                                <span className="flex items-center gap-1">
                                  <input value={creditVal} onChange={(e) => setCreditVal(e.target.value)} className="rounded border px-2 py-1 w-16" style={{ fontSize: 12, borderColor: "#D1D5DB" }} autoFocus />
                                  <button onClick={() => saveCredits(u)} style={{ color: "#059669", fontWeight: 700 }}>✓</button>
                                  <button onClick={() => { setEditing(null); setCreditVal(""); }} style={{ color: "#9CA3AF" }}>×</button>
                                </span>
                              ) : (
                                <button onClick={() => { setEditing(u.id); setCreditVal(String(u.credits)); }} className="hover:underline" style={{ color: "#111", fontWeight: 600 }} title="Click to edit">
                                  {u.role === "admin" ? "∞" : u.credits}
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-2.5" style={{ color: "#6B7280" }}>{u.activityCount} events</td>
                            <td className="px-3 py-2.5" style={{ color: "#6B7280" }}>{fmtWhen(u.lastActive)}</td>
                          </tr>
                        ))}
                        {!users.length && (
                          <tr><td colSpan={5} className="px-4 py-10 text-center" style={{ color: "#9CA3AF" }}>No users yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* activity feed */}
                <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: "#fff", border: "1px solid #ECECEF", maxHeight: 460 }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #F1F1F4" }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: "#111" }}>
                      {selected ? `${selected.user.name}'s activity` : "Recent activity"}
                    </span>
                    {selected && <button onClick={() => setSelected(null)} style={{ fontSize: 12, color: "#6B7280" }}>Show all</button>}
                  </div>
                  <div className="overflow-y-auto p-2">
                    {selected && selected.activity === null && <div className="text-center py-8" style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>}
                    {activity && activity.length === 0 && <div className="text-center py-8" style={{ color: "#9CA3AF", fontSize: 13 }}>No activity yet.</div>}
                    {activity && activity.map((a) => (
                      <div key={a.id} className="px-3 py-2.5 rounded-lg hover:bg-[#F9FAFB]">
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{a.detail || a.type}</span>
                          <span style={{ fontSize: 11.5, color: "#9CA3AF", whiteSpace: "nowrap" }}>{fmtWhen(a.at)}</span>
                        </div>
                        {!selected && <div style={{ fontSize: 11.5, color: "#6B7280" }}>{a.email}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
