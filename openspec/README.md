# OpenSpec — raíz de contratos de comportamiento de QUIMERA

Este directorio es la raíz OpenSpec del repositorio: aquí viven las **specs principales** (el comportamiento observable vigente del sistema) y los **changes** (las propuestas de evolución con su propuesta, delta de spec, diseño y tareas).

```text
openspec/
├── config.yaml                          # esquema spec-driven, contexto e invariantes de QUIMERA
├── BACKFILL.md                          # registro de reconciliación del baseline MVP
├── specs/                               # specs principales vigentes, por capacidad (un solo segmento)
│   ├── core-contracts-money/
│   ├── exodus-profiling-mapping/
│   ├── exodus-ingestion-provenance/
│   ├── exodus-reconciliation-decisions/
│   ├── pipeline-dag-checkpoints/
│   ├── passport-registry-client/
│   ├── passport-mcp-server/
│   ├── fiscal-outbox-sequences/
│   ├── factura-ci-harness/
│   ├── oficios-workshop-flow/
│   └── clairic-optional-isolation/
└── changes/                             # cambios activos y archivo histórico
    ├── add-oficios-rls-policies/
    ├── replace-oficios-test-headers-auth/
    └── archive/                         # YYYY-MM-DD-<nombre>/
```

## Convenciones

- **Una spec principal por capacidad, en un solo segmento.** Las capacidades viven en `openspec/specs/<capacidad>/spec.md` sin subdirectorios anidados. Usá guiones para agrupar nombres.
- **Un cambio = propuesta con cuatro artefactos:** `proposal.md` (qué y por qué), delta en `specs/<capacidad>/spec.md` (`ADDED`, `MODIFIED` o `REMOVED`), `design.md` (cómo) y `tasks.md` (pasos verificables).
- **Las specs principales nunca se editan a mano para introducir cambios de producto:** todo cambio de comportamiento entra por `openspec/changes/<nombre>/` y se sincroniza sobre `openspec/specs/` al archivar.
- **Primera línea normativa:** cada `### Requirement:` conserva su primer párrafo en una sola línea física con `SHALL`, `MUST` o `SHALL NOT` para mantener compatibilidad estricta con la CLI de OpenSpec.
- **Separación frente a `docs/`:** `docs/` conserva arquitectura, ADRs, investigación, threat model y guías; `openspec/` gobierna los contratos de comportamiento observable y los deltas de evolución.

## Relación con el código

Las specs describen **comportamiento observable**, no implementación interna. Cuando exista cualquier discrepancia entre una spec histórica y el runtime actual, prevalecen el código fuente, los manifiestos de paquetes y CI (`.github/workflows/ci.yml`), y la diferencia debe reconciliarse explícitamente.

## Comandos

```sh
pnpm spec:validate                     # valida todas las specs y cambios activos (--all --strict)
pnpm exec openspec list                # cambios en curso y avance de tareas
pnpm exec openspec list --specs        # capacidades vigentes y conteo de requirements
pnpm exec openspec show <item>         # detalle de una spec o cambio concreto
```

`pnpm spec:validate` se ejecuta tanto en `pnpm verify` como en CI. La validación estructural confirma el formato de specs y deltas; el cumplimiento en ejecución se comprueba con la suite de pruebas y `pnpm verify`.
