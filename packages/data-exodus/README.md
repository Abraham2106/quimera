# @quimera/data-exodus

Motor de rescate, perfilado estructural, reconciliación conservadora y carga con procedencia a PostgreSQL para datos heterogéneos de PYMEs en Costa Rica (CSV, XLSX, XML FE 4.4, JSON y SQLite).

## Qué resuelve

- **Perfilado estructural y `mapping.yaml`:** inspecciona archivos fuente (como `fixtures/demo-hvac-1000`), detecta cédulas, CAByS, claves de 50 dígitos, fechas mixtas y monedas, y propone un mapeo determinista marcando `NEEDS_REVIEW` cuando la confianza es baja.
- **Reconciliación conservadora:** detecta duplicados de clientes, facturas duplicadas, pagos mal atribuidos, identidades en conflicto y saldos irreconciliables sin sobrescribir ni descartar filas silenciosamente.
- **Compuerta de decisiones humanas:** bloquea la migración hasta que existan decisiones aprobadas (`decisions-demo.yaml`).
- **Lotes reanudables con verificación de integridad:** un lote detenido al 50% se reanuda al mismo resultado validando el SHA-256 del artefacto (`ResumeArtifactHashError` ante alteraciones).
- **Procedencia en PostgreSQL (`qum_*`):** conserva archivo fuente, fila y trazabilidad de cada entidad migrada (`trace`), bajo políticas `FORCE ROW LEVEL SECURITY`.

## Exports principales

| Export | Tipo | Descripción |
| --- | --- | --- |
| `loadDemoHvacTabularSources`, `profileTables`, `proposeMapping`, `renderMappingYaml` | Funciones | Perfilado estructural y propuesta determinista de `mapping.yaml` |
| `CsvSourceImporter`, `JsonSourceImporter`, `SqliteSourceImporter` | Clases | Importadores sobre `SourceImporterPort` con protección contra CSV formula injection |
| `applyDecision`, `applyDecisionById` | Funciones | Aplicación inmutable de decisiones humanas |
| `migrateVerified`, `runResumableBatch`, `artifactSha256` | Funciones | Carga verificada y ejecución reanudable con verificación SHA-256 |
| `loadDemoHvac1000`, `persistDemoHvacToOficios`, `trace` | Funciones | Carga del fixture HVAC a PostgreSQL y consulta de procedencia |

## Ejemplo rápido

Consultá el recorrido paso a paso en [`examples/01-exodus-profile/README.md`](../../examples/01-exodus-profile/README.md).

## Pruebas

```bash
pnpm --filter @quimera/data-exodus test
```

Documentación de diseño: [`docs/05-data/reconciliation-model.md`](../../docs/05-data/reconciliation-model.md) y [`docs/05-data/data-provenance.md`](../../docs/05-data/data-provenance.md).
