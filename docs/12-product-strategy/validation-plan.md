# Plan de Validación de Producto y Mercado — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Experimentos propuestos post-MVP (sin demanda validada todavía)
- **Referencias:** [Mercado y Competencia](./market-and-competition.md) | [Distribución y Monetización](./distribution-and-monetization.md) | [Roadmap](../11-implementation/development-roadmap.md)

---

## 1. Inventario de Hipótesis Críticas a Validar

Ninguna inversión fuerte en escala comercial (ni aplicación a fondos como Caricaco Ventures) debe iniciarse sin someter estas cinco hipótesis a falsación real:

| ID | Hipótesis (`[NO VALIDADO]`) | Segmento | Evidencia que la confirma | Evidencia que la refuta (pivote o descarte) |
|---|---|---|---|---|
| **H-01** | Los desarrolladores y vibe coders que construyen software para Costa Rica adoptan `CR API Passport` porque detectar deriva y evitar bans IP ahorra errores reales frente a generar clientes HTTP directos con un LLM. | `STK-01`, `STK-02`, `STK-03` | ≥10 instalaciones externas orgánicas vía npm/Dojo Marketplace y ≥5 desarrolladores ejecutando `passport verify` de forma recurrente. | Los usuarios prefieren copiar prompts o usar `jmnzcn/mcp-hacienda-cr` y no encuentran valor adicional en los pasaportes ni en `verify`. |
| **H-02** | Equipos y agencias que integran facturación electrónica CR tienen bugs reales de concurrencia, timeout o estados que `Factura CI` logra descubrir en sus apps existentes. | `STK-01`, `STK-03` | Al ejecutar `Factura CI` en ≥5 aplicaciones reales de terceros (en entorno local/staging), descubre al menos 1 bug real no detectado por sus pruebas previas en ≥3 de ellas. | Ninguna app externa presenta fallos relevantes o los equipos no desean adaptar su SUT al runner de `Factura CI`. |
| **H-03** | Implementadores y agencias enfrentan migraciones sucias de PYMEs donde la detección de conflictos y la procedencia de `Data Exodus` les ahorra trabajo frente a scripts ad-hoc con IA. | `STK-03`, `STK-04` | ≥3 migraciones reales de datasets PYME completadas usando `Data Exodus` sin necesidad de modificar el código fuente del motor, con conflictos reales descubiertos y aprobados por el cliente. | Cada PYME requiere tanto código personalizado que el tiempo total iguala o supera escribir un script puntual en Python/TS. |
| **H-04** | Talleres de refrigeración/HVAC de 1–5 técnicos en Costa Rica experimentan dolores concretos no resueltos por TallerApp/Astra (pérdida de aprobaciones, falta de evidencia técnica o migración de historial) y están dispuestos a pagar por `OficiOS`. | `STK-05`, `STK-06` | Entrevistas con 10 dueños de talleres HVAC + ≥3 talleres usando `OficiOS` en operación semanal continua + compromiso explícito de pago tras piloto. | Los talleres ya están satisfechos con Excel/WhatsApp gratuito o TallerApp/Astra y rechazan cambiar o pagar una suscripción. |
| **H-05** | Existe un comprador dispuesto a pagar por capacidades avanzadas (CI multi-proyecto de `Factura CI`, conectores privados de `CR API Passport`, UI colaborativa de `Data Exodus` o suscripción `OficiOS`). | `STK-03`, `STK-05` | Al menos 3 cartas de intención o pilotos pagos reales antes de construir funcionalidades de escala. | Interés únicamente gratuito (open source) sin disposición a pagar ni presupuesto asignable. |

---

## 2. Secuencia de Experimentos de Validación (Sin Inventar Tracción)

### Experimento 1 — Validación Técnica Builders (`CR API Passport` + `Factura CI`)
- **Acción:** Publicar versión Beta Técnica en npm y Dojo Marketplace; invitar a 10 desarrolladores/agencias de la comunidad Dojo Coding en Costa Rica a correr `quimera passport verify` y `quimera factura-ci run` contra un proyecto real o prototipo propio.
- **Métricas observables:** Tiempo hasta primera ejecución exitosa (`QR-NFR-008`), número de bugs reales descubiertos por `Factura CI`, tasa de retención en CI (si dejan la GitHub Action instalada).

### Experimento 2 — Prueba de Campo con Datos Reales Sucios (`Data Exodus`)
- **Acción:** Conseguir 2 a 3 conjuntos reales de archivos históricos de PYMEs costarricenses (bajo acuerdo de confidencialidad y ejecución local en máquina del cliente, sin subir datos a la nube).
- **Métricas observables:** Porcentaje de columnas correctamente perfiladas sin edición manual, tipos de conflicto reales no contemplados en las 10 reglas iniciales, tiempo del dueño revisando conflictos y satisfacción con la trazabilidad de saldos.

### Experimento 3 — Descubrimiento de Oficio (`OficiOS` en Talleres HVAC)
- **Acción:** Realizar 8–10 entrevistas de observación de flujo real (no encuestas genéricas de «¿te gusta mi app?») con talleres de aire acondicionado y refrigeración en el GAM (Gran Área Metropolitana, CR). Comparar directamente contra sus herramientas actuales (WhatsApp, cuadernos, Excel, TallerApp o Astra).
- **Decisión de compuerta:** Si el dolor principal no justifica un producto SaaS propio, mantener `apps/oficios` estrictamente como **aplicación de referencia open source** del toolkit QUIMERA y concentrar el esfuerzo comercial en las herramientas *Builders* (`Data Exodus` + `Factura CI` + `CR API Passport`).

---

## 3. Regla de Disciplina de Foco

Al finalizar los Experimentos 1–3, el equipo debe elegir **un único motor comercial primario** (Builders/Infraestructura *o* SaaS vertical `OficiOS`) respaldado por evidencia real, manteniendo la modularidad open source de los demás paquetes para no diluir recursos.
