import type { SuiteRunReport } from "../scenarios/types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatJunitReport(report: SuiteRunReport): string {
  const cases = report.results
    .map((r) => {
      if (r.passed) {
        return `    <testcase classname="factura-ci" name="${escapeXml(r.id)}" />`;
      }
      return `    <testcase classname="factura-ci" name="${escapeXml(r.id)}">
      <failure message="${escapeXml(r.message)}" />
    </testcase>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${escapeXml(report.disclaimer)} -->
<testsuite name="factura-ci" tests="${report.results.length}" failures="${report.failed}">
${cases}
</testsuite>
`;
}