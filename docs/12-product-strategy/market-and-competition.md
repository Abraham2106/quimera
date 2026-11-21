# Análisis de Mercado, Competencia y Posicionamiento — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Análisis inicial basado en fuentes públicas verificadas (sin cifras fabricadas de TAM ni demanda no comprobada)
- **Referencias:** [Panorama Técnico](../01-research/technical-landscape.md) | [Registro de Investigación](../RESEARCH_LOG.md) | [Plan de Validación](./validation-plan.md)

---

## 1. Disciplina Epistémica

Este documento separa explícitamente cuatro niveles de certeza:
- **`[EVIDENCIA]`:** Hecho comprobable en fuentes primarias consultadas (documentación oficial, repositorios públicos, sitios de competidores).
- **`[HIPÓTESIS]`:** Proposición comercial o de producto falsable que requiere pruebas con usuarios reales.
- **`[SUPUESTO]`:** Premisa operativa adoptada temporalmente para diseñar el producto (registrada también en `docs/ASSUMPTIONS.md`).
- **`[NO VALIDADO]`:** Aspecto sobre el cual todavía no existe evidencia empírica de mercado (ej. disposición a pagar, tamaño monetario real del segmento, tasa de conversión).

> **Política de integridad:** No se inventan estimaciones de TAM/SAM/SOM, ingresos proyectados, precios validados ni tasas de conversión.

---

## 2. Segmentos: Compradores vs Usuarios

En software de infraestructura empresarial, quien **usa** la herramienta frecuentemente no coincide con quien **aprueba el presupuesto**:

| Línea de QUIMERA | Usuario diario | Comprador / Decisor económico | Conflicto o fricción potencial |
|---|---|---|---|
| **`Data Exodus`** | Desarrollador, implementador, consultor o ingeniero de datos (`STK-01`, `STK-04`) | Agencia de software (`STK-03`) o dueño de PYME que paga una migración (`STK-05`) | El desarrollador valora rigor y trazabilidad; el cliente final solo quiere «ver sus datos en el sistema nuevo rápido». |
| **`CR API Passport`** | Desarrollador o vibe coder (`STK-01`, `STK-02`) | Líder técnico / agencia (si adquiere pasaportes privados o monitoreo continuo) | Los desarrolladores individuales rara vez pagan por un catálogo público gratuito; el valor pago aparece en integraciones privadas/CI continuo `[HIPÓTESIS]`. |
| **`Factura CI` + `Fiscal Outbox`** | Desarrollador backend, QA, fabricante de POS (`STK-01`, `STK-03`) | CTO / dueño de casa de software o proveedor de POS | Un fallo fiscal en producción cuesta multas, horas de soporte y pérdida de clientes, pero sin incidentes previos cuesta demostrar urgencia `[HIPÓTESIS]`. |
| **`OficiOS`** | Técnico HVAC y recepcionista (`STK-06`) | Dueño del taller / microempresa (1–5 técnicos, `STK-05`) | El dueño busca control de presupuestos y cobros; el técnico abandona la app si requiere demasiados clics en campo `[HIPÓTESIS]`. |

---

## 3. Mapa Competitivo Real (Verificado)

### 3.1. Migración y Calidad de Datos (`Data Exodus`)
- **`[EVIDENCIA]` Airbyte:** Líder OSS de movimiento/replicación EL con cientos de conectores. Resuelve sincronización continua entre bases/APIs estructuradas, pero no resuelve reconciliación semántica con compuerta humana desde hojas sucias heterogéneas (XLSX + CSV + XML FE 4.4) de una PYME.
- **`[EVIDENCIA]` Datafold:** Especializado en *data diff* y validación en migraciones de almacenes analíticos corporativos (Snowflake/BigQuery/Postgres), orientado a equipos de datos empresariales medianos/grandes.
- **`[EVIDENCIA]` OpenRefine:** Excelente herramienta interactiva de limpieza manual de tablas en escritorio, pero no genera pipelines declarativos idempotentes en PostgreSQL con procedencia relacional permanente ni contratos fiscales CR.
- **Brecha donde apuesta QUIMERA `[HIPÓTESIS]`:** Migraciones pequeñas y desordenadas (*small messy enterprise data*) de PYMEs que saltan de Excel/XML/sistemas viejos a apps modernas PostgreSQL/Supabase construidas con IA, donde el cuello de botella no es mover gigabytes sino **reconciliar contradicciones sin perder historia**.

