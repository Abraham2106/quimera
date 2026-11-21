# Visión de Producto — QUIMERA

- **Documento:** `docs/02-product/product-vision.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para especificación de requisitos
- **Referencias:** [`docs/01-research/technical-landscape.md`](../01-research/technical-landscape.md)

---

## 1. Declaración del problema

Construir interfaces, tablas CRUD y prototipos empresariales con agentes de programación (Claude Code, Cursor, etc.) se ha vuelto rápido y económico. Sin embargo, cuando una pequeña empresa o un desarrollador intenta pasar de un prototipo a una operación real en Costa Rica (y Latinoamérica), choca contra tres muros estructurales que la generación de código por sí sola no resuelve:

1. **Datos históricos dispersos y contradictorios:** clientes repetidos en hojas Excel, ventas en CSV, comprobantes XML de Hacienda v4.4, pagos anotados informalmente y saldos que no cuadran. Migrarlos con un script rápido produce una base de datos moderna llena de errores silenciosos y sin trazabilidad.
2. **Fricción y deriva en integraciones regulatorias locales:** las APIs oficiales costarricenses (Hacienda, BCCR SDDE, SNIT) imponen límites estrictos de tasa con bloqueos de IP, autenticación obligatoria tras deprecaciones recientes (BCCR Web Service deshabilitado el 30 de junio de 2026) y contratos que cambian o tienen documentación inconsistente.
3. **Procesos críticos sin verificación de invariantes:** en facturación electrónica y gestión de servicios técnicos, que un programa compile y pase pruebas unitarias básicas no garantiza que resista timeouts post-POST, solicitudes concurrentes por el mismo consecutivo, duplicidad de eventos ni reglas obligatorias de autorización de clientes.

---

## 2. Qué ES QUIMERA y qué NO es

### Qué ES QUIMERA
- Un **toolkit modular y componible de infraestructura empresarial** (inspirado en la filosofía de proyectos de la Apache Software Foundation): cada paquete (`@quimera/*`) resuelve una responsabilidad delimitada, funciona de forma independiente y se compone mediante contratos explícitos.
- Un **ecosistema determinista-primero (AI-optional)**: su línea base opera 100% sin LLMs, sin GPU y sin servicios de inferencia externos.
- Un **puente verificable** entre datos históricos desordenados, bases de datos PostgreSQL auditables, integraciones costarricenses probadas y aplicaciones operativas confiables.

### Qué NO es QUIMERA
- **No es un ERP monolítico** ni pretende reemplazar sistemas contables completos.
- **No es un nuevo SDK de Hacienda**: reutiliza `@dojocoding/hacienda-sdk` y complementa las garantías de aplicación que el SDK explícitamente delega al integrador.
- **No es otro servidor MCP genérico** para hacer llamadas sin verificación (ya existen implementaciones públicas como `jmnzcn/mcp-hacienda-cr`).
- **No es una plataforma dependiente de IA**: la IA (como el adaptador opcional `Clairic`) asiste en extracción estructurada cuando el usuario la habilita, pero nunca es prerequisito ni autoridad final sobre integridad de datos o decisiones fiscales.
- **No es una certificadora oficial del Ministerio de Hacienda**: sus pruebas sintéticas y validaciones detectan fallos de integración antes de producción, pero la aceptación legal solo la emite Hacienda.

---

## 3. Filosofía de ecosistema y componentes

| Componente | Paquete propuesto | Rol en el ecosistema | Independencia operativa |
|---|---|---|---|
| **QUIMERA Core** | `@quimera/core` | Contratos mínimos (identidades, evidencia, procedencia, conflictos, decisiones, errores, versiones de esquema). | Librería sin dependencias externas ni BD obligatoria. |
| **Data Exodus** | `@quimera/data-exodus` | Ingestión multi-formato (CSV, XLSX, XML FE 4.4 en MVP), reconstrucción semántica, reconciliación asistida y migración trazable a PostgreSQL. | Instalable y ejecutable solo con `@quimera/core` + PostgreSQL. |
| **CR API Passport** | `@quimera/cr-api-passport` | Manifiestos verificables, adaptadores tipados con caché/rate-limit y detector de deriva contractual para APIs de Costa Rica. | Instalable y ejecutable sin BD, sin Data Exodus y sin OficiOS. |
| **Factura CI** | `@quimera/factura-ci` | Suite de pruebas conductuales y de invariantes (concurrencia, duplicados, recuperación, aislamiento multi-empresa) para apps de facturación electrónica CR. | Ejecutable como CLI / GitHub Action contra cualquier app compatible. |
| **Fiscal Outbox** | `@quimera/fiscal-outbox` | Outbox transaccional en PostgreSQL + asignador atómico de consecutivos por `issuerId` + recuperación de estados inciertos sobre `@dojocoding/hacienda-sdk/delivery`. | Instalable en cualquier backend Node 22 + PostgreSQL sin OficiOS ni Data Exodus. |
| **QUIMERA Pipeline** | `@quimera/pipeline` | Motor declarativo de DAGs deterministas con validación de contratos, checkpoints, compuertas humanas y reanudación idempotente. | Ejecuta cualquier paso compatible con `PipelineStepContract`. |
| **OficiOS** | `apps/oficios` (`@quimera/oficios`) | Aplicación demostrativa vertical (oficio inicial: refrigeración y aire acondicionado) que opera sobre datos migrados, exige compuertas de autorización y expone procedencia. | Consumidor puro del toolkit; ningún paquete `packages/*` puede depender de él. |
| **Clairic Adapter** | `@quimera/adapter-clairic` | Adaptador estrictamente opcional del puerto `StructuredExtractorPort` para extracción estructurada con Cloudflare Clairic (Workers AI o local). | Paquete opcional desacoplado; su ausencia jamás impide ejecutar ningún flujo base. |

---

## 4. Objetivos de producto (medibles)

| ID | Objetivo de producto | Indicador verificable objetivo (MVP) | Estado |
|---|---|---|---|
| `OBJ-01` | **Migración sin pérdida silenciosa ni mezcla de identidades** | 100% de registros fuente de un dataset sintético de 1.000 filas (7 archivos) se contabilizan como `cargado`, `fusionado`, `conflicto_pendiente` o `rechazado_explicito`; 0 pérdidas silenciosas. | Confirmado |
| `OBJ-02` | **Procedencia auditable a nivel de registro** | Cualquier entidad o saldo migrado devuelve su cadena completa `origen → archivo (SHA-256) → fila/xpath → regla → decisión humana` en una sola consulta. | Confirmado |
| `OBJ-03` | **Integraciones CR verificables con protección anti-bloqueo** | 3 pasaportes ejecutables (Hacienda Contribuyentes, CAByS, Tipo de Cambio Hacienda/BCCR SDDE) con pruebas de contrato, detector de deriva y rate limiter local bajo los umbrales oficiales de Hacienda. | Confirmado |
| `OBJ-04` | **Detección reproducible de fallos fiscales de aplicación** | `Factura CI` detecta el 100% de los fallos inyectados en una app POS defectuosa de referencia (concurrencia de consecutivos, timeout post-POST, duplicados, fuga entre contribuyentes, reinicio) y pasa cuando la app adopta `Fiscal Outbox`. | Confirmado |
| `OBJ-05` | **Demostración operativa real sobre datos rescatados** | `OficiOS` (refrigeración/A/C) lee clientes/equipos/saldos migrados por `Data Exodus`, muestra su procedencia y bloquea deliberadamente el cierre de una orden sin autorización explícita del cliente. | Confirmado |
| `OBJ-06` | **Operación baseline 100% libre de IA y reproducible offline** | La demo completa end-to-end (`Importación → Reconciliación → Migración → Operación → Verificación`) se ejecuta sin claves de IA, sin GPU y sin acceso a internet mediante mocks deterministas. | Confirmado |

---

## 5. Alineación con Dojo AI Hackathon 2026 y proyección regional

- **Track principal:** **AI Apps & Tools** (denominado *Build for Builders* en el brief preliminar) del Dojo AI Hackathon 2026 (20–22 nov 2026).
- **Historia de demostración recomendada:** Un taller de refrigeración costarricense tiene su información repartida en 7 archivos contradictorios (CSV, XLSX, XML 4.4). `Data Exodus` reconstruye las entidades, detecta duplicados, cédulas contradictorias y un saldo imposible de reconciliar, exige resolución humana explícita y migra a PostgreSQL con procedencia por registro. `OficiOS` continúa operando directamente sobre esos datos exigiendo aprobación antes de cerrar una orden. `CR API Passport` verifica los servicios locales y `Factura CI` comprueba que la emisión fiscal sobrevive a timeouts y concurrencia.
- **Proyección a Latinoamérica:** Aunque `CR API Passport`, `Factura CI` y `Fiscal Outbox` comienzan con normativa costarricense (Hacienda FE 4.4, BCCR SDDE, SNIT), `@quimera/core`, `@quimera/data-exodus`, `@quimera/pipeline` y el motor de contratos de `OficiOS` son **agnósticos de país** y reutilizables en cualquier país de LATAM añadiendo paquetes de adaptadores fiscales regionales (ej. CFDI México, DIAN Colombia, DGI Panamá).
