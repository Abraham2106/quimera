# Contributing

Usá **Node.js 22+** y la versión de `pnpm` declarada en `package.json` (`pnpm@10.33.4`). Con Corepack disponible, corré `corepack enable`; si no, instalá pnpm siguiendo las [instrucciones oficiales](https://pnpm.io/installation).

## Arranque y verificación local

Cloná el repositorio, levantá PostgreSQL 16 (con rol no superusuario `quimera`) y corré la compuerta unificada:

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm verify
```

Si corrés PostgreSQL 16 directamente en tu host sin Docker, creá un rol `quimera` con `NOSUPERUSER NOBYPASSRLS` (podés usar `node scripts/ci-prepare-role.mjs` con `CI_POSTGRES_ADMIN_URL`) y exportá `DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera`.

`pnpm verify` ejecuta en modo 100% offline:

1. `pnpm spec:validate` (validación estricta de specs y deltas OpenSpec en `openspec/`)
2. `pnpm typecheck` (9 paquetes)
3. `pnpm lint`
4. `pnpm test` (suite completa contra PostgreSQL 16)
5. `pnpm test:security` (aislamiento RLS por tenant, XXE, loopback-only, CAS)
6. `pnpm test:isolation` (instala cada paquete `@quimera/*` con `pnpm deploy` verificando que no arrastra `@quimera/oficios` ni `@quimera/adapter-clairic`)
7. `pnpm demo:verify` (guión completo de cuatro actos con `QUIMERA_AI_ENABLED=false`)

`pnpm verify` deshabilita explícitamente IA y tokens externos aunque estén definidos en tu shell. Nunca envía comprobantes reales a Hacienda ni consume APIs públicas en vivo.

## Guía del repositorio

- Agentes de código e IA deben empezar por [`AGENTS.md`](AGENTS.md).
- Contratos de comportamiento y propuestas de cambio: [`openspec/README.md`](openspec/README.md) (`pnpm spec:validate`).
- Arquitectura, dependencias permitidas y ADRs: [`docs/04-architecture/software-architecture.md`](docs/04-architecture/software-architecture.md) y [`docs/DECISIONS.md`](docs/DECISIONS.md).
- Estrategia y matriz de pruebas: [`docs/08-quality/test-strategy.md`](docs/08-quality/test-strategy.md).
- Política de seguridad y límites operativos: [`SECURITY.md`](SECURITY.md).

Cambios solo de documentación no requieren un Changeset salvo que acompañen un cambio de comportamiento en un paquete.

## Trabajar en un solo paquete

```sh
pnpm --filter @quimera/core test
pnpm --filter @quimera/data-exodus test
pnpm --filter @quimera/cr-api-passport typecheck
pnpm --filter @quimera/oficios dev:web
```

Para inspeccionar vulnerabilidades de alto impacto igual que CI:

```sh
pnpm audit --audit-level=high
```

## Convenciones de PR

- Mantené los secretos en variables de entorno; `.env.example` lista las variables admitidas. Nunca commitees `.env`, certificados `.p12`, PINs, tokens ni datos reales de clientes.
- Respetá la dirección de dependencias y el aislamiento de paquetes (`pnpm test:isolation`): ningún paquete del núcleo debe importar `@quimera/oficios` ni `@quimera/adapter-clairic`.
- Incluí pruebas de regresión conductual para cualquier cambio de lógica, sin relajar aserciones para que pase un fixture.
- Usá `pnpm changeset` para cambios de versión/comportamiento en paquetes reutilizables.
- Ejecutá `pnpm verify` antes de abrir un pull request.
