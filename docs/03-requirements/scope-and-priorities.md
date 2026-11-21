# Alcance, Priorización (MoSCoW) y Fronteras del MVP — QUIMERA

- **Documento:** `docs/03-requirements/scope-and-priorities.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para planificación de implementación
- **Regla de oro:** Ningún requisito **Must (MVP Obligatorio)** puede depender directa ni transitivamente de una capacidad clasificada como **Post-Hackathon** o **Fuera de Alcance**.

---

## 1. Justificación de la matriz MoSCoW

Se adopta **MoSCoW** por su claridad para separar una ventana de hackathon acotada (Dojo AI Hackathon 2026: 3 días) de la evolución comercial posterior, vinculando cada decisión de alcance con riesgo técnico y valor demostrable:

- **Must (MVP Obligatorio):** Indispensable para demostrar de extremo a extremo la tesis de QUIMERA (`Importación → Reconciliación → Migración → Operación → Verificación`) sin IA, sin GPU y 100% reproducible offline.
- **Should (MVP Opcional / Alta Prioridad):** Fortalece sustancialmente la solidez técnica y la demo si el camino crítico se completa a tiempo; su omisión no rompe la demostración principal.
- **Could (Post-Hackathon / Beta Técnica):** Capacidades valiosas diseñadas arquitectónicamente (contratos/puertos definidos), pero diferidas para no inflar el riesgo de entrega del MVP.
- **Won't (Fuera de Alcance v1):** Explicitamente excluidas para evitar sobreingeniería y pérdida de foco.

---

## 2. Matriz de Priorización por Componente

| Componente | Must — MVP Obligatorio | Should — MVP Opcional | Could — Post-Hackathon | Won't — Fuera de Alcance v1 |
|---|---|---|---|---|
| **QUIMERA Core (`@quimera/core`)** | Contratos Zod + JSON Schema (`QR-CORE-001`..`010`), errores tipados, dinero decimal exacto, puertos hexagonales, baseline 0% IA. | Helpers CLI de formateo tabular y exportador automático de OpenAPI/JSON Schema bundle. | SDK compilado/generado para Python desde JSON Schema; soporte multi-país LATAM (MX/CO/PA). | Framework de IoC/DI pesado; Event Sourcing completo; motor de reglas scripting arbitrario. |
| **Data Exodus (`@quimera/data-exodus`)** | Importadores CSV, XLSX (`exceljs`) y XML FE 4.4 (`hacienda-sdk`); `ArtifactStorePort` local CAS SHA-256; perfilado y propuesta de mapeo determinista; detección de duplicados/contradicciones sobre dataset sintético 1.000 filas; resolución humana auditable; idempotencia; checkpoint/resume; carga atómica PostgreSQL + `ReconciliationReport` + consulta de procedencia. | UI web ligera para resolver conflictos (además de CLI interactivo y `decisions.yaml`); benchmarks automatizados (`QR-NFR-001`, `002`). | Importadores PDF/correo/SQLite/Google Sheets (`QR-DATA-014`); matching probabilístico avanzado (plugin Splink opcional); soporte destino Supabase/MySQL directo; sincronización incremental periódica. | CDC en tiempo real tipo Debezium/Kafka; replicación masiva de cientos de conectores SaaS tipo Airbyte; auto-fusión silenciosa por LLM. |
| **CR API Passport (`@quimera/cr-api-passport`)** | Formato declarativo `ApiPassport` versionado; 3 pasaportes verificados (Hacienda Contribuyentes `/fe/ae`, CAByS `/fe/cabys`, Tipo de Cambio Hacienda + BCCR SDDE con Bearer Token); detector de deriva contractual; rate limiter conservador anti-bloqueo IP; caché local TTL; modo `fixture` offline; rechazo honesto sin credenciales. | Servidor MCP ligero (`stdio`, spec `2026-07-28`) exponiendo descubrimiento de pasaportes y consultas verificadas; generador de snippet/cliente TS. | Pasaporte SNIT (OGC API-Features), ficha/adaptador Correos CR Pymexpress (para clientes afiliados), monitor continuo programado de deriva (GitHub Actions cron), publicación en Dojo Marketplace MCP. | Reemplazar `hacienda-sdk`; exponer APIs privadas sin contrato ni credenciales; Cloudflare Code Mode experimental en producción. |
| **Factura CI (`@quimera/factura-ci`)** | Simulador determinista local loopback con inyección de fallos (timeout post-POST, `409`, `429`, `503`, `procesando`, `rechazado`); suite de 20–24 escenarios críticos (concurrencia, duplicados, estados, recuperación, aislamiento multi-tenant, reinicio, NC referenciada); `demo-pos-buggy` vs `demo-pos-outbox`; reporte CLI + JSON + JUnit XML con aviso legal. | GitHub Action empaquetada lista para usar y plugin/skill para Claude Code / Cursor. | Pruebas de carga prolongada, mutación de escenarios (Stryker), soporte de otros países LATAM, dashboard SaaS histórico para agencias. | Certificación fiscal legal oficial ante DGT; envío automático contra Hacienda producción. |
| **Fiscal Outbox (`@quimera/fiscal-outbox`)** | `PgDocumentStore` implementando `DocumentStore` de `hacienda-sdk`; unicidad transaccional de intenciones `(tenant_id, environment, operation_id, purpose)`; reserva atómica de consecutivos por `(issuer_id, environment, document_type, branch, pos)`; reconciliación por misma clave ante resultado incierto sin reenvío POST. | Worker concurrente con `SELECT ... FOR UPDATE SKIP LOCKED` y expiración de lease (`QR-OUT-004`); almacenamiento inmutable de intentos y respuesta XML (`QR-OUT-006`). | Adaptador opcional `Cloudflare Workflows` / Durable Objects (`QR-OUT-007`), alertas de vencimiento de plazo de 2 días hábiles (`sin_internet`/`contingencia`), coordinador de cuota global multi-réplica. | Reimplementar firma XAdES-EPES o builders XML; prometer «exactly-once» end-to-end sin reconciliación con Hacienda. |
| **QUIMERA Pipeline (`@quimera/pipeline`)** | Manifiesto DAG YAML/JSON con validación acíclica; chequeo estático de compatibilidad de contratos; persistencia de `execution_runs` y `checkpoints`; `resume` determinista; compuerta `WAITING_FOR_APPROVAL`; política de reintento restringida a `idempotent: true`. | Ejecución paralela de ramas independientes y manejadores de compensación (`QR-PIPE-007`). | Visualizador web de DAGs, triggers programados (cron), adaptador a runners distribuidos. | Reemplazar Apache Airflow o Temporal; ejecución distribuida multi-región en MVP. |
| **OficiOS (`apps/oficios`)** | API HTTP (Hono) + interfaz web mínima enfocada en **1 oficio: Refrigeración y Aire Acondicionado (`hvac-refrigeration-v1`)**; lectura de clientes/equipos/saldos migrados desde PG; vista de procedencia histórica; máquina de estados estricta con bloqueo deliberado de cierre/intervención sin aprobación; registro de diagnóstico y materiales con CAByS vía Passport. | Encolado real de intención fiscal al cerrar orden vía `Fiscal Outbox` (`QR-OFI-006`); control básico de roles (`ADMIN`/`OPERATOR`/`AUDITOR`). | PWA offline-first móvil para técnicos en campo; notificaciones opcionales vía `@dojocoding/whatsapp-sdk`; contratos adicionales de otros oficios (celulares, electricidad, plomería); portal de seguimiento público por enlace. | ERP contable completo, planilla CCSS, inventario multi-bodega complejo, chatbot IA como interfaz principal. |
| **Clairic Adapter (`@quimera/adapter-clairic`)** | **Solo contrato del puerto `StructuredExtractorPort` en `@quimera/core`** y prueba verificando que el baseline funciona al 100% sin el paquete (`QR-CLAI-001`). | Implementación del paquete opcional con adaptador stub determinista para pruebas de contrato e inyección de baja confianza. | Conexión real a `@cf/cloudflare/clairic` (Workers AI) y micro-servidor opcional Python/PyTorch local para PDFs y fotos de diagnósticos/facturas (`QR-CLAI-002..004`). | Convertir Clairic en dependencia obligatoria de cualquier flujo base o permitir escritura automática sin revisión humana en campos fiscales. |

---

## 3. Verificación anti-contaminación de alcance

Se verifica explícitamente que ningún entregable **Must** depende de elementos **Could / Won't**:
1. `Data Exodus` MVP funciona exclusivamente con CSV, XLSX y XML FE 4.4 deterministas → **0 dependencia** de `Clairic`, PDF o correos.
2. `OficiOS` MVP registra aprobaciones directamente en la API/UI web → **0 dependencia** de `whatsapp-adapter` ni Meta WABA.
3. `CR API Passport` MVP verifica y sirve 3 APIs con modo `fixture` offline → **0 dependencia** de credenciales de Correos CR ni conexión a internet obligatoria durante la demo.
4. `Fiscal Outbox` MVP y `Factura CI` corren sobre PostgreSQL local + simulador loopback → **0 dependencia** de Cloudflare Workflows, Temporal ni credenciales reales de Hacienda producción.
5. `QUIMERA Pipeline` corre en el mismo proceso Node.js con checkpoints en PostgreSQL → **0 dependencia** de brokers externos (Kafka/RabbitMQ).
