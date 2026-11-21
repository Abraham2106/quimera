import type { CanonicalScenarioId } from "../constants.js";
import type { FiscalSut } from "../types/fiscal-sut.js";
import { minimalStructuralCheck, validateXml } from "../xml-validation.js";
import type { ScenarioContext, ScenarioDefinition, ScenarioResult } from "./types.js";

function result(
  def: Pick<ScenarioDefinition, "id" | "family" | "suites">,
  passed: boolean,
  message: string,
): ScenarioResult {
  return { id: def.id, passed, message, family: def.family, suite: def.suites };
}

async function runStandardEmit(
  ctx: ScenarioContext,
  docType: "01" | "04",
  currency: "CRC" | "USD",
): Promise<{ clave: string; consecutivo: string; state: string; xml?: string }> {
  const out = await ctx.sut.emit({
    tenantId: "tenant-a",
    operationId: `op-${ctx.seed}-${docType}`,
    docType,
    amountMinor: 113_000n,
    currency,
  });
  return out;
}

function postCount(ctx: ScenarioContext): number {
  return ctx.simulator.getLog().filter((e) => e.method === "POST").length;
}

function postsForOperation(ctx: ScenarioContext, operationId: string): number {
  return ctx.simulator
    .getLog()
    .filter((e) => e.method === "POST" && e.body.includes(operationId)).length;
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: "FC-001",
    family: "A",
    suites: ["all", "xml"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await runStandardEmit(ctx, "01", "CRC");
      const xmlCheck = emit.xml
        ? await validateXml(emit.xml)
        : minimalStructuralCheck({ clave: emit.clave, docType: "01" });
      return result(
        this,
        xmlCheck.ok && emit.state === "ACEPTADO",
        xmlCheck.ok
          ? `structural/xml check (${xmlCheck.mode})`
          : xmlCheck.details.join("; "),
      );
    },
  },
  {
    id: "FC-002",
    family: "A",
    suites: ["all", "xml"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `op-usd-${ctx.seed}`,
        docType: "01",
        amountMinor: 50_000n,
        currency: "USD",
      });
      const check = minimalStructuralCheck({ clave: emit.clave, docType: "01" });
      return result(this, check.ok, `USD emission clave ok=${check.ok}`);
    },
  },
  {
    id: "FC-003",
    family: "A",
    suites: ["all", "xml"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const te = await runStandardEmit(ctx, "04", "CRC");
      const fe = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `op-fe-${ctx.seed}`,
        docType: "01",
        amountMinor: 1000n,
        currency: "CRC",
      });
      const ok =
        te.clave !== fe.clave &&
        minimalStructuralCheck({ clave: te.clave, docType: "04" }).ok &&
        minimalStructuralCheck({ clave: fe.clave, docType: "01" }).ok;
      return result(this, ok, "TE vs FE independent claves/doc types");
    },
  },
  {
    id: "FC-004",
    family: "A",
    suites: ["all", "xml"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await runStandardEmit(ctx, "01", "CRC");
      const check = minimalStructuralCheck({ clave: emit.clave, docType: "01" });
      return result(this, check.ok, check.details.join("; ") || "clave 50 dígitos");
    },
  },
  {
    id: "FC-005",
    family: "B",
    suites: ["all", "states"],
    mode: "processing",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `proc-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const getCount = ctx.simulator.getLog().filter((e) => e.method === "GET").length;
      const ok =
        emit.state === "PENDIENTE" ||
        emit.state === "PROCESANDO" ||
        (emit.state === "ACEPTADO" && getCount >= 2);
      return result(this, ok, `state=${emit.state} getCount=${getCount}`);
    },
  },
  {
    id: "FC-006",
    family: "B",
    suites: ["all", "states"],
    mode: "rejected",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `rej-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const postsAfter = postCount(ctx);
      return result(
        this,
        emit.state === "RECHAZADO" && postsAfter <= 1,
        `state=${emit.state} posts=${postsAfter}`,
      );
    },
  },
  {
    id: "FC-007",
    family: "B",
    suites: ["all", "states"],
    mode: "unavailable_503",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `503-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      return result(
        this,
        emit.state !== "RECHAZADO",
        `technical vs rechazado state=${emit.state}`,
      );
    },
  },
  {
    id: "FC-008",
    family: "B",
    suites: ["all", "states"],
    mode: "conflict_409",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `conf-${ctx.seed}`;
      const first = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      ctx.simulator.setMode("conflict_409");
      const second = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `${op}-retry`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const sameClave = first.clave === second.clave;
      return result(this, !sameClave, `409 handling claves distinct=${!sameClave}`);
    },
  },
  {
    id: "FC-009",
    family: "C",
    suites: ["all"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `dup-seq-${ctx.seed}`;
      ctx.simulator.clearLog();
      for (let i = 0; i < 5; i += 1) {
        await ctx.sut.emit({
          tenantId: "tenant-a",
          operationId: op,
          docType: "01",
          amountMinor: 1n,
          currency: "CRC",
        });
      }
      const posts = postsForOperation(ctx, op);
      return result(this, posts === 1, `expected 1 POST got ${posts}`);
    },
  },
  {
    id: "FC-010",
    family: "C",
    suites: ["all"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `dup-par-${ctx.seed}`;
      ctx.simulator.clearLog();
      await Promise.all(
        Array.from({ length: 10 }, () =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: op,
            docType: "01",
            amountMinor: 1n,
            currency: "CRC",
            concurrent: true,
          }),
        ),
      );
      const posts = postsForOperation(ctx, op);
      return result(this, posts === 1, `expected 1 POST got ${posts}`);
    },
  },
  {
    id: "FC-011",
    family: "C",
    suites: ["all"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `snap-${ctx.seed}`;
      const first = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 100n,
        currency: "CRC",
      });
      const logBody = ctx.simulator
        .getLog()
        .find((e) => e.method === "POST" && e.clave === first.clave)?.body;
      const immutable = logBody?.includes(op) ?? false;
      return result(this, immutable, "snapshot operationId on POST body");
    },
  },
  {
    id: "FC-012",
    family: "C",
    suites: ["all", "recovery"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `mut-${ctx.seed}`;
      await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      let rejected = false;
      try {
        await ctx.sut.emit({
          tenantId: "tenant-a",
          operationId: op,
          docType: "01",
          amountMinor: 999n,
          currency: "CRC",
        });
      } catch {
        rejected = true;
      }
      return result(this, rejected, `mutation rejected=${rejected}`);
    },
  },
  {
    id: "FC-013",
    family: "C",
    suites: ["all", "recovery"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const parent = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `nc-parent-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const nc = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `nc-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const ok =
        parent.state === "ACEPTADO" &&
        nc.clave !== parent.clave &&
        minimalStructuralCheck({ clave: nc.clave, docType: "01" }).ok;
      return result(this, ok, "NC-like second emission distinct clave");
    },
  },
  {
    id: "FC-014",
    family: "C",
    suites: ["all", "recovery"],
    mode: "rejected",
    run: async function (this: ScenarioDefinition, ctx) {
      const first = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `reseq-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const second = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `reseq-${ctx.seed}-2`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const ok =
        first.state === "RECHAZADO" &&
        Number(second.consecutivo) > Number(first.consecutivo);
      return result(this, ok, `consecutivos ${first.consecutivo} -> ${second.consecutivo}`);
    },
  },
  {
    id: "FC-015",
    family: "D",
    suites: ["all", "concurrency"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      ctx.simulator.clearLog();
      const outputs = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: `c15-${ctx.seed}-${i}`,
            docType: "01",
            amountMinor: 1n,
            currency: "CRC",
            concurrent: true,
          }),
        ),
      );
      const consecutivos = outputs.map((o) => o.consecutivo);
      const unique = new Set(consecutivos);
      return result(this, unique.size === 10, `unique consecutivos ${unique.size}/10`);
    },
  },
  {
    id: "FC-016",
    family: "D",
    suites: ["all", "concurrency"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const fe = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: `c16-fe-${ctx.seed}-${i}`,
            docType: "01",
            amountMinor: 1n,
            currency: "CRC",
            concurrent: true,
          }),
        ),
      );
      const te = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: `c16-te-${ctx.seed}-${i}`,
            docType: "04",
            amountMinor: 1n,
            currency: "CRC",
            concurrent: true,
          }),
        ),
      );
      const ok =
        new Set(fe.map((f) => f.consecutivo)).size === 10 &&
        new Set(te.map((t) => t.consecutivo)).size === 10;
      return result(this, ok, "independent FE/TE sequences");
    },
  },
  {
    id: "FC-017",
    family: "D",
    suites: ["all", "concurrency"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      ctx.simulator.clearLog();
      const outputs = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: `c17-${ctx.seed}-${i}`,
            docType: "01",
            amountMinor: 1n,
            currency: "CRC",
            concurrent: true,
          }),
        ),
      );
      const consecutivos = outputs.map((o) => o.consecutivo);
      const claves = outputs.map((o) => o.clave);
      const uniqueC = new Set(consecutivos).size === consecutivos.length;
      const uniqueK = new Set(claves).size === claves.length;
      return result(
        this,
        uniqueC && uniqueK,
        `consecutivos unique=${uniqueC} claves unique=${uniqueK}`,
      );
    },
  },
  {
    id: "FC-018",
    family: "D",
    suites: ["all", "concurrency"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      ctx.simulator.clearLog();
      const outputs = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          ctx.sut.emit({
            tenantId: "tenant-a",
            operationId: `c18-${ctx.seed}-${i}`,
            docType: "01",
            amountMinor: 1n,
            currency: "CRC",
          }),
        ),
      );
      const posts = postCount(ctx);
      return result(
        this,
        posts === outputs.length,
        `posts=${posts} expected=${outputs.length}`,
      );
    },
  },
  {
    id: "FC-019",
    family: "D",
    suites: ["all", "concurrency"],
    mode: "rate_limit_429",
    run: async function (this: ScenarioDefinition, ctx) {
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: `429-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const posts = postsForOperation(ctx, `429-${ctx.seed}`);
      return result(
        this,
        posts <= 2 && emit.state !== "RECHAZADO",
        `429 handled state=${emit.state} posts=${posts}`,
      );
    },
  },
  {
    id: "FC-020",
    family: "E",
    suites: ["all", "isolation"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const [a, b] = await Promise.all([
        ctx.sut.emit({
          tenantId: "tenant-a",
          operationId: `iso-a-${ctx.seed}`,
          docType: "01",
          amountMinor: 1n,
          currency: "CRC",
        }),
        ctx.sut.emit({
          tenantId: "tenant-b",
          operationId: `iso-b-${ctx.seed}`,
          docType: "01",
          amountMinor: 1n,
          currency: "CRC",
        }),
      ]);
      const logs = ctx.simulator.getLog().filter((e) => e.method === "POST");
      const aLog = logs.find((e) => e.clave === a.clave);
      const bLog = logs.find((e) => e.clave === b.clave);
      const ok =
        aLog?.emisor !== bLog?.emisor &&
        a.clave !== b.clave &&
        minimalStructuralCheck({ clave: a.clave, docType: "01" }).ok;
      return result(this, Boolean(ok), "distinct emisor per tenant");
    },
  },
  {
    id: "FC-021",
    family: "E",
    suites: ["all", "isolation"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const b = await ctx.sut.emit({
        tenantId: "tenant-b",
        operationId: `cross-${ctx.seed}`,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      let denied = false;
      try {
        await ctx.sut.status("tenant-a", b.clave);
      } catch (err) {
        denied = true;
        void err;
      }
      return result(this, denied, `cross-tenant status denied=${denied}`);
    },
  },
  {
    id: "FC-022",
    family: "E",
    suites: ["all", "isolation"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const ops = await Promise.all([
        ctx.sut.emit({
          tenantId: "tenant-a",
          operationId: `iss-1-${ctx.seed}`,
          docType: "01",
          amountMinor: 1n,
          currency: "CRC",
        }),
        ctx.sut.emit({
          tenantId: "tenant-a",
          operationId: `iss-2-${ctx.seed}`,
          docType: "01",
          amountMinor: 1n,
          currency: "CRC",
        }),
      ]);
      const ok = ops[0].consecutivo !== ops[1].consecutivo;
      return result(this, ok, "same issuer partitioned consecutivos");
    },
  },
  {
    id: "FC-023",
    family: "F",
    suites: ["all", "recovery"],
    mode: "accepted",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `rst-pre-${ctx.seed}`;
      const ext = ctx.sut as FiscalSut & {
        _markPreEmit?: (op: string, tenant: string, dt: "01" | "04") => void;
      };
      ext._markPreEmit?.(op, "tenant-a", "01");
      await ctx.sut.restart();
      const emitted = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const posts = postsForOperation(ctx, op);
      return result(
        this,
        posts === 1,
        `restart completes single POST posts=${posts} clave=${emitted.clave.length}`,
      );
    },
  },
  {
    id: "FC-024",
    family: "F",
    suites: ["all", "recovery"],
    mode: "processing",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `rst-pend-${ctx.seed}`;
      const emitted = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      await ctx.sut.restart();
      const st = await ctx.sut.status("tenant-a", emitted.clave);
      return result(
        this,
        st.state === "ACEPTADO" || st.state === "PROCESANDO" || st.state === "PENDIENTE",
        `after restart state=${st.state}`,
      );
    },
  },
  {
    id: "FC-031",
    family: "F",
    suites: ["all", "recovery"],
    mode: "tcp_cut_post",
    run: async function (this: ScenarioDefinition, ctx) {
      const op = `tcp-${ctx.seed}`;
      ctx.simulator.clearLog();
      const emit = await ctx.sut.emit({
        tenantId: "tenant-a",
        operationId: op,
        docType: "01",
        amountMinor: 1n,
        currency: "CRC",
      });
      const posts = postsForOperation(ctx, op);
      const claves = ctx.simulator
        .getLog()
        .filter((e) => e.method === "POST" && e.body.includes(op))
        .map((e) => e.clave)
        .filter(Boolean);
      const uniqueClaves = new Set(claves);
      const ok = posts === 1 && uniqueClaves.size <= 1;
      return result(
        this,
        ok,
        `tcp-cut posts=${posts} claves=${uniqueClaves.size} state=${emit.state}`,
      );
    },
  },
];

export function listScenarios(): CanonicalScenarioId[] {
  return SCENARIO_DEFINITIONS.map((s) => s.id);
}