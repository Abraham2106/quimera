# @quimera/pipeline

Motor DAG declarativo con checkpoints en PostgreSQL, validación de contratos entre pasos, pausa explícita en compuerta humana (código de salida `3`) y reanudación determinista.

## Uso desde la CLI raíz

```bash
# Ejecuta el pipeline; sale con código 3 mientras decisions-demo.yaml esté en DRAFT
pnpm quimera -- pipeline run pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json

# Aplica las decisiones humanas
pnpm quimera -- exodus decisions apply --file decisions-demo.yaml --json

# Reanuda desde el checkpoint y completa la carga en PostgreSQL
pnpm quimera -- pipeline resume --run <run_id> --manifest pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json
```

Los logs estructurados se escriben exclusivamente a `stderr`; con `--json`, `stdout` contiene únicamente el resultado JSON del comando.

## Códigos de salida semánticos

| Código | Constante | Significado |
| --- | --- | --- |
| `0` | `PIPELINE_EXIT_SUCCESS` | Ejecución completada sin errores |
| `1` | `PIPELINE_EXIT_ERROR` | Error de ejecución o contrato |
| `3` | `PIPELINE_EXIT_WAITING_APPROVAL` | Pausado esperando compuerta humana (`decisions-demo.yaml`) |

## Exports principales

| Export | Tipo | Descripción |
| --- | --- | --- |
| `parsePipelineManifest`, `validatePipelineDefinition`, `validateDagAndContracts` | Funciones | Parseo YAML/JSON y validación de DAG y contratos |
| `runPipeline`, `resumePipeline`, `executePipeline` | Funciones | Ejecución y reanudación desde checkpoints en PostgreSQL |
| `computeStepInputHash` | Función | Hash determinista de entradas para idempotencia |
| `runCli` | Función | Punto de entrada de la CLI de pipeline |

## Ejemplo y pruebas

Recorrido ejecutable: [`examples/02-pipeline/README.md`](../../examples/02-pipeline/README.md).

```bash
pnpm --filter @quimera/pipeline test
```

Diseño completo: [`docs/04-architecture/pipeline-architecture.md`](../../docs/04-architecture/pipeline-architecture.md).
