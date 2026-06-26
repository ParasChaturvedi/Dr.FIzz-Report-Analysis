// src/app/components/report/deck/components.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure presentational deck components — props in, deck-class markup out, NO data
// access. Each mirrors a block in the reference deck CSS (.tile, .card, .journey,
// .cbar, .engine-cell, .phasecol, .actionrow, .ring, .verdict …) so slides built
// from these are 1:1 with the approved deck. Keep these dumb; data mapping + the
// honesty rules live in the slide builders.
// ─────────────────────────────────────────────────────────────────────────────
import { C } from "./tokens";

const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/* ---- layout helpers ---- */
export const Row = ({ cols = 3, gap, children, className = "", style }) => (
  <div className={`row r${cols} ${className}`} style={{ ...(gap ? { gap } : {}), ...style }}>{children}</div>
);
export const Split = ({ bias = false, children, gap, className = "", style }) => (
  <div className={`${bias ? "split-bias" : "split"} ${className}`.trim()} style={{ ...(gap ? { gap } : {}), ...style }}>{children}</div>
);

/* ---- stat tiles ---- */
export const Tiles = ({ cols = 4, children, style }) => (
  <div className="tiles" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, ...style }}>{children}</div>
);
export const Tile = ({ n, label, sub, flag = false }) => (
  <div className={`tile${flag ? " flag" : ""}`}>
    <div className="n">{n}</div>
    <div className="l">{label}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);
export const HeroStat = ({ n, label, ink = false }) => (
  <div className="herostat">
    <div className={`n${ink ? " ink" : ""}`}>{n}</div>
    <div className="l">{label}</div>
  </div>
);
export const ScoreBox = ({ score, of = 100 }) => (
  <div className="scorebox"><span className="big">{score}</span><span className="of">/ {of}</span></div>
);

/* ---- cards & callouts ---- */
export const Card = ({ title, children, accent = false, soft = false, dark = false }) => (
  <div className={["card", accent && "accent", soft && "soft", dark && "dark"].filter(Boolean).join(" ")}>
    {title && <h4>{title}</h4>}
    {children}
  </div>
);
export const Callout = ({ mark = "→", children, className = "" }) => (
  <div className={`callout ${className}`}><div className="mark">{mark}</div><div className="txt">{children}</div></div>
);

/* ---- journey timeline (slide: The Outcome) ---- */
export const Journey = ({ stages = [] }) => (
  <div className="journey">
    {stages.map((s, i) => (
      <div key={i} className={`stage${s.now ? " now" : ""}${s.goal ? " goal" : ""}`}>
        <div className="when">{s.when}</div>
        <div className="big">{s.big}</div>
        {s.cap && <div className="cap2">{s.cap}</div>}
      </div>
    ))}
  </div>
);

/* ---- fix → result rows (slide: The Diagnosis) ---- */
export const FixRow = ({ title, desc, goal, when }) => (
  <div className="fixrow">
    <div className="fx"><div className="t">{title}</div>{desc && <div className="d">{desc}</div>}</div>
    <div className="res"><div className="goal">{goal}</div>{when && <div className="when">{when}</div>}</div>
  </div>
);

/* ---- compare bars (SoV / per-engine / reviews) ---- */
export const CBar = ({ name, pct, value, you = false, them = false }) => {
  const w = clampPct(pct);
  return (
    <div className="cbar">
      <div className="cn">{name}</div>
      <div className="ct"><div className={`cf ${you ? "you" : "them"}`} style={{ width: `${w}%` }}>{w >= 14 ? `${w}%` : ""}</div></div>
      <div className="cv">{value != null ? value : `${w}%`}</div>
    </div>
  );
};

/* ---- trend scoreboard rows (slide: How We Prove It) ---- */
export const Trend = ({ label, now, arrow = "↑", target }) => (
  <div className="trend"><div className="tl">{label}</div><div className="tn">{now}</div><div className="ta">{arrow}</div><div className="tt">{target}</div></div>
);

/* ---- key/value rows ---- */
export const KV = ({ k, v }) => (<div className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>);

/* ---- checklist (ok / no / do) ---- */
export const Checks = ({ items = [] }) => (
  <ul className="checks">
    {items.map((it, i) => (
      <li key={i}><span className={`ic ${it.state || "ok"}`}>{it.state === "no" ? "✕" : it.state === "do" ? "→" : "✓"}</span><span>{it.text}</span></li>
    ))}
  </ul>
);

/* ---- tags & pills ---- */
export const Tag = ({ kind = "ghost", children }) => <span className={`tag ${kind}`}>{children}</span>;
export const Pill = ({ children }) => <span className="pill">{children}</span>;
export const Needs = ({ children }) => <span className="needs">{children}</span>;
export const Method = ({ children }) => <span className="method">{children}</span>;

/* ---- engine grid (per-AI-engine cells) ---- */
export const EngineGrid = ({ children }) => <div className="engine-grid">{children}</div>;
export const EngineCell = ({ engine, pct, sub, zero = false, notCollected = false }) => (
  <div className="engine-cell">
    <div className="en">{engine}</div>
    <div className={`pct${zero || notCollected ? " zero" : ""}`}>{notCollected ? "—" : pct}</div>
    <div className="sub">{notCollected ? "session required" : sub}</div>
  </div>
);

/* ---- phase columns (30/60/90/180 plan) ---- */
export const PhaseCol = ({ badge, duration, title, mission, items = [], goal }) => (
  <div className="phasecol">
    <div className="badge">{badge}</div>
    <div className="pd">{duration}</div>
    <div className="pg">{title}</div>
    {mission && <div className="pm">{mission}</div>}
    <ul>
      {items.map((it, i) => (
        <li key={i}><span className="dotc" style={it.color ? { background: it.color } : undefined} />{it.text || it}</li>
      ))}
    </ul>
    {goal && <div className="goal"><div className="gl">{goal.label || "Target"}</div><div className="gt">{goal.text}</div></div>}
  </div>
);
export const PhaseRow = ({ children }) => <div className="phaserow">{children}</div>;

