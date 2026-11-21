# Panorama Técnico, Estado del Arte y Análisis de Diferenciación

- **Documento:** `docs/01-research/technical-landscape.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para diseño arquitectónico
- **Referencias base:** [`docs/RESEARCH_LOG.md`](../RESEARCH_LOG.md)

---

## 1. Propósito y postura crítica

Este documento sintetiza la investigación de ingeniería realizada **antes** de fijar la arquitectura de QUIMERA. Su objetivo es evitar dos errores frecuentes en proyectos de hackathon y herramientas de infraestructura:

1. **Reinventar software maduro** (por ejemplo, construir otro conector genérico tipo Airbyte, otro servidor MCP de lectura de Hacienda cuando ya existe `jmnzcn/mcp-hacienda-cr`, o reimplementar la máquina de estados que ya existe en `@dojocoding/hacienda-sdk@0.13.0`).
2. **Adoptar complejidad empresarial prematura** (por ejemplo, requerir Kubernetes, Temporal, Airflow o GPUs para resolver el problema de un desarrollador independiente o una pequeña empresa costarricense).

---

## 2. Evaluación crítica del ecosistema Dojo Coding

Tras inspeccionar el código fuente real, `package.json`, `LICENSE` y arquitectura interna de los 7 repositorios de `DojoCodingLabs` ([ver registro de inspección](../RESEARCH_LOG.md#2-auditoría-directa-de-repositorios-del-ecosistema-dojo-coding)), se concluye lo siguiente:

| Repositorio | Qué aporta realmente | Qué NO debemos reconstruir | Decisión de adopción en QUIMERA | Tipo de vínculo |
|---|---|---|---|---|
| `hacienda-cr` (`v0.13.0`, MIT) | Auth OAuth2 IDP, clave 50 dígitos, builders de los 8 comprobantes v4.4, cálculo exacto con `BigInt`, validación XSD (`xmllint-wasm`), firma XAdES-EPES, `parseDocumentXml`, `verifySignedDocumentXml`, `lookupTaxpayer`, calendario hábil CR, módulo `delivery` (`DocumentStore`, `FileDocumentStore`, `VALID_TRANSITIONS`, `classifySendResult`), simulador interno `packages/mock`. | Parsers/builders XML 4.4, firma XAdES-EPES, cálculo de IVA/redondeo 5 decimales, definición de transiciones `FIRMADO→ACEPTADO/RECHAZADO/VENCIDO`, calendario de feriados CR. | **Reutilizar `@dojocoding/hacienda-sdk` directamente.** Construir encima únicamente lo que su guía de producción (`docs/production-integration.md`) deja explícitamente a la aplicación: persistencia multi-proceso en PostgreSQL, reserva atómica de consecutivos por `issuerId`, idempotencia por operación/pedido, recuperación multi-worker y harness de verificación de apps (`Factura CI`). | Dependencia de runtime (solo en paquetes fiscales y parser XML de Data Exodus). |
| `whatsapp-adapter` (`sdk@0.10.0`, `mcp@0.5.0`, MIT) | SDK tipado para Meta WhatsApp Cloud API con adaptadores Express/Hono/Web y storage opcional `pg`/`ioredis`; MCP outbound. | Cliente HTTP de Meta WhatsApp Graph API ni manejo de webhooks de Meta. | **Integración opcional post-MVP** únicamente en `OficiOS` (notificaciones de aprobación/estado). No incorporar en MVP obligatorio por ser pre-1.0 y requerir cuenta WABA aprobada por Meta. | Integración opcional (solo `OficiOS`, post-MVP). |
| `dojo-marketplace-mcp` (`v0.1.0`, MIT) | Servidor MCP para descubrir, instalar y publicar ítems en `api.dojocoding.io`. | Infraestructura de marketplace propio. | **Canal de distribución**, no dependencia de código. Publicar ahí skills/paquetes de `CR API Passport` y `Factura CI`. | Distribución externa. |
| `claude-code-waypoint` (`v2.0.0`, MIT) | Patrón documental de 3 archivos (`plan`, `context`, `tasks`) y hooks de Claude Code. | Herramienta de continuidad de sesiones de desarrollo. | **Solo dev-tooling opcional** para quienes implementen QUIMERA con agentes. **Rechazado como persistencia de Data Exodus**: las decisiones de reconciliación requieren integridad ACID, auditable y consultable en PostgreSQL, no archivos Markdown. | Herramienta de desarrollo (no runtime). |
| `make-no-mistakes-toolkit` (`v1.43.0`, **BSL 1.1**) | 37 comandos y hooks para flujo Linear/GitHub/Slack/auditorías. | Nada aplicable a runtime. | **Excluido.** Licencia BSL 1.1 incompatible con núcleo MIT y acoplado a Linear/Slack. | Descartado. |
| `code-sensei` (MIT) | Plugin educativo (belts/quizzes) para Claude Code en Bash/`jq`. | Nada aplicable a QUIMERA. | **Excluido.** Sin intersección funcional. | Descartado. |
| `GTM-Engineering-Command-Center` (`v1.14.0`, MIT) | Automatización de pauta publicitaria y funnels AARRR. | Nada aplicable al producto técnico. | **Excluido del producto.** Podría servir externamente para campañas de adquisición futuras. | Descartado. |

### Hallazgo arquitectónico clave #1: Redefinición de Fiscal Outbox

La propuesta preliminar planteaba `Fiscal Outbox` como una biblioteca que diseñaría desde cero la máquina de estados y la cola fiscal. La inspección del código de `@dojocoding/hacienda-sdk@0.13.0` demuestra que el SDK **ya exporta**:
- `DocumentStore` (interfaz), `FileDocumentStore` (implementación de disco local), `StoredDocument`, `DeliveryState` (`FIRMADO`, `PENDIENTE`, `ENVIADO`, `ACEPTADO`, `RECHAZADO`, `ALMACENADO`, `VENCIDO`), `VALID_TRANSITIONS`, `transitionDocument()`, `classifySendResult()` y `evaluateDeadline()`.

Sin embargo, el propio SDK documenta en `docs/production-integration.md` las brechas reales que rompe cualquier aplicación en producción:
1. `getNextSequence()` usa un archivo `sequences.json` local sin `issuerId` ni ambiente (inseguro en multi-proceso, multi-empresa o contenedores efímeros).
2. No existe una tabla de **intenciones comerciales** (`tenantId`, `environment`, `operationId`, `purpose`) que prevenga doble emisión ante eventos duplicados.
3. `FileDocumentStore` no soporta coordinación multi-worker con leasing/reclamación de trabajos tras caída.
4. El rate limiter del SDK es por instancia de `HttpClient`, no global.

**Mejora arquitectónica:** `@quimera/fiscal-outbox` **reutilizará** `DocumentStore`, `VALID_TRANSITIONS`, `classifySendResult` y `evaluateDeadline` del SDK, enfocándose en aportar la capa faltante: **PostgreSQL Transactional Outbox + asignador atómico de consecutivos por `issuerId` + worker lease/reconciler determinista**.

### Hallazgo arquitectónico clave #2: Diferenciación de CR API Passport frente a `jmnzcn/mcp-hacienda-cr`

Durante la investigación se identificó [`jmnzcn/mcp-hacienda-cr`](https://github.com/jmnzcn/mcp-hacienda-cr), un servidor MCP open-source ya publicado en npm y en el registro oficial de MCP que ofrece herramientas de lectura para `tipo_de_cambio`, `consultar_contribuyente`, `buscar_cabys`, `obtener_cabys`, `consultar_exoneracion` y `validar_factura`.

**Mejora arquitectónica:** `CR API Passport` **no puede ser un simple servidor MCP que hace `fetch` a Hacienda**. Su propuesta diferenciadora verificable es:
1. **Pasaportes declarativos versionados** (contrato OpenAPI/JSON Schema + reglas de auth + límites reales de tasa + políticas de caché + disclaimers legales) que cubren múltiples instituciones de Costa Rica (Hacienda, BCCR SDDE, SNIT OGC, y metadatos de acceso privado para Correos CR sin inventar endpoints privados).
2. **Verificación activa de deriva (Contract Drift Detection):** comparar el contrato documentado contra el comportamiento observado en vivo o contra fixtures grabados (por ejemplo, detectar inconsistencias de casing en BCCR SDDE, omisión de campos o cambios de status HTTP, o advertir cuando una serie BCCR queda sin API como ocurrió el 2026-11-20).
3. **Generación/provisión de adaptadores tipados con guardrails incorporados:** caché local obligatoria + rate limiter respetando el umbral oficial de Hacienda (20 req/s ráfaga, 10 req/s sostenido para evitar el baneo de IP de 10 minutos, agravado por CGNAT en Costa Rica) y pruebas de contrato ejecutables en CI.

---

## 3. Análisis del Estado del Arte (State of the Art)

Se analizaron 20 categorías/herramientas existentes para validar qué reutilizar, qué aprender y dónde existe una brecha real.

| Herramienta / Tecnología | Problema real que resuelve | Madurez | Licencia | Arquitectura | Límites y costos operativos | ¿Reutilizar en QUIMERA? | Brecha que deja abierta |
|---|---|---|---|---|---|---|---|
| **Airbyte** | Replicación ELT a escala con cientos de conectores SaaS/DB. | Alta | ELv2 (prohíbe SaaS gestionado) | Microservicios / Docker / K8s + workers por conector | Alto consumo de RAM/infraestructura; diseñado para tablas estructuradas de fuentes estables. | **No** (overkill + restricción ELv2). | No reconcilia hojas caóticas + XML fiscales ni ofrece procedencia a nivel de registro con revisión humana de conflictos. |
| **Apache NiFi** | Flujos de datos en streaming/routing de alto volumen con UI visual. | Alta | Apache 2.0 | JVM clusterizado | Pesado (JVM), curva operativa alta, difícil de embeber como librería npm/CLI. | **No.** | No orientado a builders/agentes ni a reconstrucción semántica de PYMEs. |
| **Apache Airflow** | Orquestación de DAGs batch programados (Python). | Muy alta | Apache 2.0 | Scheduler + Webserver + Workers + Metadata DB | Alta sobrecarga de despliegue; pensado para equipos de datos, no para CLI local-first ni micro-pipelines embebidos. | **No.** | Excesivo para ejecutar un pipeline determinista de migración en una laptop o CI. |
| **Debezium** | Change Data Capture (CDC) desde logs de transacciones de DBs (WAL/binlog). | Alta | Apache 2.0 | Kafka Connect / embedded engine (JVM) | Requiere Kafka o JVM y acceso a logs de replicación de la DB origen. | **No en MVP** (evaluar solo si algún piloto futuro requiere CDC continuo). | Las PYMEs objetivo no tienen WAL replicable; tienen Excel, CSV y XML sueltos. |
| **dbt Core / dbt OSS** | Transformación SQL versionada dentro de un data warehouse. | Muy alta | Apache 2.0 (OSS) / PLA (full) | CLI SQL/Jinja / motor Rust (v2) | Asume que los datos ya están cargados en tablas SQL limpias. | **Inspiración de diseño** (tests de esquema, lineage SQL); **no dependencia obligatoria** en MVP. | No ingesta archivos heterogéneos, no hace entity resolution ni gestiona conflictos interactivos humanos. |
| **Datafold** | Data diff entre tablas/entornos para validar migraciones y PRs SQL. | Alta | Propietario (OSS `data-diff` descontinuado/limitado) | SaaS / agente comercial | Costo empresarial; compara dos bases SQL ya existentes. | **No** (comercial). | No reconstruye el esquema origen desde archivos desordenados ni vincula conflictos a evidencia documental original. |
| **OpenRefine** | Limpieza y clustering interactivo de tablas desordenadas en escritorio. | Alta | BSD-3-Clause | App web local Java | Orientado a uso manual en GUI por un analista; no componible por API/CLI ni multi-entidad relacional con ledger SQL. | **Inspiración UX** (reconciliación y clustering), no dependencia. | No genera migraciones reproducibles, idempotentes ni trazables hacia PostgreSQL desde pipelines automatizados. |
| **Great Expectations / Pandera** | Validación de calidad y expectativas de DataFrames/tablas (Python). | Alta | Apache 2.0 / MIT | Librerías Python | Exigen runtime Python; orientadas a DataFrames/pipelines analíticos. | **No en Core TS**; equivalentes en TS con **Zod + JSON Schema**. | No gobiernan reconciliación de entidades contradictorias ni contratos entre módulos TS. |
| **PostgreSQL** | Base de datos relacional ACID con JSONB, CTEs, triggers, `pg_trgm`, RLS, `FOR UPDATE SKIP LOCKED`. | Muy alta | PostgreSQL License (permisiva) | Servidor RDBMS único | Requiere instancia local/Docker o gestionada (ej. Supabase/Neon). | **Sí — Pilar central** (almacén destino, procedencia, conflictos, outbox). | Ninguna en su dominio; es infraestructura madura que debemos aprovechar al máximo. |
| **Apache Arrow / DuckDB** | Formato columnar en memoria y analítica embebida rápida. | Alta | Apache 2.0 / MIT | Librerías C++/bindings | Excelente para millones de filas; innecesario para MVP de 1k–100k registros PYME donde streaming Node + PostgreSQL `COPY`/batch sobra. | **Diferir a post-MVP** si aparecen volúmenes >1M filas. | No resuelve semántica transaccional ni mutaciones operativas (OficiOS/Outbox). |
| **Temporal** | Ejecución durable de workflows de larga duración con replay determinista. | Muy alta | MIT | Clúster Temporal Server + Workers | Exige infraestructura dedicada compleja de operar localmente en un hackathon o PYME. | **No en MVP.** Evaluar en escala enterprise si Fiscal Outbox supera PostgreSQL workers. | Sobredimensionado para 10–10.000 comprobantes/día donde PostgreSQL `SKIP LOCKED` es suficiente y auditable. |
| **Cloudflare Workflows / Durable Objects / Queues** | Workflows serverless durables, coordinación por entidad y colas at-least-once en el edge. | Media-Alta (Workflows reciente) | Propietario (SaaS Cloudflare) | Edge V8 isolates | Queues es **at-least-once**; Workflows puede reintentar steps; vendor lock-in; límites de payload (128 KB queue, 1 MiB step); `hacienda-sdk` usa `node-forge`/`xmllint-wasm` que exigen compatibilidad Node 22+ (fricción en Workers). | **No en MVP obligatorio.** Soportar como target de despliegue opcional post-MVP mediante puerto `WorkflowRunnerPort`. | No exime a la app de idempotencia transaccional ni resuelve el baseline local-first. |
| **MCP (2026-07-28) + Code Mode** | Protocolo estándar para conectar agentes de IA a herramientas/recursos. | Alta (MCP) / Experimental (Code Mode) | MIT / Open spec | JSON-RPC sobre stdio o Streamable HTTP stateless | Code Mode aún es experimental y depende de Workers/SDK legacy. | **Sí — MCP stdio/HTTP estándar** selectivo en Passport y Data Exodus; **no Code Mode en MVP**. | MCP transporta llamadas, no garantiza calidad de contratos ni integridad de datos. |
| **OpenLineage / Marquez** | Estándar de linaje a nivel de job y dataset. | Alta | Apache 2.0 | Especificación JSON + servidor JVM | Granularidad principalmente dataset/columna; pesado desplegar Marquez para PYME. | **Adoptar nomenclatura compatible** (Run/Job/Dataset) en metadatos, implementando ledger ligero en PostgreSQL. | No modela evidencia a nivel de fila/celda/archivo ni aprobaciones humanas de conflictos. |
| **Schema Matching & Entity Resolution (Splink, Zingg)** | Emparejamiento probabilístico de registros (Fellegi-Sunter / ML). | Media-Alta | MIT / Apache 2.0 | Python + DuckDB/Spark | Requiere calibración estadística y runtime Python. | **MVP determinista + fuzzy ligero en TS** (normalización cédula/teléfono/razón social + trigramas/Jaro-Winkler); Splink como plugin opcional futuro. | Los modelos probabilísticos no deciden automáticamente fusiones con riesgo fiscal/financiero; necesitan compuerta humana. |
| **Contract Testing (Pact, Schemathesis, OpenAPI diff)** | Pruebas de contrato consumer-driven y fuzzing contra OpenAPI. | Alta | MIT | CLI / Brokers | Asumen contratos OpenAPI bien mantenidos por el proveedor (las APIs estatales CR rara vez publican OpenAPI actualizado). | **Inspiración directa** para `CR API Passport` (contratos declarativos + verificador contra respuestas reales/grabadas). | No incluyen semántica costarricense (cédula, CAByS, BCCR SDDE, rate-limit CGNAT). |
| **Property-Based Testing (`fast-check`)** | Generación automática de entradas para probar invariantes y reducir contraejemplos. | Muy alta | MIT | Librería TypeScript | Requiere modelar bien invariantes y generadores. | **Sí — Adoptar `fast-check`** en Core, Data Exodus (idempotencia/reconciliación) y Factura CI (secuencias concurrentes). | Complementa, no reemplaza, pruebas de escenarios fiscales deterministas. |
| **Software local de talleres (TallerApp, Astra)** | Órdenes de trabajo, fotos, firma, inventario y FE 4.4 en CR. | Alta (comercial) | Propietario | SaaS web cerrado | Sistemas cerrados; no migran datos caóticos con procedencia verificable ni son extensibles como toolkit abierto. | **Análisis competitivo.** | No resuelven la transición desde datos históricos caóticos ni permiten construir apps propias verificables sobre un núcleo abierto. |

---

## 4. Evaluación de patrones arquitectónicos

No todos los patrones de la literatura aportan valor al MVP. La siguiente evaluación distingue los patrones **adoptados**, los **adoptados parcialmente** y los **rechazados explícitamente**.

| Patrón | Decisión | Justificación técnica | Dónde aplica |
|---|---|---|---|
| **Hexagonal Architecture (Ports & Adapters)** | **Adoptado** | Garantiza independencia de Clairic, PostgreSQL, almacenamiento de archivos, transporte Hacienda y WhatsApp. Permite testear el dominio sin red ni IA. | Todos los paquetes Core, Data Exodus, Passport, Fiscal Outbox, OficiOS. |
| **Modular Monolith (Monorepo con paquetes aislados)** | **Adoptado** | Ofrece aislamiento estricto de fronteras entre paquetes (`@quimera/*`) sin el impuesto operativo de microservicios, redes distribuidas ni serialización RPC prematura. | Estructura global del repositorio (`pnpm` workspace). |
| **Pipeline / Pipes and Filters** | **Adoptado** | Modela de forma natural `Ingest → Parse → Normalize → Reconcile → Load → Verify` con contratos tipados en cada etapa y checkpoints intermedios. | `@quimera/pipeline` y flujo interno de Data Exodus. |
| **Transactional Outbox** | **Adoptado** | Único mecanismo probado para garantizar atomicidad entre una operación comercial (venta/orden) y la intención de emisión fiscal sin 2PC distribuido. | `@quimera/fiscal-outbox` (integrado con `@dojocoding/hacienda-sdk/delivery`). |
| **State Machine explícita** | **Adoptado** | Evita transiciones ilegales tanto en órdenes de servicio (`OficiOS`) como en entregas fiscales (`Fiscal Outbox`) y estados de conflicto (`Data Exodus`). | `OficiOS`, `Fiscal Outbox`, `Data Exodus`. |
| **Anti-Corruption Layer (ACL)** | **Adoptado** | Aísla el dominio interno de QUIMERA frente a rarezas externas (casing inconsistente de BCCR SDDE, estructuras XML 4.4, respuestas de Clairic). | `CR API Passport`, `adapter-clairic`, importador XML. |
| **Data Provenance (Ledger inmutable de linaje)** | **Adoptado** | Diferenciador central del producto: cada valor normalizado traza hasta su archivo original, hash SHA-256, fila/xpath, regla aplicada y decisión humana. | `@quimera/core` + `@quimera/data-exodus`. |
| **Repository / Strategy / Adapter / DI** | **Adoptado (ligero)** | Interfaces TypeScript simples (sin frameworks pesados de IoC/decoradores) para intercambiar almacenes, parsers y estrategias de matching. | Todos los módulos. |
| **Incremental Data Processing** | **Adoptado parcialmente** | Soportar re-importación idempotente por huella de archivo y registro en MVP; streaming/CDC continuo queda fuera del MVP. | `Data Exodus`. |
| **Domain-Driven Design (DDD)** | **Adoptado tácticamente (no dogmático)** | Lenguaje ubicuo claro (`SourceArtifact`, `RawRecord`, `NormalizedEntity`, `Conflict`, `ResolutionDecision`, `WorkOrder`, `FiscalIntent`) y límites de contexto limpios, evitando ceremonia innecesaria de agregados anidados. | Modelado de dominio. |
| **Plugin Architecture** | **Adoptado (ligero, estático/manifiesto)** | Registro declarativo de parsers, pasaportes y extractores opcionales (Clairic). Sin carga dinámica insegura de código arbitrario de terceros en MVP. | `Core`, `Data Exodus`, `CR API Passport`. |
| **Schema Registry** | **Adoptado (ligero, embebido en repo/BD)** | Versionado de esquemas con Zod + JSON Schema + tabla `schema_versions`, sin desplegar Confluent Schema Registry. | `@quimera/core`. |
| **Clean Architecture (múltiples capas anidadas)** | **Rechazado en forma estricta** | Duplica DTOs y mapeadores innecesarios; Hexagonal ligero logra el mismo aislamiento con menos fricción. | — |
| **Event Sourcing completo** | **Rechazado** | Reconstruir todo el estado operativo desde un log de eventos complica consultas SQL, migraciones y debugging en MVP. Basta con tablas de estado actual + **tablas append-only de auditoría/procedencia/transiciones**. | — |
| **CQRS distribuido** | **Rechazado** | No existe desbalance lectura/escritura que justifique bases separadas ni consistencia eventual para el tamaño de carga del MVP. | — |
| **Microservicios** | **Rechazado** | Introduce latencia de red, fallos parciales, orquestación compleja y sobrecosto sin beneficio para un toolkit local-first / PYME. | — |

---

## 5. Evaluación de tecnologías (Stack recomendado)

| Dimensión | Alternativas evaluadas | Decisión recomendada | Justificación verificable |
|---|---|---|---|
| **Lenguaje principal** | TypeScript (Node 22+), Python 3.12+, Go, Rust | **TypeScript-first (strict, ESM)** con puerta aislada para Python opcional (solo `Clairic` local si algún usuario opta por GPU local). | `@dojocoding/hacienda-sdk@0.13.0`, `@dojocoding/whatsapp-sdk` y `@dojocoding/marketplace-mcp` están escritos en **TypeScript ESM sobre Node.js 22+**. Compartir el lenguaje elimina puentes IPC/FFI entre Core, Data Exodus, Passport, Fiscal Outbox y Factura CI, y unifica tipos en tiempo de compilación. Python solo se justifica para inferencia PyTorch local de Clairic (fuera del baseline). |
| **Runtime** | Node.js 22 LTS+, Bun, Deno, Cloudflare Workers | **Node.js 22.13+ LTS** como runtime canónico. | Exigencia explícita de `@dojocoding/hacienda-sdk` (`engines.node >= 22`, `xmllint-wasm`, `node-forge`, ESM nativo). Cloudflare Workers queda como runtime opcional de despliegue futuro para adaptadores HTTP sin dependencias nativas Node. |
| **Monorepo y paquetes** | `pnpm` workspaces + Turborepo, npm workspaces, Nx, repos separados | **`pnpm` workspaces + Turborepo** (con `tsup` para bundling y Changesets para release). | Misma cadena de herramientas probada en `DojoCodingLabs/hacienda-cr`; builds incrementales rápidos, publicación independiente de cada `@quimera/*` a npm y control estricto de grafos de dependencias. |
| **Base de datos** | PostgreSQL 16+, SQLite, DuckDB, MongoDB | **PostgreSQL 16+** (local vía Docker o gestionado tipo Supabase/Neon). SQLite permitido solo como almacenamiento efímero opcional en pruebas unitarias/mocks si se abstrae, nunca como sustituto de PG en concurrencia de Outbox. | `JSONB` para evidencia/payloads crudos, `pg_trgm` para matching difuso determinista, `Row-Level Security (RLS)` para aislamiento multi-empresa, transacciones ACID + `SELECT ... FOR UPDATE SKIP LOCKED` para Fiscal Outbox y `ON CONFLICT` para idempotencia. |
| **Acceso a BD y migraciones** | Drizzle ORM, Prisma, Kysely, `pg` + SQL plano | **Drizzle ORM + migraciones SQL versionadas (`drizzle-kit`) sobre driver `pg`** (o `postgres.js`). | SQL explícito y auditable sin motor binario pesado (a diferencia de Prisma Engine), excelente inferencia TypeScript, soporte nativo de transacciones, CTEs, `FOR UPDATE SKIP LOCKED` y migraciones SQL planas inspeccionables. |
| **Almacenamiento de archivos originales** | Sistema de archivos local content-addressed (CAS), S3/R2, `BYTEA` en PG | **Puerto `ArtifactStorePort`** con adaptador local content-addressed (`sha256/<prefix>/<hash>`) en MVP y adaptador S3/Cloudflare R2 en producción. | Evita inflar PostgreSQL con binarios grandes, garantiza inmutabilidad direccionada por contenido (SHA-256) y funciona 100% offline. |
| **Validación de esquemas** | Zod v4, TypeBox, Valibot, Ajv | **Zod v4** (con exportación a **JSON Schema Draft 2020-12** mediante `z.toJSONSchema()`). | Ya es dependencia directa de `@dojocoding/hacienda-sdk@0.13.0` (`zod ^4.6.5`), elimina discrepancias entre validación runtime, tipos TS y contratos JSON Schema para MCP/Passport. |
| **Parsing de archivos (Data Exodus)** | `csv-parse`, `exceljs`, `fast-xml-parser` / `@dojocoding/hacienda-sdk` | **`csv-parse` (streaming) + `exceljs` (XLSX seguro) + `parseDocumentXml` de `hacienda-sdk` (FE 4.4 XML)**. | `exceljs` evita vulnerabilidades históricas de paquetes no mantenidos y ya está auditado en el ecosistema `hacienda-cr`; `parseDocumentXml` evita reescribir un parser fiscal. |
| **CLI** | `citty`, `commander`, `oclif`, `yargs` | **`citty`** (o `commander` ligero). Se recomienda **`citty`** por paridad con `@dojocoding/hacienda-cli`. | Ligero, ESM nativo, tipado limpio y consistente con convenciones del ecosistema Dojo. |
| **API HTTP (OficiOS / Passport / Test Harness)** | Hono, Fastify, Express | **Hono** (sobre `@hono/node-server`). | Ultra ligero, Web Standards (`Request`/`Response`), portable tanto a Node.js 22 como a Cloudflare Workers si se despliega en edge posteriormente, y ya soportado por `@dojocoding/whatsapp-sdk/hono`. |
| **Contratos MCP** | `@modelcontextprotocol/sdk` (spec `2026-07-28` / stdio + Streamable HTTP) | **`@modelcontextprotocol/sdk`** con transporte `stdio` local por defecto y `Streamable HTTP` stateless opcional. | Estándar adoptado por `hacienda-mcp`, `dojo-marketplace-mcp` y `whatsapp-mcp`. |
| **Pruebas** | Vitest + `fast-check` + Testcontainers (PG) + Stryker (selectivo) | **Vitest** (unit/integration/contract) + **`fast-check`** (property-based) + PostgreSQL real (Docker/Testcontainers) + **Stryker** selectivo en Core/Outbox post-MVP. | Velocidad, soporte ESM/TS nativo y alineación total con el ecosistema Dojo (`hacienda-cr` usa Vitest + `fast-check` + Stryker). |
| **Observabilidad** | `pino` (JSON logs estructurados) + OpenTelemetry API (opcional) | **`pino` (redacción automática de secretos)** + eventos estructurados en BD + hooks OpenTelemetry opcionales. | Cero infraestructura obligatoria en local; exportación directa a OTel en producción. |
| **Inferencia local opcional (Clairic)** | Cloudflare Workers AI HTTP (`@cf/cloudflare/clairic`) o servidor HTTP local Python/PyTorch | **Adaptador HTTP aislado** en `@quimera/adapter-clairic` apuntando a Workers AI o a un micro-endpoint local Python opcional (nunca embebido en Node). | Mantiene el baseline sin IA y evita contaminar el monorepo TS con dependencias CUDA/PyTorch. |

---

## 6. Análisis de diferenciación (Respuestas explícitas)

### 6.1. ¿Qué ofrece QUIMERA que no ofrecen ya las herramientas existentes?

La integración verificable de **tres capas que hoy viven desconectadas** en el segmento de micro y pequeñas empresas de Latinoamérica:
1. **Reconstrucción semántica auditable desde caos multi-formato (`Data Exodus`)**: no solo copiar tablas (Airbyte) ni transformar SQL limpio (dbt), sino tomar hojas Excel, CSVs y comprobantes XML fiscales v4.4 contradictorios, detectar colisiones de identidad/saldos, pausar ante ambigüedad para decisión humana y emitir una base PostgreSQL con **procedencia a nivel de registro**.
2. **Contratos verificables del ecosistema regulatorio costarricense (`CR API Passport` + `Factura CI`)**: convertir conocimiento tácito y frágil (rate limits de Hacienda con baneo de 10 min, migración obligatoria a BCCR SDDE con Bearer Token, reglas de concurrencia/reconciliación de FE 4.4) en artefactos ejecutables y pruebas automatizadas que detectan deriva y bugs reales de aplicación.
3. **Continuidad comprobada del dato a la operación (`OficiOS` como consumidor de referencia)**: demostrar que los datos rescatados no terminan en un dashboard pasivo, sino que alimentan software operativo con reglas de estado estrictas y trazabilidad visible hasta el documento histórico.

### 6.2. ¿Qué componentes son infraestructura convencional?

- Base de datos relacional y transacciones (`PostgreSQL` + `Drizzle`).
- Parsing básico de CSV/XLSX (`csv-parse`, `exceljs`).
- Validación de esquemas (`Zod` / JSON Schema).
- Generación/firma/validación XML v4.4 de Hacienda (`@dojocoding/hacienda-sdk`).
- Transporte HTTP, CLI, logging y runner de tests (`Hono`, `citty`, `pino`, `Vitest`).

**Regla de ingeniería:** En ninguno de estos componentes se construye tecnología propia; se reutiliza software maduro.

### 6.3. ¿Qué capacidades son realmente diferenciadoras?

1. **Ledger de procedencia a nivel de registro y campo** en PostgreSQL que responde «¿de qué archivos, filas, reglas y aprobaciones salió este saldo de ₡85.000?».
2. **Motor de detección y resolución auditable de conflictos** que separa explícitamente fusiones deterministas seguras de ambigüedades bloqueantes con revisión humana.
3. **Detección de deriva contractual (`Contract Drift`)** en APIs públicas costarricenses (documentación oficial vs respuesta observada + guardrails de rate limit y caché).
4. **Suite de verificación conductual de aplicaciones fiscales (`Factura CI`)** que prueba propiedades de sistema (concurrencia de consecutivos, timeouts post-POST, eventos duplicados, aislamiento multi-tenant) que las pruebas unitarias del SDK no cubren.

### 6.4. ¿Cuáles pueden construirse reutilizando software maduro?

- Firma XAdES-EPES, clave numérica, validación XSD, cálculo exacto decimal, calendario hábil CR y máquina de estados base de entrega → **`@dojocoding/hacienda-sdk`**.
- Motor transaccional, búsquedas fuzzy (`pg_trgm`), RLS y colas con `SKIP LOCKED` → **`PostgreSQL`**.
- Property-based testing de invariantes → **`fast-check`**.
- Notificaciones WhatsApp (post-MVP) → **`@dojocoding/whatsapp-sdk`**.
- Extracción estructurada opcional desde fotos/PDFs (post-MVP) → **`Clairic` (Apache 2.0 / Workers AI)**.

### 6.5. ¿Cuáles deberían eliminarse o diferirse del alcance?

- **Eliminado definitivamente:** construir un ERP generalista, construir un nuevo SDK de Hacienda, construir otro servidor MCP genérico sin verificación de contratos, introducir microservicios/Kafka/Temporal/Airflow, depender de modelos LLM para pasos críticos de integridad o cierre fiscal.
- **Diferido a post-MVP:** ingestión de PDF/correos/SQLite/Google Sheets en Data Exodus, sincronización CDC continua, despliegue multi-región en Cloudflare Workers/Workflows, integración productiva con Correos CR (requiere contrato Pymexpress), integración WhatsApp en vivo, múltiples oficios en OficiOS, y extracción real vía Clairic GPU/Workers AI (se deja el contrato y adaptador stub/opcional listo).

### 6.6. ¿Qué características permiten que QUIMERA siga siendo útil cuando los modelos de IA mejoren?

Un modelo de IA 10x más inteligente podrá generar código CRUD y scripts de migración todavía más rápido, lo que **amplifica** (no elimina) los problemas que resuelve QUIMERA:
1. **Verificación externa e independiente:** el mismo agente que escribe una aplicación fiscal no puede certificarse a sí mismo bajo concurrencia e inyección de fallos; se necesita un oráculo determinista externo (`Factura CI`).
2. **Verdad empírica de APIs en vivo:** los pesos de un modelo siempre tienen fecha de corte y no pueden verificar si hoy BCCR deshabilitó una serie o si Hacienda cambió un campo o bloqueó una IP (`CR API Passport`).
3. **Responsabilidad jurídica y empresarial sobre datos ambiguos:** decidir si «Distribuidora Rodríguez» y «Distribuidora Rodríguez S.A.» son la misma entidad jurídica o a qué factura corresponde un pago huérfano de ₡85.000 es una **decisión de negocio y auditoría**, no un problema de inteligencia de texto (`Data Exodus`).
4. **Invariantes transaccionales en runtime:** ningún prompt evita una condición de carrera entre dos workers reservando el mismo consecutivo o un timeout TCP después de un POST a Hacienda (`Fiscal Outbox`).

### 6.7. ¿Qué problemas NO se resuelven aumentando la inteligencia del modelo?

- **Incertidumbre de red (Two Generals' Problem):** si una conexión cae tras enviar un `POST /recepcion` a Hacienda, ningún LLM sabe si Hacienda lo procesó; solo una consulta idempotente por `clave` y persistencia transaccional resuelven el estado.
- **Condiciones de carrera y aislamiento de concurrencia:** requieren locks/transacciones ACID en base de datos, no mejores prompts.
- **Cumplimiento probatorio y auditoría (procedencia):** ante un reclamo de cliente o auditoría tributaria (retención legal de 5 años en CR), se requiere trazabilidad criptográfica/documental inmutable, no la explicación probabilística de un modelo.
- **Restricciones externas de red y credenciales:** límites de tasa por IP/CGNAT, expiración de tokens BCCR SDDE, falta de permisos Pymexpress o certificados `.p12` vencidos.

---

## 7. Conclusiones directas para el diseño

1. **Arquitectura TypeScript-first en monorepo `pnpm` sobre Node.js 22+ y PostgreSQL 16+**, con puertos hexagonales que aíslan almacenamiento, proveedores fiscales, APIs externas y extracción IA opcional.
2. **Alineación pragmática para MVP de hackathon:** centrar la demostración reproducible en la historia de extremo a extremo **Data Exodus → PostgreSQL con procedencia → OficiOS (1 oficio: refrigeración/A/C) + CR API Passport (3 APIs verificadas) + Factura CI (20–25 escenarios críticos sobre POS defectuoso vs Fiscal Outbox prototipo)**, todo ejecutable 100% offline/local con mocks deterministas y sin GPU ni IA.
3. **Higiene de dependencias Dojo:** usar exclusivamente `@dojocoding/hacienda-sdk` en runtime MVP; respetar la licencia BSL 1.1 de `make-no-mistakes-toolkit` excluyéndolo completamente.
