// src/app/components/auth/AuthShell.js
// ─────────────────────────────────────────────────────────────────────────────
// Design-system atoms for the auth screens — a pixel replica of the DoctorFizz
// Figma auth frames (cream #FEFBF6 dotted canvas, Poppins headings, black/white
// pill buttons, rounded pill inputs, colourful rocket logo). The dark tablet
// bezel in the Figma export is a device mockup, so the real page is the full
// cream canvas. Colours sampled directly from the exported design.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";

export const C = {
  cream: "#FEFBF6",
  ink: "#0F0F13",
  sub: "#434445",
  muted: "#6E6E75",
  inputBorder: "#C9C7CC",
  placeholder: "#9A9AA0",
  googleBorder: "#E4E4E7",
  blue: "#2D8FE0",
  red: "#EC4F41",
  white: "#FFFFFF",
};

const FONT = "var(--font-poppins), ui-sans-serif, system-ui, -apple-system, sans-serif";

/* Full-screen cream canvas with the subtle dotted grid, content centred. */
export function AuthShell({ children }) {
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_a]:cursor-pointer"
      style={{
        background: C.cream,
        backgroundImage: "radial-gradient(rgba(30,15,15,0.07) 1.2px, transparent 1.3px)",
        backgroundSize: "23px 23px",
        backgroundPosition: "center top",
        fontFamily: FONT,
      }}
    >
      <div className="min-h-full w-full flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[452px] mx-auto">{children}</div>
      </div>
    </div>
  );
}

export function RocketLogo({ size = 56 }) {
  return (
    <img
      src="/brand/auth-logo.png"
      alt="DoctorFizz"
      draggable="false"
      className="select-none mx-auto block"
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

export function Heading({ children }) {
  return (
    <h1
      className="text-center font-bold"
      style={{ color: C.ink, fontFamily: FONT, fontSize: "34px", lineHeight: "1.18", letterSpacing: "-0.01em", fontWeight: 700 }}
    >
      {children}
    </h1>
  );
}

export function GoogleG({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function EyeIcon({ off, size = 22 }) {
  const stroke = "#8A8A90";
  return off ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/* White "Continue with Google" pill */
export function GoogleButton({ children = "Continue with Google", onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 rounded-full transition active:scale-[.995] disabled:opacity-60"
      style={{
        height: 58,
        background: C.white,
        border: `1px solid ${C.googleBorder}`,
        boxShadow: "0 1px 2px rgba(16,16,20,0.05)",
        color: C.ink,
        fontFamily: FONT,
        fontWeight: 500,
        fontSize: 17,
      }}
    >
      <GoogleG />
      <span>{children}</span>
    </button>
  );
}

/* Black primary pill */
export function PrimaryButton({ children, onClick, type = "button", loading, disabled }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center rounded-full transition active:scale-[.995] disabled:opacity-70"
      style={{ height: 58, background: C.ink, color: C.white, fontFamily: FONT, fontWeight: 600, fontSize: 17 }}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block rounded-full animate-spin"
      style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.35)", borderTopColor: "#fff" }}
    />
  );
}

export function Field({ label, type = "text", value, onChange, placeholder, autoComplete, onEnter, name }) {
  return (
    <label className="block">
      <span className="block mb-2 font-medium" style={{ color: C.sub, fontFamily: FONT, fontSize: 15.5 }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        className="w-full rounded-full outline-none transition focus:border-[#0F0F13]"
        style={{ height: 58, padding: "0 24px", background: "transparent", border: `1.5px solid ${C.inputBorder}`, color: C.ink, fontFamily: FONT, fontSize: 16.5 }}
      />
    </label>
  );
}

export function PasswordField({ label = "Password", value, onChange, placeholder = "Enter your password", autoComplete, onEnter }) {
  return <PasswordFieldInner label={label} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} onEnter={onEnter} />;
}

function PasswordFieldInner({ label, value, onChange, placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="block mb-2 font-medium" style={{ color: C.sub, fontFamily: FONT, fontSize: 15.5 }}>
        {label}
      </span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
          className="w-full rounded-full outline-none transition focus:border-[#0F0F13]"
          style={{ height: 58, padding: "0 52px 0 24px", background: "transparent", border: `1.5px solid ${C.inputBorder}`, color: C.ink, fontFamily: FONT, fontSize: 16.5 }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute top-1/2 -translate-y-1/2 right-4 grid place-items-center"
          style={{ height: 32, width: 32 }}
          tabIndex={-1}
        >
          <EyeIcon off={!show} />
        </button>
      </div>
    </label>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="relative shrink-0 rounded-full transition-colors"
        style={{ height: 24, width: 44, background: on ? C.ink : "#CFCDD3" }}
      >
        <span
          className="absolute rounded-full bg-white shadow transition-all"
          style={{ height: 18, width: 18, top: 3, left: on ? 23 : 3 }}
        />
      </button>
      <span style={{ color: C.ink, fontFamily: FONT, fontSize: 15.5, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export function Divider({ children = "Or" }) {
  return (
    <div className="text-center" style={{ color: C.muted, fontFamily: FONT, fontSize: 15 }}>
      {children}
    </div>
  );
}

export function InlineError({ children }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="text-center rounded-2xl px-4 py-2.5"
      style={{ color: "#B42318", background: "rgba(236,79,65,0.10)", fontFamily: FONT, fontSize: 14 }}
    >
      {children}
    </div>
  );
}