/* ---- action board (work-type rows) ---- */
export const Legend = ({ items = [] }) => (
  <div className="legend">
    {items.map((it, i) => (<div key={i} className="chip"><i style={{ background: it.color }} />{it.label}</div>))}
  </div>
);
export const ActionRow = ({ accentClass = "a-content", title, desc, meta }) => (
  <div className={`actionrow ${accentClass}`}>
    <div className="acd" />
    <div className="ab"><div className="t">{title}</div>{desc && <div className="d">{desc}</div>}</div>
    <div className="am">{meta}</div>
  </div>
);

/* ---- verdict band (GEO) ---- */
export const Verdict = ({ num, children }) => (
  <div className="verdict"><div className="vnum">{num}</div><div className="vtxt">{children}</div></div>
);

/* ---- directory chips ---- */
export const DirGrid = ({ children }) => <div className="dirgrid">{children}</div>;
export const DirChip = ({ name, state = "q" }) => (
  <div className="dirchip"><span className={`st ${state}`}>{state === "have" ? "✓" : state === "miss" ? "+" : "?"}</span><span className="dn">{name}</span></div>
);

/* ---- GBP completeness ring (SVG donut — PDF-safe) ---- */
export const Ring = ({ value = 0, label = "Complete" }) => {
  const v = clampPct(value), r = 64, circ = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={r} fill="none" stroke={C.line} strokeWidth="12" />
        <circle cx="75" cy="75" r={r} fill="none" stroke={C.rust} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 75 75)" />
      </svg>
      <div className="rv"><div className="rn">{v}</div><div className="rl">{label}</div></div>
    </div>
  );
};

/* ---- GEO score signal rows (dark) ---- */
export const ScoreSig = ({ label, weight }) => (
  <div className="scoresig"><span className="sl">{label}</span><span className="sw">{weight}</span></div>
);

/* ---- pages/blogs board item ---- */
export const PbItem = ({ name, code, value }) => (
  <div className="pbitem"><span className="pn">{name}{code && <> <code>{code}</code></>}</span>{value && <span className="pv">{value}</span>}</div>
);

/* ---- generic deck table ---- */
export const DataTable = ({ head = [], rows = [], compact = false }) => (
  <table className={compact ? "tbl-compact" : ""}>
    <thead><tr>{head.map((h, i) => (<th key={i} style={h.align ? { textAlign: h.align } : undefined}>{h.label != null ? h.label : h}</th>))}</tr></thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i} className={r.you ? "you-row" : ""}>
          {r.cells.map((c, j) => {
            const cell = c && typeof c === "object" && !Array.isArray(c) && (c.v !== undefined || c.num !== undefined || c.tag !== undefined) ? c : { v: c };
            return (
              <td key={j} className={cell.num ? "num" : ""} style={cell.align ? { textAlign: cell.align } : undefined}>
                {cell.tag ? <Tag kind={cell.tag.kind}>{cell.tag.label}</Tag> : cell.v}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
);

/* ---- pillar discipline badge (matches .pillar + .p-* in deck CSS) ---- */
export const Pillar = ({ kind = "onpage", label }) => <span className={`pillar p-${kind}`}><i />{label}</span>;

/* ---- topic association grid + legend ---- */
export const TopicGrid = ({ topics = [] }) => (
  <div className="topicgrid">{topics.map((t, i) => (<span key={i} className="topicchip"><span className={`dot ${t.state || "none"}`} />{t.topic}</span>))}</div>
);
const _ldot = (bg) => ({ width: 9, height: 9, borderRadius: "50%", background: bg, display: "inline-block" });
export const TopicLegend = () => (
  <div className="legend" style={{ marginTop: 14 }}>
    <div className="chip"><i style={_ldot("#3C7D5A")} />Recognised</div>
    <div className="chip"><i style={_ldot("#C95322")} />Weak / unstable</div>
    <div className="chip"><i style={_ldot("#CBC1B2")} />No association</div>
  </div>
);

/* ---- so-what triad (evidence / cost / action) — data-bound only ---- */
export const Triad = ({ children, className = "" }) => <div className={`triad ${className}`}>{children}</div>;
export const Tc = ({ kind = "evidence", label, children }) => (
  <div className={`tc ${kind}`}><div className="tl">{label}</div><div className="tv">{children}</div></div>
);

/* ---- illustrative/hypothesis badge + brand wall + GEO result cell ---- */
export const Hypo = ({ children }) => <span className="hypo">{children}</span>;
export const CLGrid = ({ names = [] }) => <div className="cl-grid">{names.map((n, i) => <div key={i} className="cl-tile">{n}</div>)}</div>;
export const ResCell = ({ kind = "absent", children }) => <span className={`res-${kind}`}>{children}</span>;

/* ---- honest "not yet measured" panel (GEO slides when live.measured is false) ---- */
export const GapPanel = ({ title, children, engines }) => (
  <div className="card" style={{ borderStyle: "dashed" }}>
    <h4>{title}</h4>
    <p className="small" style={{ marginTop: 6 }}>{children}</p>
    {engines && engines.length > 0 && (
      <div className="dirgrid" style={{ marginTop: 14 }}>
        {engines.map((e, i) => (<DirChip key={i} name={e.name} state={e.ready ? "have" : "miss"} />))}
      </div>
    )}
  </div>
);
