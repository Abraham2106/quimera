# @quimera/cr-api-passport

Catálogo ejecutable y verificable de APIs públicas de Costa Rica: manifiestos declarativos YAML, cliente TypeScript con guardrails (Zod, caché TTL, *token bucket* y *circuit breaker*), detector de deriva (*drift*) y servidor MCP `stdio`.

## Pasaportes incluidos

| Passport ID | Proveedor | Auth | Estado |
| --- | --- | --- | --- |
| `cr.hacienda.taxpayer` | Ministerio de Hacienda | Pública | Verificado (fixture + live) |
| `cr.hacienda.cabys` | Ministerio de Hacienda | Pública | Verificado (fixture + live) |
| `cr.hacienda.fx` | Ministerio de Hacienda | Pública | Verificado (fixture + live) |
| `cr.bccr.sdde` | Banco Central de Costa Rica (SDDE) | `Bearer` (`BCCR_SDDE_TOKEN`) | Verificado (fixture + live con token) |
| `cr.snit.geodata` | IGN / SNIT Costa Rica | Pública OGC | Verificado offline |
| `cr.correos.pymexpress` | Correos de Costa Rica | Contrato privado | Declarado sin endpoints inventados |

## Uso desde la CLI

```bash
pnpm quimera -- passport list --json
pnpm quimera -- passport inspect cr.hacienda.cabys --json
pnpm quimera -- passport query cr.hacienda.cabys --operation search --param q=refrigeracion --mode fixture --json
pnpm quimera -- passport verify --all --mode fixture --json
```

Por defecto corre en modo `fixture` (100% offline, sin golpear APIs reales). Para verificación contra los endpoints reales usá `--mode live` respetando las cuotas configuradas.

## Uso como servidor MCP (`stdio`)

Ejecutá el servidor localmente con:

```bash
pnpm exec tsx packages/cr-api-passport/src/mcp-main.ts
```

Configuración para un cliente MCP (por ejemplo Claude Desktop o Cursor):

```json
{
  "mcpServers": {
    "quimera-cr-api-passport": {
      "command": "pnpm",
      "args": ["exec", "tsx", "packages/cr-api-passport/src/mcp-main.ts"],
      "env": {
        "QUIMERA_PASSPORT_MODE": "fixture"
      }
    }
  }
}
```

### Herramientas MCP registradas

| Herramienta | Propósito |
| --- | --- |
| `passport_list` | Lista pasaportes disponibles y sus requisitos de autenticación |
| `passport_inspect` | Inspecciona el manifiesto completo de un pasaporte |
| `passport_query` | Consulta una operación con validación Zod, caché y guardrails |
| `passport_verify` | Ejecuta el detector de deriva de contrato contra fixtures o live |

Todas las respuestas MCP envuelven los datos externos en `{ untrustedExternalData: true, data }` para mitigar *prompt injection*.

Las herramientas MCP solo aceptan `mode: "fixture" | "mock"`. Para forzar `QUIMERA_PASSPORT_MODE=live` en el servidor se requiere además `QUIMERA_PASSPORT_ALLOW_LIVE=1`; sin esa variable el servidor arranca en `fixture`.

## Guardrails del cliente

- HTTP `5xx` (o error de red/timeout) abre el *circuit breaker* del host durante `rateLimit.quimeraGuardrail.circuitBreakerCooldownSec` del manifiesto. Vencido el plazo entra en `half-open`: admite un único trial, que cierra el breaker si tiene éxito y lo reabre si falla.
- Las consultas `live` usan `AbortSignal.timeout` (10 s por defecto, configurable con `fetchTimeoutMs`).
- La clave de caché incluye `passportVersion`, y el esquema de respuesta se revalida en cada *hit*; si el dato cacheado derivó se descarta y se devuelve `ERR_PASSPORT_CONTRACT_DRIFT`.
- `verifyPassport` solo exige credenciales en modo `live`; en `fixture`/`mock` las omite.

## Uso programático

```ts
import { getPassportById, PassportClient } from "@quimera/cr-api-passport";

const passport = await getPassportById("cr.hacienda.cabys");
const client = new PassportClient({ mode: "fixture" });
const result = await client.query(passport!, "search", { q: "refrigeracion" });
```

## Pruebas y documentación

Recorrido rápido: [`examples/03-passport/README.md`](../../examples/03-passport/README.md).  
Diseño completo: [`docs/06-interfaces/api-passport-design.md`](../../docs/06-interfaces/api-passport-design.md) y [`docs/06-interfaces/MCP-design.md`](../../docs/06-interfaces/MCP-design.md).

```bash
pnpm --filter @quimera/cr-api-passport test
```
