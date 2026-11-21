# Stakeholders y Personas — QUIMERA

- **Documento:** `docs/02-product/stakeholders-and-personas.md`
- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Aprobado para requisitos y UX

---

## 1. Mapa de Stakeholders (10 perfiles)

| ID | Stakeholder | Rol / Relación con QUIMERA | Necesidad principal | Métrica de valor para este rol |
|---|---|---|---|---|
| `STK-01` | **Desarrollador independiente** | Construye software a medida o micro-SaaS en CR/LATAM. | Reutilizar migración, pasaportes de APIs CR y outbox fiscal sin reescribir infraestructura propensa a fallos. | Menos horas depurando Hacienda/BCCR y 0 incidentes de doble facturación. |
| `STK-02` | **Vibe coder (builder con agentes IA)** | Usa Claude Code, Cursor u otros agentes para crear aplicaciones de negocio sin ser especialista en bases de datos ni tributación. | Herramientas con contratos explícitos, CLI/MCP claros y compuertas de verificación (`Factura CI`, `CR API Passport`) que atrapen errores silenciosos que el agente no ve. | Poder pasar de prompt a app confiable sin romper datos históricos ni bloquear IPs de Hacienda. |
| `STK-03` | **Agencia de software** | Entrega múltiples proyectos para PYMEs al año con márgenes ajustados. | Estandarizar migraciones repetibles (`Data Exodus`), QA fiscal automatizado en CI (`Factura CI`) y adaptadores mantenidos (`CR API Passport`). | Reducción de retrabajo en migraciones y garantía verificable ante clientes. |
| `STK-04` | **Implementador de sistemas / consultor** | Migra negocios desde Excel, cuadernos y software legacy hacia sistemas nuevos. | Detectar contradicciones antes del corte a producción, revisar conflictos con el cliente y entregar un reporte auditable de reconciliación. | Migración reproducible con respaldo documental de cada decisión tomada. |
| `STK-05` | **Dueño de pequeña empresa (PYME)** | Propietario de taller de refrigeración/servicios técnicos (1–5 técnicos). | No perder historial de clientes, garantías ni saldos al modernizar su negocio; controlar cobros y aprobaciones sin pagar un ERP corporativo. | Saber exactamente qué se aprobó, qué se instaló y cuánto debe cada cliente con pruebas. |
| `STK-06` | **Operador de OficiOS (técnico / recepcionista)** | Persona que registra recepción, diagnóstico, presupuesto, materiales y cierre en campo o taller. | Flujos rápidos en español costarricense, claros, con mensajes de error comprensibles y sin formularios burocráticos innecesarios. | Registrar y cerrar una orden en pocos pasos sin olvidar evidencia crítica. |
| `STK-07` | **Administrador de integración** | Configura credenciales, certificados `.p12`, tokens BCCR SDDE, políticas de caché y límites de tasa por empresa. | Aislamiento estricto de secretos por tenant/emisor, rotación sencilla y alertas claras ante expiración o bloqueos `429`. | Cero fugas de credenciales entre empresas y diagnóstico inmediato de fallos externos. |
| `STK-08` | **Auditor / responsable de cumplimiento / contador** | Revisa trazabilidad contable, retención de comprobantes y justificación de saldos migrados. | Procedencia completa hasta archivo original (hash SHA-256), registro inmutable de quién aprobó una fusión o ajuste y cumplimiento de plazos fiscales. | Responder «de dónde salió este monto» en segundos con evidencia verificable. |
| `STK-09` | **Contribuidor open source** | Desarrolla nuevos pasaportes de API, importadores o reglas de oficio. | Contratos estables (`@quimera/core`), arquitectura limpia sin dependencias ocultas, pruebas deterministas locales y versionado predecible. | Poder contribuir un pasaporte o importador nuevo en un solo paquete sin compilar todo el ecosistema. |
| `STK-10` | **Operador de infraestructura** | Despliega, respalda y monitorea PostgreSQL, almacenamiento de evidencia y workers en producción. | Despliegue sencillo (Node 22 + PostgreSQL), logs estructurados sin secretos, migraciones reproducibles y recuperación segura tras caídas. | Reinicios seguros sin corrupción de datos ni pérdida de operaciones fiscales. |

---

## 2. Personas detalladas (Arquetipos principales)

### Persona A — «Diego, el Vibe Coder / Builder Pragmático» (`STK-01`, `STK-02`)
- **Contexto:** Desarrollador full-stack independiente en San José; construye apps para clientes locales con Claude Code y PostgreSQL/Supabase.
- **Frustraciones:** Su agente de IA generó un script que importó 2.000 clientes de Excel y duplicó 120; además generó una integración con el viejo Web Service del BCCR que dejó de existir en junio 2026 y un POS que emitió dos facturas cuando falló el internet.
- **Qué espera de QUIMERA:** `npx` / CLI limpio, contratos TypeScript estrictos, un servidor MCP ligero cuando trabaja con agentes y pruebas automáticas que le digan exactamente *qué falló y por qué* (`FC-017: Dos peticiones simultáneas reservaron el mismo consecutivo`).

