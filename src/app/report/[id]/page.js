// src/app/report/[id]/page.js
//
// Thin server shell — just extracts the report ID from the URL and passes it
// to the client component. Report data is loaded from sessionStorage on the
// client (written there by Step5Slide2 immediately after generate-analysis).
//
// Why not read from /tmp here?
//   Vercel serverless functions are stateless. generate-analysis writes to
//   /tmp on instance A; this page handler runs on instance B whose /tmp is
//   empty → 404. sessionStorage survives same-tab navigation and is the right
//   mechanism for ephemeral per-session data like a freshly-generated report.

import ReportClient from "./ReportClient";

export const metadata = {
  title: "ItzFizz Intelligence Report",
  description: "Comprehensive SEO & GEO intelligence report prepared by ItzFizz Digital",
};

export default async function ReportPage({ params }) {
  const { id } = await params;
  // All data loading happens client-side in ReportClient
  return <ReportClient id={id} />;
}
