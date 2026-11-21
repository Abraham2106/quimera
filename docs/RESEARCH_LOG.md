# Registro de Investigación (RESEARCH_LOG) — QUIMERA

- **Versión:** 1.0.0
- **Fecha de corte:** 2026-11-21
- **Estado:** Verificado con fuentes primarias
- **Alcance:** Inventario de materiales locales, inspección directa de código de los 7 repositorios de `DojoCodingLabs`, APIs oficiales de Costa Rica, infraestructura Cloudflare, modelo Clairic, Caricaco Ventures, reglas del Dojo AI Hackathon 2026 y estado del arte (SotA).

---

## 1. Inventario de materiales locales en el repositorio

Inspección ejecutada sobre `/agent/repos/quimera` en la rama base `main` (commit `21cdce9`):

| Recurso | Estado | Contenido verificado | Observaciones |
|---|---|---|---|
| `README.md` | Presente | Contiene únicamente `# quimera` (10 bytes). | Repositorio recién inicializado sin documentación previa. |
| Brief original de QUIMERA (archivo separado) | **Faltante en repo** | No existe archivo en el árbol git; el contexto disponible proviene íntegramente del prompt maestro y notas adjuntas del usuario. | Registrado como fuente ausente; no se inventa contenido adicional. |
| Código de producto o paquetes previos | **Inexistente** | No existen `package.json`, `src/`, ni esquemas previos. | Proyecto greenfield; fase actual estrictamente de investigación, requisitos y arquitectura. |
| Historial git | 1 commit | `21cdce9 Initial commit`. | Sin ramas ni PRs previos. |

### Clasificación del contexto provisto por el usuario

- **Decisiones explícitas confirmadas:**
  1. QUIMERA es un toolkit modular componible (filosofía estilo Apache), no un ERP monolítico ni un wrapper genérico de IA.
  2. El baseline **debe operar 100% sin modelos de IA, sin GPU y sin inferencia externa**. Clairic es un módulo estrictamente opcional.
  3. Cada módulo debe poder instalarse y ejecutarse de forma independiente (ej. Data Exodus sin OficiOS, Factura CI ni Clairic).
  4. OficiOS es una aplicación consumidora del toolkit, nunca una dependencia de QUIMERA Core.
  5. Para el BCCR debe usarse la nueva API **SDDE** (el Web Service heredado fue descontinuado en 2026).
  6. No implementar código de aplicación en esta fase; entregar documentación exhaustiva, consistente y lista para implementar.
- **Propuestas abiertas / sujetas a análisis crítico:**
  1. Estrategia de convergencia de los 5 subproyectos (CR API Passport, Data Exodus, OficiOS, Factura CI, Fiscal Outbox) en un MVP viable para hackathon.
  2. Relación exacta entre `Fiscal Outbox` y el módulo `delivery` ya existente en `@dojocoding/hacienda-sdk@0.13.0`.
  3. Diferenciación de `CR API Passport` frente a servidores MCP públicos ya existentes (`jmnzcn/mcp-hacienda-cr`).
  4. Selección de oficio inicial para `OficiOS` (refrigeración/aire acondicionado vs talleres automotrices/celulares).
  5. Arquitectura de lenguaje (TypeScript-first con Python aislado opcional) y adopción o no de Cloudflare Workflows/Durable Objects en MVP.
- **Contradicciones / matices detectados:**
  1. **Nombres de tracks del hackathon:** El contexto previo menciona «Build for Builders» y «Business»; la convocatoria oficial publicada por Dojo Coding el 2026-11-04 anuncia dos tracks: **«AI Apps & Tools»** (herramienta o integración funcional) y **«AI Operators»** (agentes que ejecutan procesos de negocio). Se documentan ambos nombres y se alinea QUIMERA al track *AI Apps & Tools* (equivalente a Builders).
  2. **Existencia previa de outbox en `hacienda-cr`:** El contexto preliminar sugería que el SDK no tenía máquina de estados ni almacén durable de entregas. La inspección directa de `DojoCodingLabs/hacienda-cr` v0.13.0 confirmó que ya implementa `packages/sdk/src/delivery/` (`FileDocumentStore`, `DocumentStore`, `VALID_TRANSITIONS`, `classifySendResult`, `evaluateDeadline`), aunque sigue careciendo de almacén multi-proceso en PostgreSQL, aislamiento multi-tenant de contadores e idempotencia a nivel de pedido.
  3. **Uso de `claude-code-waypoint` en Data Exodus:** El contexto preliminar sugería usar Waypoint para conservar decisiones de migración. La inspección verificó que Waypoint es una plantilla de archivos Markdown y hooks para Claude Code (herramienta de desarrollo), no una librería ni base de datos transaccional apta para persistir decisiones auditables de migración en runtime.

