// src/app/components/report/deck/DeckReportLive.js
// ─────────────────────────────────────────────────────────────────────────────
// Client wrapper for the deck replica: fetches the live GEO bundle ONCE (auto-
// triggers collection, polls while the worker runs) and passes it to DeckReport,
// which renders the 23-slide deck from real data. GEO slides show an honest
// not-yet-measured panel until live.measured flips true.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useState } from "react";
import DeckReport from "./DeckReport";

// Lift GeoLiveSection's fetch/poll into a hook so `live` is fetched once at the root.
function useGeoLive(domain) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!domain) return;
    let cancelled = false, timer = null, ensured = false, tries = 0;
    const POLL_MS = 15000, MAX_TRIES = 60;
    const read = () =>
      fetch(`/api/seo/geo/report?domain=${encodeURIComponent(domain)}&answers=1`)
        .then((r) => r.json()).catch(() => null);
    const tick = async () => {
      const d = await read();
      if (cancelled) return;
      if (d) setLive(d);
      if (d?.measured) return;
      const state = d?.geo_status?.state;
      if (!ensured && (!d || !d.run || state === "planned")) {
        ensured = true;
        try {
          await fetch(`/api/seo/geo/ensure`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ domain, source: "report" }),
          });
        } catch {}
      }
      if (tries < MAX_TRIES && (!d || ["planned", "queued", "running"].includes(state))) {
        tries++; timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [domain]);
  return live;
}

export default function DeckReportLive({ data }) {
  const domain = data?.domain || "";
  const live = useGeoLive(domain);
  return <DeckReport data={data} live={live} />;
}
