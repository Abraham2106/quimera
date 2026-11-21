import { useState } from "react";

import type { DevApiConfig } from "../config.js";
import { appendDevAuthHeaders } from "../dev-auth-headers.js";

export function BillingUsagePanel({ config }: { config: DevApiConfig }) {
  const [summary, setSummary] = useState<string | null>(null);

  return (
    <section className="mb-6 rounded border border-slate-200 p-4">
      <h2 className="text-base font-semibold text-slate-900">Plan y consumo</h2>
      <button
        type="button"
        className="mt-2 rounded border border-slate-300 px-3 py-2 text-sm"
        onClick={() => {
          void (async () => {
            const headers: Record<string, string> = {};
            if (config.accessToken.trim()) headers.authorization = `Bearer ${config.accessToken.trim()}`;
            appendDevAuthHeaders(config, headers);
            const response = await fetch(`${config.apiBase}/api/v1/billing/usage`, { headers });
            const json = (await response.json()) as {
              billing?: { planCode: string; status: string; usage: { seats: number }; limits: { maxSeats: number } } | null;
              error?: { message?: string };
            };
            if (!response.ok || !json.billing) {
              setSummary(json.error?.message ?? "Sin suscripción.");
              return;
            }
            setSummary(`${json.billing.planCode} (${json.billing.status}): ${json.billing.usage.seats}/${json.billing.limits.maxSeats} asientos`);
          })();
        }}
      >
        Ver consumo
      </button>
      {summary ? <p className="mt-2 text-sm text-slate-700">{summary}</p> : null}
    </section>
  );
}
