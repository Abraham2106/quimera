# Diseño de CR API Passport — Catálogo Verificable de APIs de Costa Rica

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Investigación Técnica](../01-research/technical-landscape.md) | [Registro de Investigación](../RESEARCH_LOG.md) | [Ejemplo CAByS](./contracts/passport-hacienda-cabys.yaml)

---

## 1. Propósito y Diferenciación

`CR API Passport` (`@quimera/cr-api-passport`) no es un simple wrapper HTTP ni un duplicado de `jmnzcn/mcp-hacienda-cr`. Es una **capa de conocimiento ejecutable y verificable** compuesta por:

1. **Manifiestos declarativos (`ApiPassport` YAML/JSON):** documentan endpoints oficiales reales, métodos, parámetros, autenticación, cuotas oficiales, políticas de caché, tratamiento de PII y casos de prueba.
2. **Adaptadores tipados con guardrails:** generan/proveen clientes TypeScript con validación Zod en runtime, *token bucket* conservador (para evitar bans de IP), caché TTL configurable y clasificación estricta de errores.
3. **Motor de verificación de deriva (*Drift Detector*):** compara las respuestas reales observadas contra el contrato declarado y clasifica cambios (`COMPATIBLE_ADDITION`, `BREAKING_MISSING_FIELD`, `BREAKING_TYPE_CHANGE`, `AUTH_REQUIRED`, `ENDPOINT_DEPRECATED`, `RATE_LIMIT_CHANGED`).

---

## 2. Catálogo Verificado de APIs Costarricenses (Fuente Primaria 2026-11-21)

### 2.1. Pasaportes en Alcance MVP (3 Pasaportes Verificados)

| Passport ID | Proveedor | Base URL y Endpoints Oficiales | Auth | Límites Oficiales y Guardrail QUIMERA | Caché TTL sugerido | PII |
|---|---|---|---|---|---|---|
| `cr.hacienda.taxpayer` | Ministerio de Hacienda | `https://api.hacienda.go.cr/fe/ae?identificacion={id}` (9–12 dígitos) | Pública (sin credenciales) | Oficial: ráfaga 20 req/s (5s, máx 100), sostenido 10 req/s (120s, máx 1200) → **ban IP 10 min**. **Guardrail QUIMERA:** 15 req/s ráfaga, 8 req/s sostenido + backoff exponencial + `Retry-After`. | 24 h (estado tributario/actividades) | **Sí (Moderada):** nombre legal/físico, cédula, régimen y actividades económicas públicas. No loguear PII en texto plano. |
| `cr.hacienda.cabys` | Ministerio de Hacienda | `https://api.hacienda.go.cr/fe/cabys?q={texto}` (mín. 3 chars) y `?codigo={13_digitos}` | Pública (sin credenciales) | Igual cuota compartida IP con `api.hacienda.go.cr`. **Guardrail QUIMERA:** bucket compartido por host `api.hacienda.go.cr`. | 7 días (catálogo relativamente estable) | **No** (catálogo de bienes/servicios e IVA). |
| `cr.hacienda.fx` + `cr.bccr.sdde` | Hacienda / BCCR SDDE | **Hacienda (público):** `/indicadores/tc/dolar`, `/indicadores/tc/dolar/historico`, `/indicadores/tc/euro`, `/indicadores/tc`.<br/>**BCCR SDDE (autenticado):** `https://apim.bccr.fi.cr/SDDE/api/Bccr.Ge.SDDE.Publico.Indicadores.API` (`/indicadoresEconomicos/{codigo}/series`, `/metadata`, `/descargar`, `/cuadro/{codigo}/...`, `/Usuario/ValideSuscripcion`). | Hacienda: **Ninguna**.<br/>BCCR SDDE: **`Authorization: Bearer <token>`** obtenido tras registro en SDDE (`Mi Perfil -> Generar token`). | Hacienda: cuota compartida IP.<br/>BCCR SDDE: límites sujetos a suscripción; el servicio SOAP antiguo **dejó de funcionar el 30 jun 2026** (prohibido usar URLs heredadas). | 1 h para tipo de cambio del día; inmutable para fechas históricas pasadas. | **No** (indicadores macroeconómicos). Token Bearer es **secreto sensible**. |

