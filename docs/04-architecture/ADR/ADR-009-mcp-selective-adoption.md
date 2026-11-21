# ADR-009: Uso Selectivo de MCP (Spec 2026-07-28 Stateless/Stdio) y Evaluación de Code Mode

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Requisitos relacionados:** `QR-PASS-001`..`007`, `QR-NFR-006`

## Contexto
QUIMERA atiende a desarrolladores y vibe coders que utilizan asistentes compatibles con MCP (Claude Code, Cursor). Al mismo tiempo, la investigación descubrió que ya existe `jmnzcn/mcp-hacienda-cr` para lectura pública de Hacienda y que Cloudflare publicó la especificación MCP `2026-07-28` (stateless) junto con el patrón experimental *Code Mode*.

## Problema
Decidir qué componentes deben exponer servidores MCP, qué versión del protocolo seguir y si adoptar Cloudflare Code Mode en el MVP.

## Alternativas evaluadas
1. **Exposición selectiva de MCP (`@modelcontextprotocol/sdk`, stdio local por defecto + Streamable HTTP stateless opcional compatible con spec `2026-07-28`)** únicamente en `CR API Passport` (Should) y consultas read-only de `Data Exodus` (post-MVP). CLI + SDK son siempre las interfaces primarias.
2. **Construir todo QUIMERA como un gran servidor MCP monolítico** con todas las operaciones de escritura/migración/facturación.
3. **Adoptar Cloudflare Code Mode (`codeMcpServer` / `openApiMcpServer`)** desde el MVP.

## Criterios de decisión
Seguridad de operaciones destructivas/fiscales, madurez del protocolo, portabilidad offline y diferenciación real frente a `jmnzcn/mcp-hacienda-cr`.

## Evidencia relevante
- La documentación oficial de Cloudflare advierte explícitamente: *«Code Mode is experimental and may have breaking changes. Use caution in production»*, y actualmente requiere Cloudflare Workers + SDK legacy v1 (`createLegacyMcpHandler`).
- La especificación MCP `2026-07-28` elimina sesiones stateful obligatorias (`Mcp-Session-Id`) y simplifica despliegue stateless en HTTP (`Mcp-Method`/`Mcp-Name`).
- `DojoCodingLabs/hacienda-cr` separa deliberadamente su MCP como generador de borradores/lectura, dejando firma y envío en SDK/CLI por seguridad.

## Decisión
1. **SDK TypeScript y CLI (`--json`) son las interfaces primarias** de todos los módulos.
2. **MCP es una interfaz secundaria selectiva y de solo lectura / verificación** en MVP (prioridad *Should* en `CR API Passport`: listar pasaportes, consultar con rate-limit/caché y ejecutar verificación de deriva).
3. **Nunca exponer firma `.p12`, envío fiscal ni auto-resolución de conflictos bloqueantes por MCP sin confirmación explícita humana.**
4. **No adoptar Cloudflare Code Mode en MVP** debido a su estado experimental y acoplamiento a Workers; reevaluar cuando salga de experimental y soporte MCP SDK v2 estable.

## Consecuencias
- **Positivas:** Baja superficie de ataque, operación 100% local en `stdio`, compatibilidad con clientes modernos y diferenciación clara frente a wrappers MCP genéricos.
- **Negativas:** Los agentes que interactúan con `Data Exodus` o `Factura CI` en MVP invocan la CLI (`--json`), lo cual en realidad ya es nativo y auditable en Claude Code/Cursor.

## Riesgos
- **Riesgo:** Duplicar capacidades de `jmnzcn/mcp-hacienda-cr`.
- **Mitigación:** El MCP de `CR API Passport` prioriza **descubrimiento de contratos, verificación de deriva (`verify_passport`), BCCR SDDE y generación de adaptadores**, no solo consultas simples.

## Condiciones de revisión
Reevaluar Code Mode si el catálogo de `CR API Passport` supera 30+ pasaportes de toda LATAM y el tamaño de definiciones de herramientas impacta la ventana de contexto de los agentes.