---

## 2. Auditoría directa de repositorios del ecosistema Dojo Coding

Todas las inspecciones se realizaron vía GitHub API leyendo árboles de archivos, `package.json`, `LICENSE`, `README.md` y código fuente real el **2026-11-21**.

| Repositorio | Último push verificado | Versión / Lenguaje | Licencia verificada | Capacidades reales implementadas | Clasificación para QUIMERA |
|---|---|---|---|---|---|
| [`DojoCodingLabs/hacienda-cr`](https://github.com/DojoCodingLabs/hacienda-cr) | 2026-11-20 | `v0.13.0` (SDK, CLI, MCP) / TypeScript, Node 22+, pnpm 12 | **MIT** | Auth OAuth2 IDP (`TokenManager`), clave 50 dígitos, builders de los 8 comprobantes v4.4 + API exacta decimal (`BigInt`), validación XSD (`xmllint-wasm`) + Zod 4, firma XAdES-EPES (`node-forge`, `xadesjs`), `verifySignedDocumentXml`, `verifyHaciendaResponseXml`, `parseDocumentXml`, `lookupTaxpayer`, calendario de feriados CR, módulo `delivery` (`DocumentStore`, `FileDocumentStore`, máquina de estados `FIRMADO→PENDIENTE→ENVIADO/ALMACENADO→ACEPTADO/RECHAZADO/VENCIDO`), y paquete interno `packages/mock` (simulador de transporte loopback, no publicado en npm). | **Dependencia de runtime aprobada** (`@dojocoding/hacienda-sdk` únicamente). NO reimplementar XML 4.4, firma, clave ni state machine base. |
| [`DojoCodingLabs/dojo-marketplace-mcp`](https://github.com/DojoCodingLabs/dojo-marketplace-mcp) | 2026-10-03 | `v0.1.0` / TypeScript, Node 18+ | **MIT** | Servidor MCP (`@dojocoding/marketplace-mcp`, stdio + HTTP) con 4 toolsets (`browse`, `install`, `publish`, `account`) sobre `https://api.dojocoding.io` con `DOJO_API_KEY`. | **Canal de distribución opcional** (para publicar skills/plugins de Passport o Factura CI). **NO** es dependencia de runtime. |
| [`DojoCodingLabs/whatsapp-adapter`](https://github.com/DojoCodingLabs/whatsapp-adapter) | 2026-10-03 | `whatsapp-sdk@0.10.0`, `whatsapp-mcp@0.5.0` (pre-1.0) / TypeScript, Node 20+ | **MIT** | SDK tipado para Meta WhatsApp Cloud API con adaptadores Express/Hono/Web y storage opcional `pg`/`ioredis`; MCP server con 19 herramientas outbound. Pre-1.0 (sujeto a breaking changes en minor; v1.0 bloqueada por live smoke test WABA). | **Integración opcional post-MVP** exclusiva para `OficiOS` (notificaciones/confirmaciones). **NO** entra en Core ni en MVP obligatorio. |
| [`DojoCodingLabs/claude-code-waypoint`](https://github.com/DojoCodingLabs/claude-code-waypoint) | 2026-10-03 | `v2.0.0` / Shell + Markdown + hooks TS | **MIT** | Plantilla `.claude/` + `plans/` de 3 archivos (`plan`, `context`, `tasks`), hooks de auto-activación de skills y comandos `/create-plan`, `/update-context`, `/resume`. | **Herramienta opcional de desarrollo** para sesiones con agentes. **Descartada como runtime** de Data Exodus (decisiones van en PostgreSQL). |
| [`DojoCodingLabs/make-no-mistakes-toolkit`](https://github.com/DojoCodingLabs/make-no-mistakes-toolkit) | 2026-10-03 | `v1.43.0` / Shell + TypeScript CLI + Markdown | **BSL 1.1** (uso no competitivo; convierte a Non-Profit OSL 3.0 en 5 años) | Plugin Claude Code / OpenCode con 37 comandos, 10 skills, 2 subagentes y hooks `PreToolUse`/`PostToolUse` para ciclo Linear+GitHub+Slack+auditorías. | **Excluida de runtime y redistribución** por licencia BSL 1.1 y por ser estrictamente tooling de flujo dev. |
| [`DojoCodingLabs/code-sensei`](https://github.com/DojoCodingLabs/code-sensei) | 2026-10-03 | Plugin Claude Code / Bash + `jq` | **MIT** | Tutor interactivo de programación embebido en Claude Code (10 comandos, 45 conceptos, 124 preguntas, perfil local `~/.code-sensei/`). | **Excluida.** Sin relación arquitectónica ni funcional con QUIMERA. |
| [`DojoCodingLabs/GTM-Engineering-Command-Center`](https://github.com/DojoCodingLabs/GTM-Engineering-Command-Center) | 2026-10-03 | `v1.14.0` / Python + Markdown | **MIT** | Plugin Claude Code para automatización de campañas publicitarias, Meta/Google Ads, SEO, email y pre-testing neuronal Tribe v2. | **Excluida del producto.** Sin relación técnica con el toolkit; solo referencia potencial para marketing comercial posterior. |

---

## 3. Verificación de APIs y estándares externos

| Fuente | URL verificada | Fecha / Vigencia | Hallazgos verificables clave |
|---|---|---|---|
| **API Pública del Ministerio de Hacienda CR** | `https://api.hacienda.go.cr/docs/` | Verificado 2026-11-21 | Endpoints públicos sin autenticación: `/fe/ae` (9–12 dígitos), `/fe/cabys` (`q` min 3 chars o `codigo` 13 dígitos), `/fe/ex` (`autorizacion` `AL-XXXXXXXX-XX`), `/fe/agropecuario`, `/fe/pesca`, `/indicadores/tc/dolar`, `/indicadores/tc/dolar/historico`, `/indicadores/tc/euro`, `/indicadores/tc`. **Rate limits oficiales:** Burst 20 req/s en 5s (máx 100), sostenido 10 req/s en 120s (máx 1200) → **bloqueo de IP por 10 min**. Errores 400, 404, 429. Recomienda explícitamente caché local y alerta sobre CGNAT/IPs compartidas. |
| **Comprobantes Electrónicos v4.4 (DGT)** | `https://www.hacienda.go.cr/docs/ComprobantesElectronicos-GeneralidadesyVersion4.4.marzo2025.pdf` | Obligatoria desde 2025-09-01 | 8 tipos de comprobantes, desglose de impuestos por tarifa, desglose por medio de pago, tipo de moneda y tipo de cambio obligatorios (CRC=1, USD=tipo de cambio venta BCCR), códigos CAByS obligatorios y clasificación por condición IVA. |
| **Competidor OSS MCP Hacienda CR** | `https://github.com/jmnzcn/mcp-hacienda-cr` | Verificado 2026-11-21 | Servidor MCP ya publicado (`io.github.jmnzcn/mcp-hacienda-cr`) que expone lectura pública de contribuyentes, CAByS, tipo de cambio, exoneraciones y validación XML 4.4. **Implicación crítica:** CR API Passport no debe ser un simple wrapper MCP. |
| **BCCR — Estándar API SDDE** | `https://gee.bccr.fi.cr/indicadoreseconomicos/Documentos/DocumentosMetodologiasNotasTecnicas/Estandar_API_SDDE.pdf` | Norma vigente desde 2025-04-07; Web Service legacy deshabilitado **2026-06-30** | Base URL: `https://apim.bccr.fi.cr/SDDE/api/Bccr.Ge.SDDE.Publico.Indicadores.API`. **Requiere registro y `Authorization: Bearer <token>`** generado en `Mi Perfil → Generar token`. Endpoints: `/cuadro/descargar`, `/cuadro/{codigo}/metadata`, `/cuadro/{codigo}/series`, `/indicadoresEconomicos/descargar`, `/indicadoresEconomicos/{codigo}/metadata`, `/indicadoresEconomicos/{codigo}/series`, `/misPreferencias/...`, `/Usuario/ValideSuscripcion`. Códigos HTTP: 200, 400, 401, 403, 404, 429, 500. Nota documental: inconsistencias de mayúsculas en el propio PDF oficial (`Ge` vs `GE`, `SDDE` vs `sddE`). |
| **BCCR — Aviso Mercado Financiero Internacional** | `https://www.bccr.fi.cr/cr/es/noticias/listado-de-noticias/2026/nueva-version-servicio-resumen-mercado-financiero-internacional.html` | Publicado 2026-11-20 | A partir del 2026-12-04 ese subconjunto migra a Power BI y **no tendrá conexión API disponible temporalmente**. Confirma la volatilidad real de APIs públicas CR. |
| **SNIT Costa Rica (IGN / IDECORI)** | `https://www.snitcr.go.cr/pdfs/tutoriales_presentaciones/CONEXION%20DE%20LOS%20SERVICIOS%20OGC%20DESDE%20QGIS.pdf` | Verificado 2026-11-21 | Geoservicios públicos interoperables OGC: WMS, WFS, WMTS, Esri REST y **OGC API-Features** en proyecciones CR SIRGAS/CRTM05 (EPSG:8908 / EPSG:5367) y WGS84 (EPSG:4326). Sin API key para consulta pública estándar. |
| **Correos de Costa Rica (Pymexpress / Fulfillment)** | `https://correos.go.cr/conecta-tu-negocio-con-correos-de-costa-rica/` y nota prensa `2026-11-06` | Verificado 2026-11-21 | **API privada con alta comercial:** requiere afiliación a Pymexpress (`pymexpress@correos.go.cr`) o contrato Fulfillment WMS; otorga credenciales privadas (`Username`, `Password`, `Usuario ID`, `Servicio ID`, `Código de cliente`). **No es una API pública abierta.** |
| **Cloudflare Queues, Workflows y Durable Objects** | `https://developers.cloudflare.com/queues/reference/delivery-guarantees/`, `.../workflows/reference/limits/` | Verificado 2026-11-21 | Queues garantiza entrega **at-least-once** (puede haber duplicados y desorden; 128 KB/msg, máx 100 retries, 14 días retención). Workflows persiste pasos con reintentos (wall-time ilimitado/step, 5 min CPU paid, 1 MiB resultado/step, 10k pasos default), exige que las llamadas externas sean **idempotentes** porque un step puede reejecutarse. Durable Objects ofrece coordinación fuertemente consistente por entidad. |
| **Cloudflare Code Mode & MCP 2026-07-28** | `https://blog.cloudflare.com/mcp-v2/`, `https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/` | Especificación MCP `2026-07-28` (publicada agosto 2026) | MCP 2026-07-28 es **stateless** (sin `Mcp-Session-Id` obligatorio, usa cabeceras `Mcp-Method` y `Mcp-Name`, elicitación vía MRTR `input_required`). Code Mode (`codeMcpServer`, `openApiMcpServer`) permite exponer APIs en sandbox de Workers con menor consumo de tokens, pero sigue marcado como **experimental** y usa SDK v1 legacy. |
| **Clairic (Cloudflare System One)** | `https://developers.cloudflare.com/ai/models/%40cf/cloudflare/clairic/`, `https://huggingface.co/Cloudflare/clairic` | Verificado 2026-11-21 | Modelo de extracción estructurada System One (27B basado en Qwen3.8-27B; también variante `clairic-flash`). Pesos abiertos en Hugging Face bajo **Apache 2.0** (requiere Python 3.11+, PyTorch, Transformers, `xgrammar`, GPU CUDA). Versión hospedada `@cf/cloudflare/clairic` en Workers AI: preview "AS IS / AS AVAILABLE" sin SLA, Zero Data Retention, 65,536 tokens contexto, hasta 4 imágenes/páginas PDF (4 MiB c/u, 8 MiB total, sin URLs remotas), precio $0.10/M tokens promo hasta 2026-12-01 luego $0.24/M. Devuelve valores tipados, `confidence`, `p_null` y character spans en `state`. |
| **Caricaco Ventures (CV2)** | `https://caricaco.vc/nuestra-tesis/`, `https://caricaco.vc/blog/cv2/` | Actualizado mayo–junio 2026 | Fondo VC pre-seed/seed para Centroamérica y RD. Tickets mínimos **US$200.000 vía SAFE**. Tesis: 100% software / AI-native, ambición global, **MVP lanzado en operación con usuarios activos e ingresos comprobables** (no invierte en etapa idea ni otorga fondos no reembolsables). |
| **Dojo AI Hackathon 2026** | `https://es.linkedin.com/posts/dojo-coding_dojo-ai-hackathon-del-prompt-al-producto-activity-7523883205272387584--hYF` | 2026-11-20 al 2026-11-22 | Evento de 3 días (arranque presencial WeWork Cariari + LATAM). Equipos de 1 a 4 personas. Dos tracks: **AI Apps & Tools** y **AI Operators**. Premio total US$1.000 (US$500 por track). |
| **Competidores locales OficiOS (CR)** | `https://asystec.io/tallerapp`, `https://astra.astranexo.com/soluciones/taller-automotriz` | Verificado 2026-11-21 | **TallerApp (Asystec)** y **Astra** ya cubren recepción, fotos, firma digital, diagnósticos, aprobaciones, seguimiento por link/WhatsApp y FE 4.4 para talleres automotrices y servicios técnicos en CR. **Implicación:** OficiOS no puede competir como CRUD genérico de talleres; debe diferenciarse en contratos por oficio + procedencia desde Data Exodus + flujo offline/evidencia verificable. |

---

## 4. Verificación de licencias y estado del arte (SotA)

| Herramienta | Licencia verificada | Fuente | Nota de compatibilidad / límite |
|---|---|---|---|
| Airbyte Core | **Elastic License 2.0 (ELv2)** (source-available) | `docs.airbyte.com/community/licenses/license-faq` | Prohíbe ofrecerlo como servicio gestionado a terceros; arquitectura pesada para PYME local/CLI. |
| dbt Core v1 / dbt OSS v2 | **Apache 2.0** (distribución completa `dbt` bajo Product Licensing Agreement) | `getdbt.com/licenses-faq` | Excelente para ELT SQL-a-SQL, pero no resuelve ingestión heterogénea de archivos caóticos ni reconciliación humana. |
| OpenLineage | **Apache 2.0** (LF AI & Data Graduate) | `github.com/OpenLineage/OpenLineage` | Estándar excelente para linaje a nivel de job/dataset; no cubre procedencia a nivel de campo/registro con evidencia de archivo sin extensión. |
| Temporal | **MIT** | `github.com/temporalio/temporal` | Motor de ejecución durable maduro, pero exige clúster/servidor dedicado (overkill para MVP CLI/Node). |
| Apache NiFi / Airflow / Debezium / Arrow | **Apache 2.0** | Proyectos Apache / CNCF | Orientados a data engineering empresarial de alto volumen; alta fricción operativa para microempresas y vibe coders. |
| OpenRefine | **BSD-3-Clause** | `openrefine.org` | Limpieza interactiva de tablas en desktop; carece de CLI/SDK componible, modelos relacionales multi-fuente y ledger de procedencia SQL. |
| Great Expectations / Pandera | **Apache 2.0 / MIT** | Repositorios oficiales | Validación de calidad en Python; útiles como referencia de diseño, pero introducir Python obligatorio en el core duplicaría runtimes innecesariamente. |
| Splink (Entity Resolution) | **MIT** (UK Ministry of Justice) | `moj-analytical-services/splink` | Modelo probabilístico Fellegi-Sunter de alta calidad en Python/DuckDB; excelente candidato como plugin opcional futuro, excesivo para MVP determinista. |
| Pact / fast-check | **MIT** | `pact.io`, `fast-check.dev` | `fast-check` ya es usado incluso dentro de `hacienda-cr`; ideal para property-based testing en TypeScript. |

---

## 5. Registro de fuentes no verificables o ausentes

1. **Brief original externo de QUIMERA:** No existe en el repositorio; cualquier referencia fuera del prompt maestro se marca como `[NO DISPONIBLE]`.
2. **Rúbrica detallada de jueces del Dojo AI Hackathon 2026:** La publicación oficial confirma fechas, formato, tracks y premios, pero no publica porcentajes exactos de la rúbrica de evaluación; se registra en `docs/ASSUMPTIONS.md`.
3. **Documentación técnica de la API privada de Correos de Costa Rica (PDF de integración Pymexpress):** Solo se entrega a clientes afiliados tras registro comercial. No se inventan endpoints ni esquemas de Correos CR.
4. **Endpoints completos de inventario SNIT específicos por capa catastral:** El acceso requiere seleccionar la URL de cada capa desde el visor/inventario de SNIT; se documenta como fuente OGC estándar sin inventar rutas específicas no probadas.
