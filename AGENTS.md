# Agent instructions

## Start here

QUIMERA is a local-first TypeScript monorepo for Costa Rica data migration with
provenance, verifiable public API contracts, transactional fiscal outbox testing,
and reference workshop operations. Use source code, package manifests, and CI
(`.github/workflows/ci.yml`) as the authority for current behavior; update
related documentation when behavior changes.

- `packages/core/`: shared domain contracts, money math, canonical hashing, CR ID normalization, Zod schemas, and ports.
- `packages/data-exodus/`: structural profiling, deterministic `mapping.yaml`, CSV/XLSX/FE XML/JSON/SQLite importers, reconciliation, human decision gate, resumable batches, and PostgreSQL provenance loader.
- `packages/pipeline/`: declarative DAG runner, PostgreSQL checkpoints, exit code `3` human approval pause, and resume.
- `packages/cr-api-passport/`: verifiable CR API manifests (Hacienda, BCCR SDDE, SNIT), guarded HTTP client (Zod, TTL cache, token bucket, circuit breaker), drift verifier, CLI, and MCP `stdio` server.
- `packages/fiscal-outbox/`: PostgreSQL transactional fiscal outbox with atomic consecutive allocation and lease-based delivery worker.
- `packages/factura-ci/`: deterministic loopback Hacienda simulator and behavioral resilience suite (`FC-001`..`FC-024`, `FC-031`).
- `packages/adapter-clairic/`: optional, isolated deterministic AI extraction stub (`QUIMERA_AI_ENABLED=false` by default).
- `apps/oficios/`: reference HVAC workshop app (Hono HTTP API on `127.0.0.1:8787`, Drizzle migrations, React/Vite UI).
- `apps/demo-pos/`: buggy vs outbox-backed POS harness built against `@dojocoding/hacienda-sdk` and `@quimera/factura-ci`.

### Dependency direction

```text
@quimera/core
  ├── @quimera/data-exodus
  ├── @quimera/cr-api-passport
  └── @quimera/fiscal-outbox
        ├── @quimera/factura-ci
        └── @quimera/pipeline
              └── apps/oficios, apps/demo-pos
```

Hard isolation invariant (enforced by `pnpm test:isolation`):
- No `@quimera/*` core package may depend on or import `apps/oficios` (`@quimera/oficios`) or `@quimera/adapter-clairic`.
- Put reusable domain logic in `packages/*`, never inside `apps/*`.

## Workflow and verification

Use Node.js 22+ and the pnpm version pinned in `package.json` (`pnpm@10.33.4`),
with PostgreSQL 16 running under a **non-superuser** role (`NOSUPERUSER NOBYPASSRLS`)
so PostgreSQL Row-Level Security policies are genuinely exercised.

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm verify
```

`pnpm verify` is the local end-to-end offline gate: typecheck, lint, full test
suite, security tests, `pnpm deploy` package isolation, and `demo:verify` with
`QUIMERA_AI_ENABLED=false`. Run `pnpm audit --audit-level=high` to match CI's
dependency audit step.

Inspect `git status` before editing. Preserve unrelated changes and untracked
files. Stage only files belonging to your task.

## Code and public contracts

- Use strict TypeScript, ESM, `.js` relative import specifiers, and type-only imports where appropriate.
- Keep Zod schemas, exported types, CLI `--json` stdout payloads (logs to stderr only), and package READMEs aligned when changing public interfaces.
- Do not weaken assertions, RLS policies, or fixture anomaly counts (`40/12/7/3/1`) to make a test pass.
- Verify standalone packaging with `pnpm test:isolation` whenever changing `package.json` dependencies or exports.

## Operational boundaries

- Use synthetic fixtures (`fixtures/demo-hvac-1000`, `packages/cr-api-passport/fixtures`) and loopback servers for routine development. Never commit `.env`, `.p12` certificates, PINs, BCCR tokens, or real taxpayer/customer records.
- `Factura CI` runs loopback-only (`127.0.0.1`) and rejects non-loopback targets (`ERR_SEC_LOOPBACK_ONLY`). Passing `Factura CI` tests behavioral resilience against a local simulator; it **never** constitutes official Ministerio de Hacienda certification or fiscal acceptance.
- `OficiOS` MVP uses test headers (`x-tenant-id`, `x-test-role`, `x-actor-id`) on `127.0.0.1`; do not claim production authentication or `ofi_*` RLS until implemented.
- Never hit live Hacienda/BCCR endpoints in default tests or CI; live passport verification requires explicit opt-in (`--mode live`).

## Documentation map

- [README](README.md): product overview, quickstart, CLI, MCP, and boundaries.
- [Docs index](docs/README.md): full 12-phase engineering documentation map.
- [Architecture](docs/04-architecture/software-architecture.md) and [ADRs](docs/DECISIONS.md).
- [API Passport design](docs/06-interfaces/api-passport-design.md) and [MCP design](docs/06-interfaces/MCP-design.md).
- [Factura CI scenarios](docs/08-quality/failure-scenarios.md) and [Test strategy](docs/08-quality/test-strategy.md).
- [Security](SECURITY.md) and [Threat model](docs/07-security/threat-model.md).
- [Contributing](CONTRIBUTING.md) and [Implementation status](docs/IMPLEMENTATION_STATUS.md).
