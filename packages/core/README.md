# @quimera/core

Contratos de dominio compartidos, aritmética monetaria exacta, normalización de identificaciones de Costa Rica, hashing canónico y puertos base del monorepo QUIMERA.

## Responsabilidad

`@quimera/core` es la raíz del grafo de dependencias (`core → módulos → apps`). No depende de PostgreSQL, HTTP, OficiOS ni adaptadores de IA.

## Exports principales

| Export | Tipo | Descripción |
| --- | --- | --- |
| `parseCrMoney`, `addMoney`, `subMoney`, `addFiscalAmounts`, `toFiscalMinor` | Funciones | Aritmética monetaria sin pérdida por coma flotante (`CRC_CENT_SCALE`, `FISCAL_MINOR_SCALE`) |
| `normalizeCrIdentification` | Función | Normalización determinista de cédulas físicas, jurídicas, DIMEX y NITE |
| `canonicalizeJsonValue`, `canonicalJsonString`, `sha256CanonicalJson` | Funciones | Serialización canónica y SHA-256 para trazabilidad y checkpoints |
| `CORE_CONTRACT_VERSION`, `isContractCompatible`, `parseSemVer` | Utilidades | Verificación de compatibilidad de contratos entre pasos |
| `schemas/*`, `ports/*` | Contratos | Esquemas Zod y puertos compartidos (`SourceImporterPort`, etc.) |

## Pruebas

```bash
pnpm --filter @quimera/core typecheck
pnpm --filter @quimera/core test
```

Consultá [`docs/06-interfaces/public-contracts.md`](../../docs/06-interfaces/public-contracts.md) para la especificación completa de contratos.
