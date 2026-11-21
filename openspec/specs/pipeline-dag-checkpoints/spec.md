# pipeline-dag-checkpoints Specification

## Purpose

Describe el motor DAG declarativo, la persistencia de checkpoints en PostgreSQL, la pausa explícita en compuerta humana y el contrato de salida de la CLI unificada (`pnpm quimera`).

## Requirements

### Requirement: El motor valida el DAG y los contratos antes de ejecutar pasos

El motor de pipelines SHALL validar que el manifiesto YAML/JSON forme un grafo acíclico dirigido válido y que las versiones de contrato de entrada y salida entre pasos sean compatibles antes de iniciar la ejecución.

#### Scenario: Manifiesto con ciclo o incompatibilidad de contratos

- **WHEN** se envía una definición con un ciclo entre pasos o contratos incompatibles
- **THEN** el motor rechaza la ejecución con `ERR_PIPELINE_INVALID_DAG` o `ERR_PIPELINE_CONTRACT_MISMATCH`

### Requirement: La compuerta humana pausa el pipeline con código de salida 3 y permite reanudar

La ejecución de `pipelines/exodus-to-oficios.yaml` SHALL pausarse con código de salida `3` (`PIPELINE_EXIT_WAITING_APPROVAL`) mientras `decisions-demo.yaml` esté en `DRAFT`, y SHALL completar la carga tras aplicar decisiones y ejecutar `pipeline resume`.

#### Scenario: Pausa en DRAFT y finalización tras aplicar decisiones

- **WHEN** se ejecuta `pipeline run` con `decisions-demo.yaml` en `status: DRAFT`, luego se corre `exodus decisions apply` y después `pipeline resume`
- **THEN** la primera corrida devuelve exit code `3` con un `run_id`, y la reanudación devuelve exit code `0` completando la carga

### Requirement: El modo --json mantiene stdout libre de logs y avisos de PostgreSQL

La CLI unificada (`pnpm quimera`) SHALL enviar todos los logs estructurados exclusivamente a `stderr` y suprimir avisos `NOTICE` de PostgreSQL durante `--json`, garantizando que `stdout` sea JSON válido parseable.

#### Scenario: Salida limpia en pipeline resume --json

- **WHEN** se invoca `pnpm quimera -- pipeline resume ... --json`
- **THEN** `stdout` contiene únicamente un objeto JSON válido sin líneas de log ni avisos `NOTICE`