### 3.2. APIs de Costa Rica (`CR API Passport`)
- **`[EVIDENCIA]` `jmnzcn/mcp-hacienda-cr`:** Ya existe un servidor MCP open source de solo lectura para APIs públicas de Hacienda CR y validación XML 4.4.
- **`[EVIDENCIA]` `@dojocoding/hacienda-sdk`:** Ya provee `lookupTaxpayer`, firma/validación XML y módulo `delivery` local.
- **Brecha donde apuesta QUIMERA `[HIPÓTESIS]`:** Manifiestos verificables multi-institución (incluyendo BCCR SDDE post-junio 2026), **detección automatizada de deriva entre documentación y comportamiento real**, guardrails de cuota contra el ban IP de 10 minutos y generación de adaptadores tipados con pruebas de contrato.

### 3.3. Verificación y Resiliencia Fiscal (`Factura CI` + `Fiscal Outbox`)
- **`[EVIDENCIA]` `DojoCodingLabs/hacienda-cr`:** Cubre la biblioteca fiscal y documenta en `production-integration.md` las responsabilidades críticas que deja a la aplicación (concurrencia de consecutivos, cola durable, idempotencia por pedido, recuperación de estados inciertos).
- **Brecha donde apuesta QUIMERA `[HIPÓTESIS]`:** Hoy no existe en el ecosistema abierto de Costa Rica un harness conductual tipo CI (`Factura CI`) ni un paquete PostgreSQL listo para producción (`Fiscal Outbox`) que convierta las recomendaciones de `production-integration.md` en pruebas reproducibles e infraestructura reutilizable.

### 3.4. Software Operativo para Talleres (`OficiOS`)
- **`[EVIDENCIA]` TallerApp (Asystec) y Astra:** Competidores activos en Costa Rica que ya ofrecen órdenes de trabajo, diagnóstico, fotografías, firma digital, seguimiento por WhatsApp y facturación electrónica 4.4.
- **Brecha donde apuesta QUIMERA `[HIPÓTESIS]`:** `OficiOS` NO puede competir como otro CRUD genérico de talleres. Su diferenciación propuesta es doble: (1) contratos técnicos específicos de oficio empezando por **HVAC / Refrigeración (`hvac-refrigeration-v1`)** con reglas duras de aprobación y mediciones, y (2) **onboarding sin dolor** desde los datos históricos sucios del taller vía `Data Exodus` conservando procedencia. **Riesgo alto `[NO VALIDADO]`:** falta comprobar en campo qué dolores concretos dejan sin resolver TallerApp y Astra en talleres HVAC de 1–5 técnicos.

---

## 4. Dependencia de Servicios Oficiales y Expansión Regional

- **`[EVIDENCIA]` Dependencia institucional CR:** Las APIs públicas de Hacienda no tienen SLA contractual formal y aplican ban IP de 10 minutos; BCCR descontinuó su SOAP el 30-jun-2026 y anunció en nov-2026 migración de un cuadro a Power BI sin API temporal. Esto convierte a la **detección de deriva y aislamiento offline/caché** en un requisito de supervivencia, no en un lujo.
- **`[HIPÓTESIS]` Expansión LATAM:** Los componentes de mayor portabilidad regional son el núcleo (`@quimera/core`, `@quimera/data-exodus`, `@quimera/pipeline`) y el patrón de `Factura CI` / `API Passport`. Lo país-específico está encapsulado en reglas de normalización, manifiestos de pasaporte y adaptadores fiscales (ej. Guatemala FEL, El Salvador DTE, Panamá DGI, Colombia DIAN, México CFDI).
- **`[EVIDENCIA]` Adecuación a inversión temprana (ej. Caricaco Ventures CV2):** La tesis pública de Caricaco Ventures (fondo CV2, mayo 2026) exige software/AI-native escalable regionalmente (CA y RD) con **MVP lanzado, usuarios activos e ingresos demostrables** (ticket mínimo US$200K en SAFE; no invierten en etapa de idea). Por tanto, QUIMERA no debe plantearse financiamiento VC hasta completar validación con usuarios reales y tracción comprobable.
