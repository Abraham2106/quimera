# Privacidad, Protección de Datos y Cumplimiento Normativo — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto (análisis técnico preliminar; **no constituye asesoría legal formal**)
- **Referencias:** [Requisitos de Seguridad](./security-requirements.md) | [Procedencia de Datos](../05-data/data-provenance.md)

---

## 1. Marco Normativo Relevante en Costa Rica

> **Descargo técnico:** Las consideraciones siguientes traducen requerimientos normativos públicos conocidos en controles técnicos de arquitectura. Antes de comercializar producción con PYMEs, deben validarse con asesoría legal especializada en Costa Rica.

1. **Ley N.º 8968 (Protección de la Persona frente al Tratamiento de sus Datos Personales — PRODHAB):**
   - Exige consentimiento informado, finalidad determinada, exactitud, confidencialidad y derechos de acceso, rectificación y supresión para datos de personas físicas.
   - Distingue entre datos de acceso irrestricto (fuentes públicas), acceso restringido (datos comerciales/contacto) y datos sensibles (salud, biométricos, etc., **fuera de alcance** de QUIMERA).
2. **Obligación Tributaria de Conservación (Ministerio de Hacienda — FE v4.4):**
   - Los contribuyentes deben conservar los comprobantes electrónicos (XML firmados y `MensajeHacienda` de respuesta) durante al menos **5 años** (plazo que puede extenderse en casos de prescripción ampliada o fiscalización abierta).

---

## 2. Clasificación de Datos en QUIMERA

| Nivel | Ejemplos en QUIMERA | Almacenamiento | Cifrado / Protección | Política de Retención |
|---|---|---|---|---|
| **Público** | Catálogo CAByS, tipos de cambio oficiales, esquemas JSON, pasaportes de API | PostgreSQL / Repositorio / Caché local | Integridad (`SHA-256`) | Indefinida / TTL caché |
| **Interno / Operativo** | Especificaciones de equipos HVAC, estados de órdenes, métricas de pipeline, hashes de artefactos | PostgreSQL (aislado por `tenant_id`) | TLS en tránsito + cifrado de disco gestionado | Duración del contrato del tenant |
| **Confidencial / PII Restringida** | Nombres de personas físicas, cédulas físicas, teléfonos, correos, direcciones de domicilio, saldos de clientes | PostgreSQL (RLS) + CAS (archivos fuente) | TLS + redacción obligatoria en logs + control RBAC | Según finalidad del negocio; sujeto a rectificación/seudonimización |
| **Crítico Fiscal y Secretos** | XML fiscales emitidos/recibidos, acuses de Hacienda, tokens BCCR SDDE, PIN y archivos `.p12` | `fob_*` + CAS WORM (XML); Secret Manager/KMS (credenciales y `.p12`) | Envelope encryption (KMS) para secretos; cero envío a LLMs externos | **XML fiscales ≥ 5 años** (obligatorio); secretos rotables y revocables |

---

## 3. Privacidad por Diseño en Cada Módulo

### 3.1. `Data Exodus`
- **Procesamiento 100% local posible:** Una empresa o consultor puede migrar toda su historia en su propio servidor/laptop sin subir un solo byte a terceros.
- **Sin fuga a modelos de IA:** El baseline nunca envía registros a proveedores externos de IA. Si el usuario habilita explícitamente `@quimera/adapter-clairic`:
  - Requiere consentimiento explícito en configuración (`allowExternalAiInference: true`).
  - Se documenta que Cloudflare Workers AI declara *Zero Data Retention* para Clairic, pero en modo regulado se recomienda inferencia local open-weight (Apache 2.0) o desactivar el adaptador.
  - Se minimiza el payload enviado (solo los campos no estructurados necesarios, nunca cédulas ni archivos `.p12`).

### 3.2. `CR API Passport`
- Cada manifiesto de pasaporte declara explícitamente `privacy.containsPersonalData` y `privacy.logRedactionFields`.
- Las consultas a `/fe/ae` (contribuyentes) son de acceso público institucional pero contienen nombre y cédula: se prohíbe registrar el cuerpo completo de la respuesta en logs de aplicación (`DEBUG` redactado).

### 3.3. `OficiOS` y Evidencia Fotográfica
- Las fotografías técnicas de equipos HVAC deben orientarse al equipo e instalación, evitando capturar personas o documentos de identidad innecesarios.
- Los metadatos EXIF GPS opcionales se eliminan al almacenar la foto en el CAS salvo que el contrato del oficio requiera ubicación verificada explícitamente autorizada.

### 3.4. Tensión Legal: Derecho de Supresión (Ley 8968) vs Conservación Fiscal (5 años)
- Si una persona física solicita supresión de sus datos de contacto comerciales en `OficiOS`, el sistema seudonimiza los campos no tributarios (`phone`, `email`, `address` en `ofi_customers` y vistas operativas) registrando una `ResolutionDecision` de supresión.
- Los XML fiscales legalmente emitidos en `qum_artifacts` / `fob_fiscal_documents` **no se destruyen antes del plazo legal tributario**, manteniéndose restringidos únicamente para auditoría fiscal y bloqueados de uso comercial o marketing.