> **Hallazgo de deriva real documentado (BCCR SDDE):** El propio PDF oficial del BCCR contiene inconsistencias de capitalización en ejemplos de rutas (`Bccr.Ge.SDDE` vs `Bccr.GE.sddE`). El pasaporte `cr.bccr.sdde` fija la ruta canónica y verifica explícitamente el comportamiento HTTP en su prueba de contrato. Además, se registra la nota de servicio del 20-nov-2026 sobre la migración del cuadro «Resumen del Mercado Financiero Internacional» a Power BI (4 dic 2026 sin API temporal).

### 2.2. Servicios Documentados para Fases Post-MVP (Sin Inventar Contratos)

| Passport ID (Futuro) | Proveedor | Estado verificado | Política QUIMERA |
|---|---|---|---|
| `cr.hacienda.exoneraciones` | Ministerio de Hacienda | Público verificado (`/fe/ex?autorizacion=AL-XXXXXXXX-XX`, `/fe/agropecuario`, `/fe/pesca`) | Candidato inmediato para Beta Técnica. |
| `cr.snit.geodata` | IGN / SNIT Costa Rica | Servicios OGC públicos verificados (WMS, WFS, WMTS, Esri REST, OGC API-Features; CRS CR-SIRGAS/CRTM05 EPSG:8908/5367 y WGS84 EPSG:4326) | Candidato para enriquecimiento geográfico de direcciones en OficiOS/Data Exodus post-MVP. |
| `cr.correos.pymexpress` | Correos de Costa Rica | **API Privada:** requiere contrato comercial Pymexpress (`pymexpress@correos.go.cr`) o Fulfillment WMS; emite credenciales privadas (`Username`, `Password`, `Usuario ID`, `Servicio ID`, `Código de cliente`). | **Nunca inventar endpoints ni contratos.** Solo se publicará pasaporte cuando exista documentación oficial formal y sandbox autorizado (`QR-PASS-006`). |

---

## 3. Política de Errores, Reintentos, Cacheo y Credenciales

### 3.1. Mapeo Estándar de Errores Externos

| Condición HTTP / Red | Código `QuimeraError` | `retryable` | Acción del adaptador |
|---|---|---|---|
| `400 Bad Request` (ej. `q` < 3 chars o cédula mal formada) | `ERR_PASS_INVALID_INPUT` | `false` | Validar localmente con Zod antes de siquiera llamar a la red. |
| `401 / 403` (ej. falta `BCCR_SDDE_TOKEN` o token expirado) | `ERR_AUTH_MISSING_CREDENTIALS` | `false` | Fallar rápido con instrucciones explícitas de configuración (`QR-PASS-006`); jamás inventar respuesta. |
| `404 Not Found` (ej. contribuyente no existe) | `ERR_PASS_NOT_FOUND` | `false` | Retornar resultado tipado `notFound` (no confundir con error de red). |
| `429 Too Many Requests` | `ERR_PASS_RATE_LIMITED` | `true` | Abrir circuit-breaker local por host (`api.hacienda.go.cr`) respetando `Retry-After` o mínimo 60s (evitar escalar a ban de 10 min). |
| `5xx` o `ETIMEDOUT` | `ERR_PASS_UPSTREAM_UNAVAILABLE` | `true` | Reintento acotado (máx 2 con backoff exponencial + jitter) solo en `GET` idempotentes; fallback a caché stale solo si el consumidor lo autoriza explícitamente (`allowStale: true`, marcado con advertencia `W_PASS_STALE_CACHE`). |
| Respuesta HTTP 200 que no cumple el Zod schema del pasaporte | `ERR_PASSPORT_CONTRACT_DRIFT` | `false` | Reportar ruta JSON exacta, tipo esperado vs observado y emitir reporte de deriva. |

### 3.2. Política de Pruebas con Mocks vs Verificación Live
- **Modo `mock` (default en PR CI y demo offline):** Todas las pruebas de contrato corren contra fixtures HTTP grabados y versionados (`packages/cr-api-passport/fixtures/*.json`) servidos en loopback local. Cero llamadas a Internet, 100% determinista.
- **Modo `live` (cron nocturno / manual `quimera passport verify --live`):** Ejecuta consultas controladas contra el endpoint real respetando rate-limits (máx 1 req/s) y genera un `DriftReport` estructurado. Si detecta `AUTH_REQUIRED` sin credencial configurada, marca el pasaporte como `SKIPPED_MISSING_CREDENTIALS` (nunca `PASS` falso ni fallo por invención).
