# ADR-012: Aislamiento Estricto de Clairic como Adaptador Opcional

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-CORE-004`, `QR-CLAI-001`..`004`, `QR-SEC-004`

## Contexto
Clairic (`@cf/cloudflare/clairic` / `clairic-flash`) es un modelo System One de extracción estructurada tipada (27B basado en Qwen3.8-27B, open-weight Apache 2.0 en Hugging Face y hospedado en preview en Cloudflare Workers AI) que devuelve valores tipados, `confidence`, `p_null` y character spans.

## Problema
Aprovechar el potencial de Clairic para extracción futura desde texto libre, fotos de diagnósticos o PDFs sin comprometer el principio fundamental de QUIMERA: operar sin IA, sin GPU y sin dependencia de servicios preview externos.

## Alternativas evaluadas
1. **Definir el puerto `StructuredExtractorPort` en `@quimera/core` y aislar la integración en el paquete opcional `@quimera/adapter-clairic`**, con inyección explícita en tiempo de composición y validación/compuerta humana obligatoria.
2. **Integrar llamadas directas a Cloudflare Workers AI dentro de `Data Exodus` y `OficiOS`.**
3. **Embeber inferencia local PyTorch de Clairic dentro del monorepo.**

## Criterios de decisión
Continuidad operativa sin IA/GPU, mitigación de términos preview sin SLA de Workers AI, seguridad frente a prompt injection y retención de privacidad.

## Evidencia relevante
- Los términos oficiales de `@cf/cloudflare/clairic` en Workers AI establecen explícitamente estado **preview «AS IS / AS AVAILABLE» sin garantía de continuidad ni SLA** (y precio promo hasta 2026-12-01, luego $0.24/M tokens input).
- La ejecución local open-weight requiere Python 3.11+, PyTorch, `xgrammar` y **GPU CUDA** para el modelo 27B.
- Clairic devuelve `confidence`, `p_null` y spans, pero su documentación advierte explícitamente que puede equivocarse y las probabilidades deben validarse contra umbrales propios de la aplicación.

## Decisión
1. `@quimera/core` define únicamente la interfaz `StructuredExtractorPort`.
2. `@quimera/adapter-clairic` es un paquete opcional **nunca listado en `dependencies`** de ningún paquete del núcleo ni de `OficiOS`.
3. Cualquier dato extraído vía Clairic entra marcado `origin_kind = AI_EXTRACTION` con `confidence`, `p_null` y spans; si `confidence < 0.90`, `p_null > 0.15`, `complete === false` o afecta campos fiscales/monetarios, genera obligatoriamente un `Conflict` para revisión humana.
4. En MVP, el baseline ejecuta 100% sin `@quimera/adapter-clairic` instalado.

## Consecuencias
- **Positivas:** Cero lock-in a Cloudflare Workers AI, cero necesidad de GPU, tolerancia total a cambios de precios o retirada del preview y protección contra alucinaciones o prompt injection en campos críticos.
- **Negativas:** Extracción automática de PDFs no estructurados o fotos queda diferida a quien habilite opcionalmente el adaptador post-MVP.

## Riesgos
- **Riesgo:** Que futuros contribuidores asuman que el extractor siempre está presente.
- **Mitigación:** Prueba obligatoria en CI (`T-CLAI-001`) que ejecuta toda la suite sin `@quimera/adapter-clairic` en `node_modules`.

## Condiciones de revisión
Si un cliente piloto exige extracción masiva de PDFs/fotos con presupuesto para GPU local o cuando Clairic alcance disponibilidad GA con SLA contractual, habilitar la implementación live de `@quimera/adapter-clairic` manteniendo intacta la compuerta humana.
