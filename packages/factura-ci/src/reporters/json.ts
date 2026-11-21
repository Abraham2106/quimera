import type { SuiteRunReport } from "../scenarios/types.js";

export function formatJsonReport(report: SuiteRunReport): string {
  return JSON.stringify(
    {
      disclaimer: report.disclaimer,
      seed: report.seed,
      target: report.target,
      summary: {
        total: report.results.length,
        passed: report.passed,
        failed: report.failed,
        exitCode: report.exitCode,
      },
      results: report.results.map((r) => ({
        id: r.id,
        family: r.family,
        passed: r.passed,
        message: r.message,
      })),
    },
    null,
    2,
  );
}