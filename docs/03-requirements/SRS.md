# Especificación de Requisitos de Software (SRS) — QUIMERA

- **Documento:** `docs/03-requirements/SRS.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Línea base v1.0 para arquitectura e implementación
- **Alineación metodológica:** Estructurado siguiendo las buenas prácticas de **ISO/IEC/IEEE 29148** (claridad, singularidad, verificabilidad y trazabilidad), **sin afirmar cumplimiento normativo formal no auditado**.
- **Catálogo detallado de IDs:** [`docs/03-requirements/requirements-catalog.md`](./requirements-catalog.md)
- **Priorización y alcance:** [`docs/03-requirements/scope-and-priorities.md`](./scope-and-priorities.md)

---

## 1. Introducción

### 1.1. Propósito
Definir los requisitos funcionales, no funcionales, de interfaces, seguridad, privacidad, datos, interoperabilidad, observabilidad, instalación, mantenibilidad, despliegue y evolución del ecosistema **QUIMERA**, de modo que un equipo humano o un agente de programación pueda implementar y verificar cada módulo de forma independiente y consistente.

### 1.2. Alcance
QUIMERA es un toolkit modular open-source (licencia MIT proyectada para el núcleo) compuesto por paquetes independientes (`@quimera/core`, `@quimera/data-exodus`, `@quimera/cr-api-passport`, `@quimera/factura-ci`, `@quimera/fiscal-outbox`, `@quimera/pipeline`), una aplicación consumidora demostrativa (`@quimera/oficios`) y un adaptador opcional de extracción estructurada (`@quimera/adapter-clairic`).

### 1.3. Definiciones, acrónimos y abreviaturas
Toda la terminología de dominio está normalizada en [`docs/02-product/domain-glossary.md`](../02-product/domain-glossary.md). Acrónimos principales: **FE 4.4** (Facturación Electrónica v4.4 DGT Costa Rica), **CAByS** (Catálogo de Bienes y Servicios), **SDDE** (Sistema de Divulgación de Datos Económicos BCCR), **SNIT** (Sistema Nacional de Información Territorial), **SUT** (System Under Test), **CAS** (Content-Addressed Storage), **RLS** (Row-Level Security), **MCP** (Model Context Protocol).

---

## 2. Descripción general y contexto operativo

### 2.1. Stakeholders
Definidos en detalle en [`docs/02-product/stakeholders-and-personas.md`](../02-product/stakeholders-and-personas.md) (`STK-01` a `STK-10`).

### 2.2. Contexto operativo
QUIMERA debe operar en dos perfiles principales:
1. **Perfil Local / CI (Baseline MVP):** Estación de trabajo de desarrollador o runner CI con **Node.js 22.13+**, **PostgreSQL 16+** (Docker o nativo) y sistema de archivos local para `ArtifactStorePort`. Funciona **100% offline** usando fixtures y simuladores deterministas, sin claves de IA ni GPU.
2. **Perfil Producción PYME / Agencia (Post-MVP):** Despliegue en VPS/contenedor gestionado (Node 22 + PostgreSQL gestionado tipo Supabase/Neon + S3/R2 para evidencia inmutable), con acceso controlado a APIs externas de Hacienda, BCCR SDDE y opcionalmente Workers AI (Clairic) / WhatsApp Cloud API.

### 2.3. Restricciones
- **C-01 (Baseline sin IA):** El sistema completo en su versión baseline DEBE operar sin modelos de IA, sin GPU y sin inferencia externa (`QR-CORE-004`).
- **C-02 (Independencia de módulos):** Instalar `@quimera/data-exodus`, `@quimera/cr-api-passport` o `@quimera/factura-ci` NO puede requerir instalar `@quimera/oficios` ni `@quimera/adapter-clairic` (`QR-CORE-002`).
- **C-03 (Runtime Node 22+ ESM):** Impuesto por la dependencia verificada `@dojocoding/hacienda-sdk@0.13.0` (`engines.node >= 22`, ESM puro).
- **C-04 (Límites oficiales de Hacienda):** `api.hacienda.go.cr` aplica bloqueo de IP por 10 minutos al exceder 20 req/s en 5s (máx 100) o 10 req/s sostenidos en 120s (máx 1200).
- **C-05 (BCCR SDDE obligatorio):** El antiguo Web Service SOAP del BCCR fue deshabilitado el 2026-06-30; toda consulta al BCCR exige Bearer Token sobre SDDE REST.
- **C-06 (Higiene de licencias):** No incluir ni redistribuir código de `make-no-mistakes-toolkit` (BSL 1.1) en los paquetes de QUIMERA.
- **C-07 (No certificación fiscal oficial):** Factura CI y el verificador de firmas jamás pueden declarar «aceptación legal ante Hacienda».

### 2.4. Supuestos y dependencias
- **Supuestos registrados** en [`docs/ASSUMPTIONS.md`](../ASSUMPTIONS.md) (ej. disponibilidad de Docker/PostgreSQL local para desarrolladores, uso de datos sintéticos para demo de hackathon).
- **Dependencias externas verificadas:** `@dojocoding/hacienda-sdk@0.13.0` (MIT), PostgreSQL 16+, `zod@^4.6.5`, `drizzle-orm`, `csv-parse`, `exceljs`, `hono`, `citty`, `vitest`, `fast-check`, `@modelcontextprotocol/sdk`.

---

## 3. Resumen de categorías de requisitos

El catálogo normativo completo —con cada requisito individual, justificación, prioridad MoSCoW, criterio medible y prueba asociada— reside en [`docs/03-requirements/requirements-catalog.md`](./requirements-catalog.md). A continuación se resume la estructura y cobertura de las 10 familias:

### 3.1. Requisitos funcionales
- **QUIMERA Core (`QR-CORE-001` .. `QR-CORE-010`):** Contratos canónicos versionados (identidad, fuente, evidencia, transformación, conflicto, decisión, resultado, error), aislamiento de dependencias, baseline sin IA, determinismo reproducible y validación por JSON Schema/Zod.
- **Data Exodus (`QR-DATA-001` .. `QR-DATA-014`):** Ingestión sin pérdida silenciosa (CSV, XLSX, XML FE 4.4 vía `hacienda-sdk`), almacén inmutable con SHA-256, perfilado estructural, propuesta de correspondencias revisable, detección de duplicados exactos/probables y contradicciones duras, flujo de decisiones humanas auditables, idempotencia en re-importaciones, reanudación desde checkpoints, migración atómica a PostgreSQL con reporte de conciliación y procedencia consultable a nivel de registro/campo.
- **CR API Passport (`QR-PASS-001` .. `QR-PASS-008`):** Manifiestos declarativos versionados, cobertura MVP de 3 pasaportes (Hacienda Contribuyentes, CAByS, Tipo de Cambio Hacienda + BCCR SDDE con Bearer Token), detección de deriva contractual (`docs vs observed`), rate limiter anti-bloqueo (margen seguro bajo 20/10 req/s), caché local con TTL y modo fixture offline, rechazo honesto de APIs privadas sin credenciales (ej. Correos CR).
- **Factura CI (`QR-FCI-001` .. `QR-FCI-008`):** Simulador determinista local loopback (sin tocar sandbox/prod), detección de duplicación de emisión, colisión de consecutivos bajo concurrencia, confusión de estados fiscales, reintento inseguro tras timeout post-POST, fuga multi-contribuyente, pérdida de estado al reiniciar, correcciones ilegales y reporte CI (JSON/JUnit + exit codes).
- **Fiscal Outbox (`QR-OUT-001` .. `QR-OUT-007`):** Reutilización de `@dojocoding/hacienda-sdk/delivery`, tabla de intenciones con unicidad `(tenant_id, environment, operation_id, purpose)`, reserva atómica de consecutivos particionada por `(issuer_id, environment, document_type, branch, pos)`, `PgDocumentStore` transaccional, prohibición de reintento automático de `POST` ante resultado incierto, reconciliador por `clave` y worker concurrente con `FOR UPDATE SKIP LOCKED`.
- **QUIMERA Pipeline (`QR-PIPE-001` .. `QR-PIPE-007`):** Definición declarativa de DAGs acíclicos, verificación estática de compatibilidad de contratos entre nodos, persistencia de checkpoints por etapa, cancelación limpia y reanudación, compuerta humana (`WAITING_FOR_APPROVAL`), políticas explícitas de reintento solo en pasos idempotentes y compensaciones declaradas.
- **OficiOS (`QR-OFI-001` .. `QR-OFI-007`):** Consumidor aislado del toolkit para 1 oficio inicial (refrigeración/aire acondicionado), lectura de clientes/equipos/saldos migrados por Data Exodus, ciclo de estados estricto (`RECEIVED → DIAGNOSED → QUOTED → APPROVED → IN_PROGRESS → VERIFIED → CLOSED`), bloqueo deliberado de intervención/cierre sin autorización registrada, registro de materiales con soporte CAByS, vista de procedencia histórica y mensajes de error accionables en español.
- **Clairic Adapter (`QR-CLAI-001` .. `QR-CLAI-004`):** Puerto opcional `StructuredExtractorPort`, funcionamiento intacto sin instalarlo, validación de límites de payload (4 imágenes/páginas, 8 MiB, sin URLs remotas), registro obligatorio de `confidence`, `p_null` y character spans en procedencia y contención ante prompt injection.

### 3.2. Requisitos no funcionales (`QR-NFR-001` .. `QR-NFR-012`)
Incluyen hipótesis medibles marcadas `[HIPÓTESIS — PENDIENTE VALIDACIÓN EN BENCHMARK]` cuando no existe medición empírica previa:
- **Rendimiento (`QR-NFR-001`, `QR-NFR-002`):** Ingestar y reconciliar el dataset de referencia de 1.000 registros (7 archivos) en ≤ 5 s p95 en hardware estándar (4 vCPU, 8 GB RAM) `[HIPÓTESIS]`; consultas de procedencia de una entidad en ≤ 150 ms p95 sobre 100.000 registros `[HIPÓTESIS]`.
- **Confiabilidad y recuperación (`QR-NFR-003`, `QR-NFR-004`):** Cero escrituras parciales ante corte de proceso (`SIGKILL`/corte BD); recuperación de pipeline/outbox desde último checkpoint confirmado en ≤ 30 s.
- **Interoperabilidad y contratos (`QR-NFR-005`, `QR-NFR-006`):** Contratos exportables en JSON Schema Draft 2020-12; compatibilidad estricta con MCP `2026-07-28` (stdio + Streamable HTTP stateless) en los módulos que expongan MCP.
- **Observabilidad (`QR-NFR-007`):** Logs estructurados JSON con `correlationId`, `tenantId`, `runId`, `module`, `durationMs` y redacción automática de secretos.
- **Instalación y portabilidad (`QR-NFR-008`, `QR-NFR-009`):** Instalación limpia de cualquier paquete individual con `pnpm`/`npm` en Node 22+ sobre Linux/macOS/WSL en ≤ 2 min; demo completa levantable con un único comando (`docker compose up -d && pnpm demo`).
- **Mantenibilidad, despliegue y evolución (`QR-NFR-010`, `QR-NFR-011`, `QR-NFR-012`):** Cobertura mínima verificada en CI, migraciones SQL versionadas hacia adelante (sin ediciones destructivas silenciosas), SemVer estricto y política de deprecación con soporte N-1 en contratos.

### 3.3. Requisitos de seguridad y privacidad (`QR-SEC-001` .. `QR-SEC-012`)
Detallados en [`docs/07-security/security-requirements.md`](../07-security/security-requirements.md) e indexados en `requirements-catalog.md`:
- Aislamiento estricto por `tenantId` (y `issuerId` en secuencias fiscales) con soporte para PostgreSQL RLS.
- Cero secretos en código, perfiles, logs o base de datos en texto plano (`HACIENDA_PASSWORD`, `HACIENDA_P12_PIN`, `BCCR_SDDE_TOKEN`).
- Protección contra XXE en XML, ZIP bombs en XLSX y CSV Formula Injection (`=`, `+`, `-`, `@`) al exportar reportes.
- Contención de prompt injection cuando `Clairic` esté habilitado (datos de documentos nunca se interpretan como instrucciones ni habilitan side-effects).
- Inmutabilidad verificable de `source_artifacts`, `provenance_entries` y `resolution_decisions` (solo append / `SUPERSEDES`).
- Minimización, clasificación y retención legal de datos personales y fiscales (Ley 8968 de Costa Rica y retención fiscal de 5 años).

---

## 4. Criterios globales de aceptación del sistema

La versión MVP v0.1 de QUIMERA se considerará aceptada únicamente cuando:
1. Todos los requisitos de prioridad **Must (MVP Obligatorio)** en [`requirements-catalog.md`](./requirements-catalog.md) pasen sus pruebas automatizadas trazadas en [`docs/09-traceability/requirements-traceability-matrix.md`](../09-traceability/requirements-traceability-matrix.md).
2. El escenario de demostración end-to-end (`7 archivos / 1.000 registros sintéticos con errores sembrados → Data Exodus → PostgreSQL → OficiOS + CR API Passport + Factura CI`) se ejecute de forma reproducible **sin conexión a internet y sin credenciales de IA**.
3. Las pruebas de aislamiento confirmen que `@quimera/data-exodus`, `@quimera/cr-api-passport` y `@quimera/factura-ci` instalan y ejecutan sin `@quimera/oficios` ni `@quimera/adapter-clairic`.
