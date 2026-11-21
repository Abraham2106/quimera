# Cuestiones Pendientes (Open Questions) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Registro vivo de incógnitas y decisiones por confirmar
- **Referencias:** [Decisiones Pendientes](./13-review/open-decisions.md) | [Supuestos](./ASSUMPTIONS.md)

---

## 1. Cuestiones Técnicas Pendientes

| ID | Pregunta abierta | Impacto | Cuándo debe resolverse |
|---|---|---|---|
| `OQ-01` | ¿Cuál es el comportamiento exacto de sensibilidad a mayúsculas (*case sensitivity*) en los endpoints en vivo de BCCR SDDE (`Bccr.Ge.SDDE` vs `Bccr.GE.sddE`, inconsistencia observada en su PDF oficial)? | Ajuste fino de la URL canónica de `cr.bccr.sdde` en modo `--mode live`. | Al obtener token personal de BCCR SDDE (`Mi Perfil -> Generar token`) en Slice 4 / Beta. |
| `OQ-02` | ¿Qué paquete de UI minimalista conviene para `apps/oficios/web` (React + Vite + Tailwind minimalista vs Hono JSX SSR + HTMX)? | Velocidad de implementación de `US-020` sin introducir deuda innecesaria. | Al iniciar Slice 5 (`US-020`). |
| `OQ-03` | ¿Debe `Data Exodus` incluir en Beta un modo opcional con SQLite embebido (para desarrolladores que solo quieren perfilar/reconciliar antes de crear un PostgreSQL)? | Reduce fricción de prueba rápida, pero introduce doble dialecto SQL a mantener. | Post-MVP (Beta Técnica), tras medir feedback de instalación (`QR-NFR-008`). |
| `OQ-04` | ¿Cuándo y cómo se publicará `@dojocoding/hacienda-mock` en npm por parte de DojoCodingLabs (hoy es un paquete privado del workspace `hacienda-cr`)? | Si se publica, `Factura CI` podría reutilizar su servidor HTTP loopback en vez de mantener uno propio (`ADR-010`). | Revisión periódica en Beta Técnica. |
| `OQ-05` | ¿Qué biblioteca/estrategia de compresión de fotos (manteniendo integridad verificable en CAS) es ideal para `OficiOS` en redes móviles lentas? | Tamaño de almacenamiento CAS y velocidad de subida en campo. | Antes de Pilotos Empresariales (Etapa 3). |

---

## 2. Cuestiones de Producto, Legales y Comerciales

| ID | Pregunta abierta | Impacto | Cuándo debe resolverse |
|---|---|---|---|
| `OQ-06` | ¿Qué nombre comercial definitivo adoptará el paquete/producto en npm y Dojo Marketplace (`@quimera/*` está libre en npm)? | Disponibilidad de scope `@quimera` en npm y marca en Costa Rica. | Antes de publicar Beta Técnica en npm. |
| `OQ-07` | ¿Qué dolores concretos dejan sin resolver **TallerApp** y **Astra** en talleres HVAC de 1–5 técnicos en Costa Rica? | Define si `OficiOS` evoluciona a producto SaaS comercial o permanece como app de referencia open source. | Experimento 3 (`validation-plan.md`). |
| `OQ-08` | ¿Cuáles son los requisitos exactos de un abogado especializado en Costa Rica respecto a la interacción entre derecho de supresión (Ley 8968) y obligación tributaria de retención de 5 años en sistemas multi-tenant SaaS? | Políticas legales de términos de servicio y privacidad en producción. | Antes de Pilotos Empresariales pagos (Etapa 3). |
| `OQ-09` | ¿Cuál será el track principal de inscripción formal en Dojo AI Hackathon 2026 dado que los dos tracks oficiales verificados son **AI Apps & Tools** y **AI Operators**? | Enfoque del pitch de 3–5 minutos (se recomienda **AI Apps & Tools** por alineación directa con *Build for Builders*). | Antes de la entrega/pitch del hackathon. |
| `OQ-10` | ¿Se cuenta con acceso comercial autorizado (contrato Pymexpress) para crear un pasaporte verificado de Correos de Costa Rica en el futuro? | Habilita o mantiene indefinidamente en estado `private_contract_required` la ficha de Correos CR. | Post-MVP, solo si un cliente piloto requiere envíos con Correos CR. |
