// src/app/components/auth/AuthGate.js
// ─────────────────────────────────────────────────────────────────────────────
// The authentication gate. Wraps the WHOLE app in layout.js:
//   • checks the session (GET /api/auth/user/me) on load
//   • logged-out  → renders the auth screens (Get Started / Login / Signup)
//   • logged-in   → renders the existing app EXACTLY as-is ({children}) plus a
//                   small floating account control (+ Admin panel for admins)
//   • activity    → transparently logs meaningful tool actions for the admin
//                   panel by wrapping window.fetch + listening to the app's own
//                   `wizard:navigate` events — WITHOUT editing any existing file.
// page.js and every existing component stay 100% untouched.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useRef, useState } from "react";
import AuthScreens from "./AuthScreens";
import { RocketLogo, C } from "./AuthShell";
import AccountControl from "./AccountControl";
import ProfileModal from "./ProfileModal";
import { AuthUserContext } from "./authContext";

const FONT = "var(--font-poppins), ui-sans-serif, system-ui, -apple-system, sans-serif";

// Endpoints worth recording as "the user did X in the tool".
const ACTIVITY_MAP = [
  [/\/api\/report\/generate/, "Generated a report"],
  [/\/api\/report\/generate-analysis/, "Ran report analysis"],
  [/\/api\/seo\/scan/, "Ran an SEO scan"],
  [/\/api\/seo\/geo/, "Ran a GEO / AI-visibility scan"],
  [/\/api\/seo\/opportunities/, "Scanned content opportunities"],
  [/\/api\/seo\/crawl|website-crawl/, "Crawled the website"],
  [/\/api\/seo\/competitor|competitors\//, "Analysed competitors"],
  [/\/api\/seo\/onpage-audit/, "Ran an on-page audit"],
  [/\/api\/keywords\//, "Researched keywords"],
  [/\/api\/ai\/analyze/, "Used AI analysis"],
  [/\/api\/onboarding\/bootstrap/, "Started a new project"],
  [/\/api\/auth\/google\/start|\/api\/google\/status/, "Connected Google data"],
];

function BrandSplash() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center" style={{ background: C.cream, fontFamily: FONT }}>
      <div className="flex flex-col items-center gap-4">
        <RocketLogo size={54} />
        <span className="inline-block rounded-full animate-spin" style={{ width: 26, height: 26, border: "3px solid rgba(15,15,19,0.15)", borderTopColor: C.ink }} />
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState("loading"); // loading | out | in
  const [user, setUser] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [authError, setAuthError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  // Read one-time URL params (reset token / google error) before first paint of screens.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const rt = u.searchParams.get("reset");
      const ae = u.searchParams.get("authError");
      if (rt) setResetToken(rt);
      if (ae) {
        setAuthError(ae);
        u.searchParams.delete("authError");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch {}
  }, []);

  // Session check on load.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/user/me", { cache: "no-store" });
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (data?.authenticated && data.user) { setUser(data.user); setStatus("in"); }
        else setStatus("out");
      } catch {
        if (alive) setStatus("out");
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Activity tracking (only while logged in) ──────────────────────────────
  const lastLogged = useRef(new Map());
  useEffect(() => {
    if (status !== "in") return;
    const orig = window.fetch;

    const record = (type, detail, path) => {
      const key = `${type}:${detail}`;
      const now = Date.now();
      const prev = lastLogged.current.get(key) || 0;
      if (now - prev < 4000) return; // de-dupe bursts
      lastLogged.current.set(key, now);
      try {
        orig("/api/auth/activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, detail, path }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    };

    window.fetch = async (...args) => {
      const res = await orig(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        if (url && !url.includes("/api/auth/")) {
          for (const [re, label] of ACTIVITY_MAP) {
            if (re.test(url)) { record("tool", label, url.split("?")[0]); break; }
          }
        }
      } catch {}
      return res;
    };

    const onNav = (e) => {
      const step = e?.detail?.step ?? e?.step ?? null;
      if (step) record("navigate", `Went to step ${step}`, null);
    };
    window.addEventListener("wizard:navigate", onNav);

    return () => {
      window.fetch = orig;
      window.removeEventListener("wizard:navigate", onNav);
    };
  }, [status]);

  const handleAuthed = (u) => {
    setUser(u);
    setStatus("in");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("authError");
      url.searchParams.delete("reset");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {}
  };

  const handleLogout = async () => {
    try { await fetch("/api/auth/user/logout", { method: "POST" }); } catch {}
    setUser(null);
    setStatus("out");
  };

  if (status === "loading") return <BrandSplash />;
  if (status === "out") {
    return (
      <AuthScreens
        initialView={resetToken ? "reset" : "get-started"}
        resetToken={resetToken}
        initialError={authError}
        onAuthed={handleAuthed}
      />
    );
  }

  return (
    <AuthUserContext.Provider
      value={{ user, setUser, openProfile: () => setProfileOpen(true), logout: handleLogout }}
    >
      {children}
      <AccountControl user={user} onLogout={handleLogout} onEditProfile={() => setProfileOpen(true)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </AuthUserContext.Provider>
  );
}
