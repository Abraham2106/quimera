# core-contracts-money Specification

## Purpose

Define el contrato base compartido por todos los paquetes de QUIMERA: aritmética monetaria sin pérdida por coma flotante, normalización de identificaciones de Costa Rica, hashing canónico determinista y compatibilidad SemVer de contratos.

## Requirements

### Requirement: La aritmética monetaria evita errores de coma flotante

El núcleo SHALL parsear montos costarricenses y operar sumas, restas y totales fiscales usando escalas enteras exactas (`CRC_CENT_SCALE` y `FISCAL_MINOR_SCALE`) sin depender de aritmética binaria de punto flotante imprecisa.

#### Scenario: Suma y resta exacta de montos en colones

- **WHEN** se parsean y suman o restan dos montos válidos con la misma moneda
- **THEN** el resultado conserva la escala exacta sin drift de decimales binarios

#### Scenario: Rechazo de montos inválidos o monedas incompatibles

- **WHEN** se intenta operar dos montos de monedas distintas o una cadena no numérica
- **THEN** la operación rechaza la entrada con un error estructurado

### Requirement: La normalización de identificaciones costarricenses es determinista

El núcleo SHALL normalizar identificaciones físicas, jurídicas, DIMEX y NITE eliminando separadores de formato sin alterar la identidad numérica ni inventar dígitos faltantes.

#### Scenario: Cédula con guiones y espacios se normaliza a dígitos canónicos

- **WHEN** se recibe una identificación con guiones o espacios (por ejemplo `3-101-123456`)
- **THEN** la salida produce la representación canónica estable para comparación y conciliación

### Requirement: El hashing canónico es independiente del orden de llaves JSON

El núcleo SHALL serializar valores JSON de forma canónica ordenando claves de objetos antes de calcular su digest SHA-256, garantizando el mismo hash para estructuras semánticamente equivalentes.

#### Scenario: Objetos con claves en distinto orden producen el mismo SHA-256

- **WHEN** se calcula `sha256CanonicalJson` sobre dos objetos con las mismas claves y valores en orden diferente
- **THEN** ambos digests SHA-256 son idénticos
