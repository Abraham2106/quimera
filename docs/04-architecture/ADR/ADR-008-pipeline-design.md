# ADR-008: Diseño del Motor de Pipelines (DAG Determinista + Checkpoints)

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-PIPE-001` a `QR-PIPE-007`, `QR-DATA-012`

## Contexto
QUIMERA necesita componer módulos (`exodus.ingest`, `exodus.profile`, `exodus.reconcile`, `exodus.migrate`, `passport.verify`) con validación de contratos, reanudación tras fallos y pausas explícitas para revisión humana.

## Problema
Elegir entre integrar un orquestador externo pesado (Airflow/Temporal/Cloudflare Workflows) o construir un motor DAG embebible y determinista en `@quimera/pipeline`.

## Alternativas evaluadas
1. **Motor DAG declarativo ligero en `@quimera/pipeline` (YAML/JSON + `StepRegistry` + checkpoints en PostgreSQL)** con semántica `at-least-once` + idempotencia y compuerta `WAITING_FOR_APPROVAL`.
2. **Apache Airflow / Prefect / Temporal** desde el MVP.
3. **Scripts bash/TS lineales** sin validación de contratos ni checkpoints.

## Criterios de decisión
Simplicidad de instalación local/CI, validación estática de contratos entre pasos, soporte nativo de pausa para revisión humana y honestidad sobre garantías de entrega.

## Evidencia relevante
- Airflow y Temporal exigen levantar servicios/clústeres dedicados, rompiendo el requisito de instalación local en ≤5 min (`QR-NFR-008`).
- Scripts lineales no detectan incompatibilidades de contratos antes de correr ni reanudan desde el paso 3 tras una pausa humana o un crash.

## Decisión
Construir **`@quimera/pipeline`** como un motor DAG acíclico embebible en Node.js 22 que:
- Valida aciclicidad y compatibilidad SemVer de contratos antes de ejecutar.
- Persiste `execution_runs` y `checkpoints` atómicos en PostgreSQL.
- Solo permite reintentos automáticos en pasos marcados `idempotent: true`.
- Soporta compuerta `human_review` (`exit code 3` + `resume`) y compensaciones explícitas declaradas.

## Consecuencias
- **Positivas:** Composición limpia, cero infraestructura extra, reanudación reproducible y soporte nativo de revisión humana.
- **Negativas:** No está diseñado para ejecutar miles de workflows distribuidos en clúster (intencionalmente fuera del alcance MVP).

## Riesgos
- **Riesgo:** Re-crecimiento hacia un orquestador generalista que compita con Temporal/Airflow.
- **Mitigación:** Mantener el alcance estrictamente acotado a composición de pasos declarativos de QUIMERA (sin cron distribuido ni cluster scheduler).

## Condiciones de revisión
Si despliegues futuros requieren ejecución distribuida de miles de pipelines simultáneos, exponer un adaptador de ejecución sobre Temporal o Cloudflare Workflows manteniendo intacto el formato declarativo del DAG.
