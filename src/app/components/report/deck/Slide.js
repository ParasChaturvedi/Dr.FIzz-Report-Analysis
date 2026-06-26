// src/app/components/report/deck/Slide.js
// ─────────────────────────────────────────────────────────────────────────────
// The single slide primitive — a fixed 1280×720 .slide that every content slide
// composes. Matches the reference deck DOM exactly: head (topbar logo + kicker,
// title, optional deck-sub) → content → foot (eyebrow · domain · page number).
// `title`/`sub` accept strings or JSX (so a builder can pass an <hl> highlight).
// ─────────────────────────────────────────────────────────────────────────────

// Cover slide (dark) — slide 1.
export function Cover({ eyebrow, title, lede, meta = [] }) {
  return (
    <section className="slide dark cover">
      <div className="inner">
        <div className="brandmark logo-w" />
        <div className="accentbar" />
        {eyebrow && <div className="ek">{eyebrow}</div>}
        <h1>{title}</h1>
        {lede && <p className="clede">{lede}</p>}
        {meta.length > 0 && (
          <div className="meta">
            {meta.map((m, i) => (
              <span key={i}>{m.k}<b>{m.v}</b></span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Standard content slide.
export function Slide({
  n, kicker, title, sub, variant = "", contentTop = false,
  foot, children,
}) {
  const cls = ["slide", variant].filter(Boolean).join(" ");
  const dark = /\bdark\b/.test(variant);
  return (
    <section className={cls}>
      <div className="head">
        <div className="topbar">
          <div className={`brandmark ${dark ? "logo-w" : "logo-b"}`} />
          {(n || kicker) && (
            <div className="kicker">{n && <span className="n">{n}</span>} {kicker}</div>
          )}
        </div>
        {title && <h1 className="title">{title}</h1>}
        {sub && <p className="deck-sub">{sub}</p>}
      </div>
      <div className={`content${contentTop ? " top" : ""}`}>{children}</div>
      {foot && (
        <div className="foot">
          <span>{foot.left}</span>
          <span>{foot.mid}</span>
          <span className="pg">{foot.pg}</span>
        </div>
      )}
    </section>
  );
}

export default Slide;
