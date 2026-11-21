# Estrategia de Distribución, Open Source y Monetización — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Hipótesis estructuradas (pendientes de validación empírica)
- **Referencias:** [Mercado y Competencia](./market-and-competition.md) | [Plan de Validación](./validation-plan.md) | [Estrategia de Releases](../11-implementation/release-strategy.md)

---

## 1. Modelo Open Core + Distribución por Ecosistema

### 1.1. Capa Abierta (MIT — Adopción y Confianza)
Se propone liberar bajo licencia **MIT** (alineada con `@dojocoding/hacienda-sdk` y libre de fricciones BSL):
- `@quimera/core`, `@quimera/pipeline`, `@quimera/data-exodus` (CLI/SDK baseline CSV/XLSX/XML), `@quimera/cr-api-passport` (pasaportes públicos CR + CLI `verify`), `@quimera/fiscal-outbox` (core PostgreSQL) y `@quimera/factura-ci` (CLI local y suite base de escenarios).

**Justificación `[HIPÓTESIS]`:** En herramientas para desarrolladores y agencias (*Build for Builders*), la fricción de pago inicial bloquea adopción. El código abierto verificable crea confianza en un dominio sensible (datos contables y facturación) y convierte a desarrolladores en canal de descubrimiento.

### 1.2. Canal de Distribución: Dojo Marketplace (`DojoCodingLabs/dojo-marketplace-mcp`)
- **`[EVIDENCIA]`:** `dojo-marketplace-mcp` (`v0.1.0`, MIT) ya opera contra `api.dojocoding.io` con comandos `browse`, `install`, `publish` y `account`.
- **`[HIPÓTESIS]`:** Publicar skills/plugins gratuitos de **`CR API Passport`** y **`Factura CI`** en Dojo Marketplace ofrece distribución orgánica directa frente a desarrolladores y vibe coders que construyen apps para Costa Rica.
- **Límite arquitectónico confirmado:** Dojo Marketplace es exclusivamente un **canal de distribución**, nunca una dependencia de runtime del código de QUIMERA.

---

## 2. Hipótesis de Monetización (Sin Cifras Inventadas)

Todas las líneas siguientes son **`[HIPÓTESIS — NO VALIDADO]`** hasta completarse las entrevistas y pilotos definidos en `validation-plan.md`:

| Modelo potencial | Producto / Extensión | Comprador objetivo | Qué paga realmente el cliente | Riesgo principal |
|---|---|---|---|---|
| **M1. Extensiones Comerciales / CI para Equipos** | `Factura CI` Pro (GitHub App multi-proyecto, historial de regresiones, escenarios multi-país LATAM) + monitoreo continuo de deriva de `CR API Passport` + conectores privados certificados | Agencias de software (`STK-03`), fabricantes de POS, equipos de ingeniería | Ahorro de incidentes fiscales en producción y mantenimiento ante cambios inesperados de Hacienda/BCCR | Mercado local de agencias puede ser pequeño si no se expande a LATAM `[NO VALIDADO]` |
| **M2. Herramienta Pro + Migración Asistida** | UI web colaborativa de reconciliación para `Data Exodus` + paquetes de reglas sectoriales + soporte acotado a agencias que cobran por migrar PYMEs | Implementadores (`STK-04`), agencias (`STK-03`) | Reducir tiempo y riesgo legal al migrar clientes desde sistemas viejos | **Alto riesgo de convertirse en consultoría artesanal** si cada migración exige código a medida |
| **M3. SaaS Vertical** | `OficiOS` (hosting gestionado, soporte, backup PITR, retención fiscal 5 años, contratos por oficio, notificaciones opcionales) | Dueños de talleres de servicios técnicos (1–5 técnicos, `STK-05`) | Control operativo + trazabilidad + cumplimiento fiscal sin contratar equipo TI | Competencia directa con TallerApp/Astra y mayor costo de adquisición/soporte humano `[NO VALIDADO]` |

---

## 3. Costos Operativos y de Implementación (Análisis Técnico)

- **Costo de infraestructura del baseline:** Muy bajo (`[EVIDENCIA]` técnica): Node.js 22 + PostgreSQL 16 + almacenamiento de objetos S3/R2; **cero gasto en GPUs ni tokens LLM obligatorios**.
- **Costo marginal si el cliente activa `@quimera/adapter-clairic`:** Variable según proveedor (`[EVIDENCIA]`: Workers AI tarifa regular anunciada de $0.24/M tokens input tras dic 2026, sujeta a cambios del preview) o costo de GPU propia si corre open-weight Apache 2.0. Por diseño, este costo lo paga **únicamente** quien opte por habilitar IA.
- **Costo oculto principal a vigilar `[SUPUESTO]`:** Soporte técnico humano a PYMEs en `OficiOS` (alta en Hacienda, certificados `.p12`, dudas tributarias) y mantenimiento continuo de pasaportes cuando instituciones estatales modifican APIs sin aviso.

---

## 4. Mitigación del Riesgo de «Convertirse en Consultoría Personalizada»

Uno de los riesgos estratégicos más graves para `Data Exodus` es terminar vendiendo horas de ingeniería manual por cada PYME migrada (`RSK-014`). Reglas de contención:

1. **Vender primero a implementadores/agencias (B2B2B) antes que ejecutar migraciones manuales directamente:** Si una agencia no puede operar `Data Exodus` con `mapping.yaml` y la CLI sin llamar al equipo núcleo de QUIMERA, el producto todavía no está listo.
2. **Prohibir código específico de un cliente dentro de `@quimera/data-exodus`:** Toda regla nueva debe expresarse como transformador genérico reutilizable o manifiesto declarativo (`ADR-014`).
3. **Medir explícitamente horas de soporte por migración:** Si una migración asistida no reduce esfuerzo en cada cliente consecutivo, detener servicios y corregir el producto.
4. **No mezclar comercialmente los 5 componentes de inmediato:** Validar cuál tracción emerge primero (ej. `Factura CI` + `CR API Passport` para builders vs `Data Exodus` para implementadores vs `OficiOS` para talleres HVAC) antes de dividir el foco comercial.
