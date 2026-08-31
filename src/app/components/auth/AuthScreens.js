// src/app/components/auth/AuthScreens.js
// The logged-out experience: Get Started → Sign up / Log in → Forgot / Reset.
// Exact replica of the three Figma frames; forgot/reset match the same system.
"use client";

import { useState, useEffect } from "react";
import {
  AuthShell, RocketLogo, Heading, GoogleButton, PrimaryButton,
  Field, PasswordField, Toggle, Divider, InlineError, C,
} from "./AuthShell";

const FONT = "var(--font-poppins), ui-sans-serif, system-ui, -apple-system, sans-serif";

const GOOGLE_ERRORS = {
  google_not_configured: "Google sign-in isn't configured yet. Please use email.",
  invalid_state: "Google sign-in expired. Please try again.",
  google_exchange_failed: "Couldn't complete Google sign-in. Please try again.",
  no_email: "Your Google account didn't share an email. Please use email sign-up.",
  db_unavailable: "Service is temporarily unavailable. Please try again.",
  session_failed: "Couldn't start your session. Please try again.",
  access_denied: "Google sign-in was cancelled.",
};

function Muted({ children, style }) {
  return <span style={{ color: C.sub, fontFamily: FONT, fontSize: 15.5, ...style }}>{children}</span>;
}
function BlueLink({ children, onClick, href }) {
  const props = href ? { href } : { onClick, type: "button" };
  const Tag = href ? "a" : "button";
  return (
    <Tag {...props} className="font-bold hover:underline" style={{ color: C.blue, fontFamily: FONT, background: "none" }}>
      {children}
    </Tag>
  );
}
function RedLink({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="font-bold hover:underline underline-offset-2" style={{ color: C.red, fontFamily: FONT }}>
      {children}
    </button>
  );
}
function LegalText() {
  return (
    <p className="text-center" style={{ color: C.sub, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.5 }}>
      By continuing, you agree to the <BlueLink href="#">Terms of Service</BlueLink>
      <br />
      and acknowledge you’ve read our <BlueLink href="#">Privacy Policy</BlueLink>
    </p>
  );
}
function BottomLine({ children }) {
  return <p className="text-center" style={{ color: C.sub, fontFamily: FONT, fontSize: 15.5 }}>{children}</p>;
}
function TroubleLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-5 right-6 hover:opacity-80"
      style={{ color: C.muted, fontFamily: FONT, fontSize: 14, textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      Trouble Logging In?
    </button>
  );
}
const Gap = ({ h }) => <div style={{ height: h }} aria-hidden />;

async function postJSON(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error. Please check your connection." } };
  }
}

