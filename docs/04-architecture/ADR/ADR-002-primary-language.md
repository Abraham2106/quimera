# ADR-002: Lenguaje Principal TypeScript-first con Puerta Aislada para Python Opcional

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-004`, `QR-NFR-005`, `QR-NFR-009`, `QR-CLAI-001`

## Contexto
QUIMERA integra software existente del ecosistema Dojo (`hacienda-cr`, `whatsapp-adapter`, `dojo-marketplace-mcp`), procesa CSV/XLSX/XML, opera PostgreSQL, expone CLI/HTTP/MCP y deja abierta la opción de ejecutar inferencia local de `Clairic` (PyTorch/Transformers en Python 3.11+).

## Problema
Seleccionar el lenguaje principal del núcleo y definir si se requiere una arquitectura políglota desde el MVP.

## Alternativas evaluadas
1. **TypeScript-first (strict ESM sobre Node.js 22+) en todo el núcleo**, con contratos JSON Schema y frontera HTTP opcional para módulos Python aislados (solo si se usa Clairic/Splink local).
2. **Python-first** para Data Exodus/Pipeline + **TypeScript** para Hacienda/OficiOS.
3. **Go o Rust** para Core/CLI + TypeScript para integraciones Dojo.

## Criterios de decisión
Reutilización directa de `@dojocoding/hacienda-sdk`, fricción de instalación para desarrolladores/vibe coders, tipado compartido entre backend/CLI/MCP/UI y costo operativo en hackathon.

## Evidencia relevante
- `@dojocoding/hacienda-sdk@0.13.0` exige **Node.js 22+ ESM** y usa **Zod v4**; reescribirlo o envolverlo mediante puentes IPC desde Python/Go añadiría latencia, serialización duplicada y bugs de mantenimiento.
- Los datasets PYME objetivo (1k–100k filas) se procesan en milisegundos/segundos con streaming en Node.js + PostgreSQL (`csv-parse`, `exceljs`, `pg`).
- Los pesos open-weight de `Clairic` requieren Python 3.11 + PyTorch + CUDA, pero Clairic es estrictamente opcional y también accesible por HTTP en Workers AI.

## Decisión
Adoptar **TypeScript (`strict: true`, ESM puro) sobre Node.js 22.13+** como lenguaje único del baseline y de todos los paquetes MVP. Cualquier capacidad futura que justifique Python (inferencia local de Clairic o matching probabilístico con Splink) se integrará exclusivamente como **servicio HTTP / subproceso aislado detrás de un puerto con contrato JSON Schema**.

## Consecuencias
- **Positivas:** Cero puentes FFI/IPC en MVP, reutilización nativa de `hacienda-sdk`, un solo toolchain (`pnpm`, Vitest, `fast-check`, Zod v4, ESLint).
- **Negativas:** Menor ecosistema nativo para ciencia de datos pesada/ML en memoria (aceptable porque el baseline es determinista y tabular PYME).

## Riesgos
- **Riesgo:** Cuellos de botella en procesamiento tabular de >1 millón de filas en un solo hilo JS.
- **Mitigación:** Procesamiento por streaming/chunks y delegación de matching masivo a índices `pg_trgm` / SQL en PostgreSQL.

## Condiciones de revisión
Si clientes piloto superan consistentemente 1M+ filas por lote o requieren entity resolution probabilística avanzada, evaluar un adaptador opcional en Python (DuckDB/Splink) detrás de `EntityMatcherPort`.