### Persona B — «Mariela, Consultora de Implementación para PYMEs» (`STK-03`, `STK-04`)
- **Contexto:** Implementa soluciones administrativas para pequeñas distribuidoras y talleres de servicios en el GAM.
- **Frustraciones:** Cada cliente entrega 5–10 archivos distintos con nombres inconsistentes y pagos anotados en WhatsApp o Excel; si algo no cuadra semanas después, el cliente culpa a la migración.
- **Qué espera de QUIMERA:** Un flujo de `Data Exodus` que haga dry-run, liste todos los conflictos claros para revisarlos con el dueño, guarde las aprobaciones firmadas por actor y genere una base PostgreSQL limpia con trazabilidad por registro.

### Persona C — «Carlos, Dueño y Técnico Principal de FríoTico Servicios» (`STK-05`, `STK-06`)
- **Contexto:** Negocio de mantenimiento y reparación de aires acondicionados en Heredia (3 técnicos). Hoy lleva clientes en Excel, cotizaciones en WhatsApp y facturas en un portal externo.
- **Frustraciones:** Clientes que reclaman «yo nunca aprobé ese cambio de compresor», técnicos que olvidan anotar el refrigerante utilizado y pérdida del historial de garantía de equipos instalados hace 2 años.
- **Qué espera de QUIMERA (`OficiOS`):** Ver al cliente y su equipo con todo el historial rescatado de sus archivos viejos, registrar diagnóstico y presupuesto, impedir cerrar el trabajo sin constancia de aprobación y generar el cobro/comprobante sin redigitar.

### Persona D — «Sofía, Contadora / Auditora Externa» (`STK-08`)
- **Contexto:** Asesora fiscal de 12 PYMEs en Costa Rica; revisa declaraciones de IVA y conciliaciones bancarias.
- **Frustraciones:** Sistemas nuevos que muestran saldos «mágicos» sin respaldo y aplicaciones de facturación que reutilizan consecutivos o duplican facturas por errores de red.
- **Qué espera de QUIMERA:** Informes de conciliación exportables, hashes SHA-256 de archivos origen, registro de decisiones humanas de reconciliación y trazabilidad inmutable de estados fiscales (`FIRMADO`, `ENVIADO`, `ACEPTADO`, `RECHAZADO`).

---

## 3. Conflictos de interés entre Stakeholders y cómo los resuelve la arquitectura

| Conflicto | Stakeholders en tensión | Manifestación práctica | Resolución arquitectónica en QUIMERA |
|---|---|---|---|
| **Velocidad de entrega vs. Rigor de integridad** | `STK-02` (Vibe coder) / `STK-06` (Operador) vs. `STK-08` (Auditor) | El vibe coder o el técnico quieren «importar todo en 1 clic» o «cerrar la orden ya», mientras el auditor exige cero fusiones silenciosas y aprobación explícita. | **Compuertas deterministas no silenciosas:** lo inequívoco se automatiza (duplicados exactos por hash/clave), lo ambiguo bloquea explícitamente con cola de revisión rápida; en `OficiOS`, el bloqueo de cierre sin aprobación explica exactamente qué falta para desbloquearlo en 1 paso. |
| **Simplicidad de instalación vs. Aislamiento y modularidad** | `STK-01`/`STK-02` vs. `STK-09` (OSS) / `STK-10` (Infra) | Un usuario nuevo quiere un solo comando para probar; un contribuidor o agencia solo quiere instalar `@quimera/data-exodus` o `@quimera/cr-api-passport`. | **Monorepo con paquetes publicables independientemente** más un perfil `quickstart` / Docker Compose para demo completa. Ningún paquete arrastra a `OficiOS` ni a `Clairic`. |
| **Uso de IA para conveniencia vs. Confiabilidad y costo cero** | `STK-02` (Vibe coder) vs. `STK-05` (Dueño PYME) / `STK-10` (Infra) | El vibe coder puede querer extracción IA automática sobre PDFs/fotos; el dueño PYME y el operador no quieren depender de APIs preview pagas ni GPUs. | **Baseline determinista obligatorio sin IA** (`QR-CORE-004`). `Clairic` es un adaptador opcional detrás de `StructuredExtractorPort`, con scores de confianza auditables y prohibición de auto-aprobar cambios fiscales o financieros críticos. |
| **Frescura de datos oficiales vs. Riesgo de bloqueo por tasa** | `STK-06` (Operador) vs. `STK-07` (Admin integración) | Consultar a Hacienda en cada tecla presionada causa bloqueos de IP por 10 minutos (especialmente bajo CGNAT). | **`CR API Passport` impone caché local con TTL explícito + rate limiter por defecto** respetando los límites oficiales de Hacienda (`20 req/s` ráfaga, `10 req/s` sostenido) y expone metadatos de frescura (`fetchedAt`, `fromCache`). |
| **Aislamiento multi-empresa vs. Conveniencia de pruebas locales** | `STK-07`/`STK-08` vs. `STK-01` | En local un dev suele usar un único esquema y un solo archivo de configuración; en producción compartir contadores o tablas entre empresas causa desastres fiscales. | **`tenantId` obligatorio en todos los modelos de datos y `issuerId` en contadores fiscales desde el día 1**, con soporte para un `default-tenant` explícito en modo local. |
