import type { SuiteRunReport } from "../scenarios/types.js";

export function formatPrettyReport(report: SuiteRunReport): string {
  const lines: string[] = [
    report.disclaimer,
    "",
    `Target: ${report.target}`,
    `Seed: ${report.seed}`,
    `Results: ${report.passed}/${report.results.length} passed (exit ${report.exitCode})`,
    "",
  ];

  for (const r of report.results) {
    const mark = r.passed ? "PASS" : "FAIL";
    lines.push(`[${mark}] ${r.id} — ${r.message}`);
  }

  lines.push("");
  lines.push(report.disclaimer);
  return lines.join("\n");
}