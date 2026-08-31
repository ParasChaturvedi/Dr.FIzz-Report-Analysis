// src/app/components/auth/AccountControl.js
// Small floating account button (bottom-right, over the app). Opens a popover
// with the signed-in user, role, credits, Log out, and — for admins — the
// Admin panel. Self-contained; touches no existing component.
"use client";

import { useEffect, useRef, useState } from "react";
import AdminPanel from "../admin/AdminPanel";

const FONT = "var(--font-poppins), ui-sans-serif, system-ui, -apple-system, sans-serif";

function initials(user) {
  const s = (user?.name || user?.email || "U").trim();
  const parts = s.split(/[.\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
}

export default function AccountControl({ user, onLogout, onEditProfile }) {
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const ref = useRef(null);
  const isAdmin = (user?.role || "user") === "admin";

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;

  return (
    <>
      <div ref={ref} className="fixed z-[80] [&_button]:cursor-pointer" style={{ right: 20, bottom: 20, fontFamily: FONT }}>
        {open && (
          <div
            className="absolute bottom-[56px] right-0 rounded-2xl overflow-hidden"
            style={{ width: 268, background: "#fff", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", border: "1px solid #ECECEF" }}
          >
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #F1F1F4" }}>
              <div className="flex items-center gap-3">
                <div className="grid place-items-center rounded-full shrink-0 overflow-hidden" style={{ height: 40, width: 40, background: "#111", color: "#fff", fontWeight: 600, fontSize: 15 }}>
                  {user.avatar ? <img src={user.avatar} alt="" width={40} height={40} style={{ objectFit: "cover" }} /> : initials(user)}
                </div>
                <div className="min-w-0">
                  <div className="truncate" style={{ fontWeight: 600, color: "#111", fontSize: 14.5 }}>{user.name || "User"}</div>
                  <div className="truncate" style={{ color: "#6B7280", fontSize: 12.5 }}>{user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, fontWeight: 600, background: isAdmin ? "#EEF2FF" : "#F3F4F6", color: isAdmin ? "#4338CA" : "#374151" }}>
                  {isAdmin ? "Admin" : "User"}
                </span>
                <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, fontWeight: 600, background: "#FEF3C7", color: "#92400E" }}>
                  {isAdmin ? "Unlimited credits" : `${user.credits} credits`}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onEditProfile?.(); setOpen(false); }}
              className="w-full text-left px-4 py-3 hover:bg-[#F7F7F9] flex items-center gap-2.5"
              style={{ fontSize: 14, color: "#111", fontWeight: 500 }}
            >
              <span aria-hidden>👤</span> Profile settings
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => { setAdminOpen(true); setOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-[#F7F7F9] flex items-center gap-2.5"
                style={{ fontSize: 14, color: "#111", fontWeight: 500, borderTop: "1px solid #F1F1F4" }}
              >
                <span aria-hidden>🛡️</span> Admin panel
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="w-full text-left px-4 py-3 hover:bg-[#FEF2F2] flex items-center gap-2.5"
              style={{ fontSize: 14, color: "#DC2626", fontWeight: 500, borderTop: "1px solid #F1F1F4" }}
            >
              <span aria-hidden>⏻</span> Log out
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Account"
          className="grid place-items-center rounded-full overflow-hidden transition active:scale-95"
          style={{ height: 48, width: 48, background: "#111", color: "#fff", fontWeight: 600, fontSize: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", border: "2px solid #fff" }}
        >
          {user.avatar ? <img src={user.avatar} alt="" width={48} height={48} style={{ objectFit: "cover" }} /> : initials(user)}
        </button>
      </div>

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </>
  );
}
