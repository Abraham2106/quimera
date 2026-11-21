# Diseño de Integración MCP (Model Context Protocol) — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto (Selectivo — Should en MVP)
- **Referencias:** [ADR-009](../04-architecture/ADR/ADR-009-mcp-selective-adoption.md) | [Diseño CR API Passport](./api-passport-design.md)

---

## 1. Alcance y Fronteras de Seguridad MCP

Conforme a `ADR-009`, MCP en QUIMERA es una **interfaz complementaria de solo lectura y verificación**, nunca el canal para operaciones destructivas ni fiscales con efectos legales:

| Capacidad | Expuesta vía MCP | Justificación |
|---|---|---|
| Listar pasaportes de APIs CR y sus restricciones (`list_passports`, `get_passport`) | **Sí (MVP — Should)** | Permite a Claude Code / Cursor descubrir endpoints reales, límites y autenticación sin alucinar. |
| Consultar datos públicos con guardrails (`query_passport`) | **Sí (MVP — Should)** | Protege contra bans de IP y entrega respuestas validadas con Zod. |
| Verificar deriva de contrato (`verify_passport`) | **Sí (MVP — Should)** | Diferenciador directo frente a `jmnzcn/mcp-hacienda-cr`. |
| Consultar trazabilidad / conflictos abiertos de `Data Exodus` (`trace_entity`, `list_conflicts`) | **Post-MVP (solo lectura)** | Facilita diagnóstico desde el editor sin otorgar permisos de mutación. |
| Resolver conflictos (`MERGE`, `OVERRIDE_FIELD`) o lanzar `migrate` | **Prohibido vía MCP autónomo** | Exige decisión humana explícita auditada (`actor_type = HUMAN`) desde CLI/UI. |
| Firmar XML (`.p12`) o emitir comprobantes fiscales en `Fiscal Outbox` | **Prohibido vía MCP** | Misma postura de seguridad que `DojoCodingLabs/hacienda-cr`: llaves privadas jamás accesibles desde un agente LLM. |

---

## 2. Arquitectura de Transporte y Compatibilidad con Spec `2026-07-28`

1. **Transporte primario (local / IDE):** `stdio` mediante `@modelcontextprotocol/sdk`, iniciado bajo demanda por el cliente MCP (Claude Code, Cursor, VS Code) con configuración en `mcp.json`.
2. **Transporte secundario (remoto opcional en Beta Técnica / Cloudflare Workers):** Streamable HTTP **stateless** alineado con la especificación MCP `2026-07-28`:
   - Sin dependencia de `Mcp-Session-Id` stateful.
   - Enrutamiento declarativo compatible con cabeceras `Mcp-Method` y `Mcp-Name`.
   - Cero almacenamiento de credenciales del usuario en el servidor remoto (los tokens privados como `BCCR_SDDE_TOKEN` se mantienen locales en entorno `stdio`).
3. **Evaluación de Cloudflare Code Mode:** Excluido en MVP (`ADR-009`) por encontrarse en fase experimental sobre SDK v1 legacy.

---

## 3. Catálogo de Herramientas MCP (`@quimera/cr-api-passport`)

| Tool Name | Entradas (JSON Schema) | Salida | Efectos secundarios |
|---|---|---|---|
| `passport_list` | `{ provider?: string, authType?: 'public' \| 'bearer' \| 'private' }` | Lista de pasaportes (`id`, `version`, `status`, `authType`, `lastVerifiedAt`) | Ninguno (solo lectura) |
| `passport_inspect` | `{ passportId: string }` | Manifiesto completo: endpoints, rate limits, esquema de respuesta, errores conocidos y ejemplo de uso | Ninguno (solo lectura) |
| `passport_query` | `{ passportId: string, operation: string, params: Record<string, string>, mode?: 'mock' \| 'live' }` | Respuesta validada + metadatos de caché, cuota restante y advertencias | Lectura HTTP con rate-limit y caché |
| `passport_verify` | `{ passportId: string, mode?: 'mock' \| 'live' }` | `DriftReport` con estado (`PASS`, `DRIFT_DETECTED`, `SKIPPED_MISSING_CREDENTIALS`) y diffs por campo | Lectura HTTP acotada |

---

## 4. Ejemplo de Configuración Cliente (`mcp.json`)

```json
{
  "mcpServers": {
    "quimera-cr-api-passport": {
      "command": "npx",
      "args": ["-y", "@quimera/cr-api-passport", "mcp"],
      "env": {
        "QUIMERA_PASSPORT_MODE": "live",
        "QUIMERA_CACHE_DIR": "~/.cache/quimera/passports"
      }
    }
  }
}
```

## 5. Protección contra Prompt Injection vía Respuestas Externas

Toda respuesta proveniente de una API externa (`api.hacienda.go.cr` o BCCR) que se devuelve a un cliente MCP incluye:
1. Validación estricta contra el esquema Zod del pasaporte (descartando campos inesperados arbitrarios).
2. Límites de longitud en cadenas de texto libre (`maxLength`).
3. Envoltorio de metadatos indicando explícitamente `"untrustedExternalData": true` para que agentes integrados nunca ejecuten instrucciones encontradas dentro de razones sociales o descripciones CAByS.
