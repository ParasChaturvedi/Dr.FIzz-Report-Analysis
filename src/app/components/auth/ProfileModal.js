// src/app/components/auth/ProfileModal.js
// Profile popup opened from the sidebar Profile button: change photo, view
// email + account info, and edit the display name (username).
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthUser } from "./authContext";

const FONT = "var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif";

function initialsOf(u) {
  const s = (u?.name || u?.email || "U").trim();
  const p = s.split(/[.\s@]+/).filter(Boolean);
  return ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
}

// Resize any picked image to a centre-cropped square data-URL (keeps storage tiny).
function fileToSquareDataURL(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export default function ProfileModal({ open, onClose }) {
  const auth = useAuthUser();
  const user = auth?.user;
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setAvatar(user?.avatar || null);
      setError(""); setMsg("");
    }
  }, [open]); // eslint-disable-line

  if (!open || !user) return null;
  const isAdmin = (user.role || "user") === "admin";

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Please choose an image file.");
    try {
      const url = await fileToSquareDataURL(f, 256);
      if (url.length > 900000) return setError("That image is too large — try a smaller one.");
      setAvatar(url); setError("");
    } catch { setError("Couldn't read that image."); }
  };

  const save = async () => {
    setSaving(true); setError(""); setMsg("");
    try {
      const r = await fetch("/api/auth/user/profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, avatar }),
      });
      const d = await r.json().catch(() => ({}));
      setSaving(false);
      if (!r.ok) return setError(d.error || "Could not save.");
      auth?.setUser?.(d.user);
      setMsg("Saved!");
      setTimeout(() => onClose?.(), 550);
    } catch {
      setSaving(false); setError("Network error. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed" style={{ background: "rgba(10,10,15,0.5)", fontFamily: FONT }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-[420px] rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F1F1F4" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Profile</div>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 grid place-items-center rounded-lg hover:bg-[#F3F4F6]" style={{ color: "#6B7280", fontSize: 18 }}>×</button>
        </div>

        <div className="px-5 py-5">
          {/* avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="rounded-full overflow-hidden grid place-items-center" style={{ height: 88, width: 88, border: "1px solid #000", background: "#fff" }}>
                {avatar
                  ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                  : <span style={{ fontSize: 30, fontWeight: 700, color: "#111" }}>{initialsOf(user)}</span>}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full grid place-items-center shadow"
                style={{ background: "#111", color: "#fff", border: "2px solid #fff", fontSize: 14 }}
              >📷</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
            <div className="flex items-center gap-3 mt-3" style={{ fontSize: 13 }}>
              <button onClick={() => fileRef.current?.click()} style={{ color: "#111", fontWeight: 600 }}>Change photo</button>
              {avatar && <button onClick={() => setAvatar(null)} style={{ color: "#DC2626", fontWeight: 600 }}>Remove</button>}
            </div>
          </div>

          {/* name */}
          <div className="mt-5">
            <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Username</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Your name"
              className="w-full rounded-xl px-4 outline-none focus:border-[#111]"
              style={{ height: 46, border: "1.5px solid #E5E7EB", fontSize: 14.5, color: "#111" }}
            />
          </div>

          {/* email (read-only) */}
          <div className="mt-4">
            <label className="block mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Email</label>
            <div className="w-full rounded-xl px-4 flex items-center" style={{ height: 46, background: "#F7F7F9", border: "1.5px solid #EEEEF1", fontSize: 14.5, color: "#6B7280" }}>
              {user.email}
            </div>
          </div>

          {/* account info */}
          <div className="flex items-center gap-2 mt-4">
            <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, fontWeight: 600, background: isAdmin ? "#EEF2FF" : "#F3F4F6", color: isAdmin ? "#4338CA" : "#374151" }}>
              {isAdmin ? "Admin" : "User"}
            </span>
            <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, fontWeight: 600, background: "#FEF3C7", color: "#92400E" }}>
              {isAdmin ? "Unlimited credits" : `${user.credits} credits`}
            </span>
            <span className="rounded-full px-2.5 py-1" style={{ fontSize: 11.5, fontWeight: 600, background: "#ECFDF5", color: "#047857" }}>
              {user.provider === "google" ? "Google" : user.provider === "both" ? "Email + Google" : "Email"}
            </span>
          </div>

          {error && <div className="mt-4 rounded-lg px-3 py-2 text-center" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: 13 }}>{error}</div>}
          {msg && <div className="mt-4 rounded-lg px-3 py-2 text-center" style={{ background: "rgba(5,150,105,0.10)", color: "#047857", fontSize: 13 }}>{msg}</div>}

          {/* footer */}
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 rounded-xl hover:bg-[#F3F4F6]" style={{ height: 46, border: "1.5px solid #E5E7EB", fontWeight: 600, fontSize: 14, color: "#374151" }}>Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 rounded-xl disabled:opacity-60" style={{ height: 46, background: "#111", color: "#fff", fontWeight: 600, fontSize: 14 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
