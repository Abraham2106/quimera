# exodus-profiling-mapping Specification

## Purpose

Describe el perfilado estructural determinista de fuentes tabulares heredadas y la propuesta automática de `mapping.yaml` hacia el esquema destino `oficios-v1`.

## Requirements

### Requirement: El perfilador clasifica columnas de Costa Rica de forma determinista

El perfilador SHALL inspeccionar las fuentes tabulares (incluyendo los siete archivos de `fixtures/demo-hvac-1000`) y detectar tipos estructurales costarricenses como identificaciones, códigos CAByS, claves de 50 dígitos, fechas mixtas y monedas sin requerir llamadas a IA ni red externa.

#### Scenario: Perfilado repetible sobre el fixture HVAC

- **WHEN** se ejecuta el perfilador dos veces sobre `fixtures/demo-hvac-1000`
- **THEN** ambos perfiles producen exactamente la misma clasificación de columnas y métricas

### Requirement: La propuesta de mapping marca revisiones humanas bajo umbral de confianza

El generador de `mapping.yaml` SHALL asignar puntuaciones de confianza deterministas a cada campo destino y marcar explícitamente `NEEDS_REVIEW` cuando la confianza cae por debajo del umbral configurado (`0.80`).

#### Scenario: Columna ambigua queda marcada para revisión humana

- **WHEN** una columna origen no supera el umbral de confianza hacia el esquema destino
- **THEN** la propuesta de mapeo incluye el marcador `NEEDS_REVIEW` en el YAML renderizado
