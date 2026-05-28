// src/app/report/[id]/page.js
import { readFile } from "fs/promises";
import { join } from "path";
import { notFound } from "next/navigation";
import ReportClient from "./ReportClient";

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const raw = await readFile(join("/tmp", "reports", `${id}.json`), "utf8");
    const { data } = JSON.parse(raw);
    return {
      title: `ItzFizz Intelligence Report — ${data?.domain || "SEO Report"}`,
      description: `Comprehensive SEO & GEO intelligence report for ${data?.domain || "your website"} prepared by ItzFizz Digital`,
    };
  } catch {
    return {
      title: "ItzFizz Intelligence Report",
      description: "Comprehensive SEO & GEO intelligence report prepared by ItzFizz Digital",
    };
  }
}

export default async function ReportPage({ params }) {
  const { id } = await params;

  let report = null;
  try {
    const raw = await readFile(join("/tmp", "reports", `${id}.json`), "utf8");
    report = JSON.parse(raw);
  } catch {
    notFound();
  }

  if (!report) notFound();

  return <ReportClient id={id} reportType={report.reportType} data={report.data} />;
}
