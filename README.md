# QUIMERA

Toolkit local-first para cumplimiento fiscal de Costa Rica, migración de datos con procedencia y operación de taller. El flujo de demostración es offline: importar `fixtures/demo-hvac-1000`, pausar en conflictos, migrar, operar OficiOS y contrastar un punto de venta con Factura CI.

## Arranque local

Requisitos: Node.js 22, pnpm 10.33.4 y Docker.

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera pnpm oficios:serve
```

OficiOS escucha en `http://127.0.0.1:8787`. En otra terminal:

```bash
pnpm --filter @quimera/oficios dev:web
```

La interfaz queda en `http://127.0.0.1:5173` y proxya `/api` hacia el puerto 8787. Los nombres de cliente y equipo salen de PostgreSQL.

Comprobación del guión de cuatro actos, sin red externa:

```bash
QUIMERA_AI_ENABLED=false pnpm demo:verify
```

## CLI

Los logs van a stderr como JSON. Con `--json`, el resultado de negocio queda solo en stdout.

```bash
pnpm quimera -- pipeline run pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json
pnpm quimera -- exodus decisions apply --file decisions-demo.yaml --json
pnpm quimera -- pipeline resume --run <run_id> --manifest pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json
pnpm quimera -- passport verify --all --mode fixture --json
pnpm quimera -- factura-ci run --target fixture:buggy --format json
pnpm quimera -- factura-ci run --target fixture:compliant --format json
```

`pipeline run` sale con código 3 mientras `decisions-demo.yaml` está en `status: DRAFT`. `decisions apply` lo marca `APPLIED` y `resume` termina la carga.

## Ejemplos

Hay cuatro recorridos mínimos en `examples/01-exodus-profile`, `examples/02-pipeline`, `examples/03-passport` y `examples/04-factura-ci`.

## Calidad

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:isolation
pnpm test:security
```

`pnpm test:isolation` empaqueta cada `@quimera/*` con `pnpm deploy` y comprueba que no instala OficiOS ni Clairic.
