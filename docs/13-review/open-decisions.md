# Decisiones Pendientes (Open Decisions) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Asuntos que requieren decisión explícita del equipo/propietario o evidencia externa antes de comprometer fases posteriores
- **Referencias:** [Cuestiones Abiertas](../OPEN_QUESTIONS.md) | [Supuestos](../ASSUMPTIONS.md) | [Plan de Validación](../12-product-strategy/validation-plan.md)

---

## 1. Decisiones Que NO Bloquean el Inicio del Slice 1 (Pueden Resolverse Durante el MVP)

| ID | Decisión pendiente | Opciones candidatas | Recomendación técnica | Momento límite |
|---|---|---|---|---|
| `OD-01` | **Stack de interfaz web minimalista para `apps/oficios/web`** (`OQ-02`) | (A) React + Vite + Tailwind minimalista<br/>(B) Hono JSX SSR + HTMX | **(A)** si el equipo tiene mayor soltura con React; **(B)** si se prioriza cero paso de build frontend en hackathon. Ambas consumen exactamente la misma API REST `/api/v1/*`. | Inicio de Slice 5 (`US-020`) |
| `OD-02` | **Track de inscripción formal en Dojo AI Hackathon 2026** (`OQ-09`) | (A) **AI Apps & Tools** (*Build for Builders*)<br/>(B) **AI Operators** | **(A) AI Apps & Tools**, presentando `Data Exodus` + `CR API Passport` + `Factura CI` como infraestructura para builders y `OficiOS` como demostración real de continuidad operativa. | Antes del registro final de entrega |
| `OD-03` | **Verificación live de capitalización exacta de rutas en BCCR SDDE** (`OQ-01`) | Confirmar en vivo `Bccr.Ge.SDDE` vs `Bccr.GE.sddE` usando un token personal gratuito del BCCR | Ejecutar `quimera passport verify cr.bccr.sdde --mode live` en cuanto un miembro genere su token en `Mi Perfil -> Generar token`. No bloquea desarrollo offline (`--mode fixture`). | Slice 4 / Beta Técnica |

---

## 2. Decisiones Estratégicas Post-MVP (Bloquean Beta Pública o Pilotos Pagos)

| ID | Decisión pendiente | Opciones candidatas | Evidencia requerida antes de decidir | Momento límite |
|---|---|---|---|---|
| `OD-04` | **Scope oficial de paquetes npm y marca** (`OQ-06`) | Confirmar disponibilidad de `@quimera/*` en npm o definir scope alternativo (ej. `@quimera-cr/*` / `@quimera-dev/*`) | Consulta directa en npm registry y verificación de marca local. | Antes de publicar Beta Técnica |
| `OD-05` | **Destino comercial primario tras experimentos `H-01`..`H-05`** (`OQ-07`) | (A) Enfoque **Builders** (`Data Exodus` + `Factura CI` + `CR API Passport`) manteniendo `OficiOS` como app de referencia OSS<br/>(B) Enfoque **SaaS Vertical** (`OficiOS` HVAC pago)<br/>(C) Híbrido secuencial | Resultados empíricos de los Experimentos 1, 2 y 3 en `validation-plan.md` (incluyendo entrevistas con 8–10 talleres HVAC sobre TallerApp y Astra). | Fin de Beta Técnica |
| `OD-06` | **Validación legal en Costa Rica (Ley 8968 + retención fiscal 5 años)** (`OQ-08`) | Validar política de seudonimización vs retención tributaria de XMLs firmados y términos de servicio multi-tenant | Revisión formal con asesoría legal en Costa Rica. | Obligatorio antes de habilitar producción con PYMEs reales (`QG-07`) |
| `OD-07` | **Soporte opcional de SQLite embebido para pruebas rápidas de `Data Exodus`** (`OQ-03`) | (A) Mantener PostgreSQL 16 como único motor soportado (`ADR-003`)<br/>(B) Agregar modo staging efímero en SQLite | Feedback de fricción de instalación (`QR-NFR-008`) durante Beta Técnica. | Post-MVP (Beta) |
| `OD-08` | **Política de adopción live de `@quimera/adapter-clairic`** | (A) Mantenerlo exclusivamente con stub hasta que Workers AI salga de preview con SLA<br/>(B) Ofrecer despliegue con GPU local (Apache 2.0) para clientes con PDFs escaneados | Demanda real validada en Experimento 2 y estabilidad comercial del servicio Workers AI. | Etapa 3 (Pilotos Empresariales) |