export default function AuthScreens({ initialView = "get-started", resetToken = null, initialError = "", onAuthed }) {
  const [view, setView] = useState(resetToken ? "reset" : initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ? (GOOGLE_ERRORS[initialError] || "Sign-in failed. Please try again.") : "");
  const [info, setInfo] = useState("");
  const [devLink, setDevLink] = useState("");

  useEffect(() => { setError(""); setInfo(""); setDevLink(""); }, [view]);

  const goGoogle = () => { window.location.href = "/api/auth/user/google/start"; };

  async function submitSignup() {
    setError("");
    if (!email || !password) return setError("Please enter your email and password.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    const { ok, data } = await postJSON("/api/auth/user/signup", { email: email.trim(), password, newsletter });
    setLoading(false);
    if (!ok) return setError(data.error || "Could not create your account.");
    onAuthed?.(data.user);
  }
  async function submitLogin() {
    setError("");
    if (!email || !password) return setError("Please enter your email and password.");
    setLoading(true);
    const { ok, data } = await postJSON("/api/auth/user/login", { email: email.trim(), password });
    setLoading(false);
    if (!ok) return setError(data.error || "Could not log you in.");
    onAuthed?.(data.user);
  }
  async function submitForgot() {
    setError(""); setInfo(""); setDevLink("");
    if (!email) return setError("Please enter your email.");
    setLoading(true);
    const { ok, data } = await postJSON("/api/auth/user/forgot", { email: email.trim() });
    setLoading(false);
    if (!ok) return setError(data.error || "Could not send reset instructions.");
    setInfo(data.message || "Check your email for reset instructions.");
    if (data.devResetLink) setDevLink(data.devResetLink);
  }
  async function submitReset() {
    setError(""); setInfo("");
    if (!password || password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    const { ok, data } = await postJSON("/api/auth/user/reset", { token: resetToken, password });
    setLoading(false);
    if (!ok) return setError(data.error || "Could not reset your password.");
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("reset");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch {}
    setPassword("");
    setInfo(data.message || "Password updated. Please log in.");
    setView("login");
  }

  /* ───────────────────────── screens ───────────────────────── */
  if (view === "get-started") {
    return (
      <AuthShell>
        <RocketLogo />
        <Gap h={22} />
        <Heading>Get Started with<br />DoctorFizz SEO</Heading>
        <Gap h={40} />
        {error && (<><InlineError>{error}</InlineError><Gap h={16} /></>)}
        <GoogleButton onClick={goGoogle} />
        <Gap h={16} />
        <PrimaryButton onClick={() => setView("signup")}>Continue with email</PrimaryButton>
        <Gap h={24} />
        <LegalText />
        <Gap h={24} />
        <Toggle on={newsletter} onChange={setNewsletter} label="Get helpful resources, our newsletter and more" />
        <Gap h={34} />
        <BottomLine><Muted>Already have an account? </Muted><RedLink onClick={() => setView("login")}>Log in</RedLink></BottomLine>
      </AuthShell>
    );
  }

  if (view === "signup") {
    return (
      <AuthShell>
        <RocketLogo />
        <Gap h={20} />
        <Heading>Get Started with DoctorFizz</Heading>
        <Gap h={30} />
        <GoogleButton onClick={goGoogle} />
        <Gap h={16} />
        <Divider>Or</Divider>
        <Gap h={16} />
        {error && (<><InlineError>{error}</InlineError><Gap h={16} /></>)}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="email" onEnter={submitSignup} />
        <Gap h={18} />
        <PasswordField value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="new-password" onEnter={submitSignup} />
        <Gap h={26} />
        <PrimaryButton onClick={submitSignup} loading={loading}>Create an account</PrimaryButton>
        <Gap h={22} />
        <LegalText />
        <Gap h={22} />
        <Toggle on={newsletter} onChange={setNewsletter} label="Get helpful resources, our newsletter and more" />
        <Gap h={30} />
        <BottomLine><Muted>Already have an account? </Muted><RedLink onClick={() => setView("login")}>Log in</RedLink></BottomLine>
        <TroubleLink onClick={() => setView("forgot")} />
      </AuthShell>
    );
  }

  if (view === "login") {
    return (
      <AuthShell>
        <RocketLogo />
        <Gap h={20} />
        <Heading>Log in to Get Started with<br />DoctorFizz</Heading>
        <Gap h={30} />
        {info && (<><InlineOK>{info}</InlineOK><Gap h={14} /></>)}
        <GoogleButton onClick={goGoogle} />
        <Gap h={16} />
        <Divider>Or</Divider>
        <Gap h={16} />
        {error && (<><InlineError>{error}</InlineError><Gap h={16} /></>)}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="email" onEnter={submitLogin} />
        <Gap h={16} />
        <PasswordField value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" onEnter={submitLogin} />
        <Gap h={10} />
        <div className="text-right"><BlueLink onClick={() => setView("forgot")}>Forgot your password?</BlueLink></div>
        <Gap h={22} />
        <PrimaryButton onClick={submitLogin} loading={loading}>Continue with email</PrimaryButton>
        <Gap h={22} />
        <Toggle on={newsletter} onChange={setNewsletter} label="Get helpful resources, our newsletter and more" />
        <Gap h={30} />
        <BottomLine><Muted>Don’t have a DoctorFizz Account? </Muted><RedLink onClick={() => setView("signup")}>Sign up</RedLink></BottomLine>
        <TroubleLink onClick={() => setView("forgot")} />
      </AuthShell>
    );
  }

  if (view === "forgot") {
    return (
      <AuthShell>
        <RocketLogo />
        <Gap h={20} />
        <Heading>Reset your password</Heading>
        <Gap h={14} />
        <p className="text-center" style={{ color: C.sub, fontFamily: FONT, fontSize: 15, lineHeight: 1.5 }}>
          Enter your account email and we’ll send you a link to set a new password.
        </p>
        <Gap h={28} />
        {error && (<><InlineError>{error}</InlineError><Gap h={16} /></>)}
        {info && (<><InlineOK>{info}</InlineOK><Gap h={12} /></>)}
        {devLink && (
          <>
            <p className="text-center" style={{ fontFamily: FONT, fontSize: 13.5 }}>
              <BlueLink href={devLink}>Open reset link (dev)</BlueLink>
            </p>
            <Gap h={14} />
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="Enter your email" autoComplete="email" onEnter={submitForgot} />
        <Gap h={24} />
        <PrimaryButton onClick={submitForgot} loading={loading}>Send reset link</PrimaryButton>
        <Gap h={26} />
        <BottomLine><Muted>Remembered it? </Muted><RedLink onClick={() => setView("login")}>Log in</RedLink></BottomLine>
      </AuthShell>
    );
  }

  // reset
  return (
    <AuthShell>
      <RocketLogo />
      <Gap h={20} />
      <Heading>Set a new password</Heading>
      <Gap h={28} />
      {error && (<><InlineError>{error}</InlineError><Gap h={16} /></>)}
      <PasswordField label="New password" value={password} onChange={setPassword} placeholder="Enter a new password" autoComplete="new-password" onEnter={submitReset} />
      <Gap h={24} />
      <PrimaryButton onClick={submitReset} loading={loading}>Update password</PrimaryButton>
      <Gap h={26} />
      <BottomLine><Muted>Back to </Muted><RedLink onClick={() => setView("login")}>Log in</RedLink></BottomLine>
    </AuthShell>
  );
}

function InlineOK({ children }) {
  if (!children) return null;
  return (
    <div className="text-center rounded-2xl px-4 py-2.5" style={{ color: "#15803D", background: "rgba(34,197,94,0.10)", fontFamily: FONT, fontSize: 14 }}>
      {children}
    </div>
  );
}
