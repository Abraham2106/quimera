<p align="center">
  <a href="https://github.com/Abraham2106/quimera">
    <img src="docs/assets/quimera-banner.svg" alt="QUIMERA — Infraestructura abierta local-first para Costa Rica: Data Exodus, Pipeline, CR API Passport, Fiscal Outbox, Factura CI y OficiOS." width="100%" />
  </a>
</p>

# QUIMERA

**Datos heredados con procedencia, APIs verificables de Costa Rica, pruebas fiscales y operación local-first — desde tu código, tu terminal o tu asistente de IA.**

Toolkit modular open-source en TypeScript y PostgreSQL 16 diseñado para el ecosistema empresarial costarricense: migración conservadora con trazabilidad, pasaportes ejecutables de APIs públicas (Hacienda, BCCR SDDE, SNIT), outbox fiscal transaccional, suite conductual `Factura CI` y aplicación de referencia para talleres (`OficiOS`), **sin depender de IA ni GPU en el baseline**.

[![CI](https://github.com/Abraham2106/quimera/actions/workflows/ci.yml/badge.svg)](https://github.com/Abraham2106/quimera/actions/workflows/ci.yml)
[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-FF7151?labelColor=201E3D)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-201E3D)](https://nodejs.org)
[![pnpm 10.33.4](https://img.shields.io/badge/pnpm-10.33.4-201E3D)](https://pnpm.io)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-201E3D)](https://www.postgresql.org)

[Casos de uso](#qué-podés-construir) · [Herramientas](#elegí-tu-herramienta) · [Empezar](#empezá-acá) · [Documentación](#documentación) · [Contribuir](#desarrollo-y-contribuciones) · [Reportar un problema](https://github.com/Abraham2106/quimera/issues/new)

## La visión: infraestructura abierta para el salto digital de las PYMEs

**Que pasar de hojas de Excel, XML sueltos y sistemas heredados a software moderno y resiliente no cueste perder la historia del negocio ni romper la facturación.**

Muchas PYMEs en Costa Rica ya quieren modernizarse, pero se topan con cuatro paredes: datos históricos sucios sin trazabilidad, APIs públicas que cambian o bloquean IPs sin aviso, integraciones de facturación electrónica frágiles bajo concurrencia o cortes de red, y software operativo que no refleja el trabajo real en campo.

QUIMERA aporta bloques modulares independientes con licencia MIT: podés adoptar un solo paquete (como `Factura CI` o `CR API Passport`) o encadenar el flujo completo sobre PostgreSQL 16. Todo corre de forma determinista y verificable en local antes de tocar un ambiente real.

## Qué podés construir

### 1. Una migración sin pérdida silenciosa desde Excel y XML FE 4.4

**Para equipos e implementadores que rescatan datos históricos de una PYME.** Perfilá archivos heterogéneos (`CSV`, `XLSX`, `XML FE 4.4`, `JSON`, `SQLite`), generá un `mapping.yaml` determinista con umbrales de confianza (`NEEDS_REVIEW`) y detectá clientes duplicados, facturas repetidas, pagos mal atribuidos e identidades en conflicto antes de cargar una sola fila.

**Valor para tu cliente:** cero datos sobrescritos en silencio y trazabilidad permanente (`qum_*`) hasta el archivo y la fila original. Usá **`@quimera/data-exodus`**.

### 2. Un pipeline declarativo con compuerta humana y reanudación exacta

**Para flujos donde una máquina no debe adivinar decisiones financieras.** Definí el grafo en YAML (`pipelines/exodus-to-oficios.yaml`), ejecutalo con checkpoints en PostgreSQL y dejá que el proceso se detenga explícitamente con código de salida `3` hasta que una persona apruebe las decisiones (`decisions-demo.yaml`).

**Valor para tu operación:** idempotencia verificada por SHA-256 y reanudación desde el último checkpoint sin reprocesar desde cero. Usá **`@quimera/pipeline`**.

### 3. Integración segura con APIs públicas de Costa Rica

**Para backends y productos que consultan Hacienda, BCCR SDDE o SNIT.** Cada API se declara en un manifiesto verificable (`ApiPassport`) con validación Zod en runtime, caché TTL, *token bucket* compartido por host y *circuit breaker* para evitar el bloqueo IP de 10 minutos de `api.hacienda.go.cr`.

**Valor para tu equipo:** detectar deriva (*drift*) cuando una institución cambia un contrato, sin depender de wrappers frágiles ni documentación desactualizada. Usá **`@quimera/cr-api-passport`**.

### 4. Un POS o ERP blindado contra fallos fiscales en producción

**Para desarrolladores que integran facturación electrónica (por ejemplo con `@dojocoding/hacienda-sdk`).** Delegá consecutivos atómicos, idempotencia por intento (`FiscalIntent`) y recuperación de timeouts a PostgreSQL, y someté tu sistema a 25 escenarios conductuales reproducibles contra un simulador local en loopback.

**Valor para el comercio:** descubrir colisiones de consecutivos (`FC-017`) y duplicación tras cortes de red (`FC-031`) en CI antes de emitir una sola factura real. Usá **`@quimera/fiscal-outbox`** y **`@quimera/factura-ci`**.

### 5. Un taller técnico local-first con reglas duras de negocio

**Para talleres de servicios (empezando por HVAC / refrigeración).** Operá el ciclo completo recepción → diagnóstico con búsqueda CAByS → presupuesto → bloqueo HTTP `409` sin aprobación → intervención → verificación → cierre con un único `FiscalIntent`, conservando la procedencia de cada cliente y equipo migrado.

**Valor para el taller:** control estricto de aprobaciones y cierre limpio hacia facturación sin depender de conectividad permanente. Revisá **`@quimera/oficios`**.

### 6. Un asistente de IA conectado con guardrails vía MCP

**Para equipos que usan clientes MCP (Claude Desktop, Cursor) o agentes de desarrollo.** Exponé los pasaportes de APIs costarricenses por transporte `stdio` con envoltura de datos externos no confiables (`untrustedExternalData: true`), y mantené cualquier extracción asistida por IA completamente aislada y desactivada en el baseline.

**Valor para tu arquitectura:** ergonomía para agentes de IA sin comprometer el determinismo ni la seguridad del núcleo. Usá el **servidor MCP de `@quimera/cr-api-passport`** (y opcionalmente **`@quimera/adapter-clairic`**).

**Elegí un módulo y probalo offline:** los ejemplos de abajo corren 100% en local contra PostgreSQL 16 y fixtures sintéticos, sin credenciales externas.

## Elegí tu herramienta

| Paquete / App | Para qué usarlo | Documentación |
| --- | --- | --- |
| `@quimera/core` | Contratos Zod, aritmética monetaria exacta, normalización de cédulas CR y hashing canónico. | [Core](packages/core/README.md) |
| `@quimera/data-exodus` | Perfilado, `mapping.yaml`, importadores, reconciliación conservadora, lotes reanudables y procedencia. | [Data Exodus](packages/data-exodus/README.md) |
| `@quimera/pipeline` | Motor DAG en YAML con checkpoints en PostgreSQL, pausa en código `3` y `resume`. | [Pipeline](packages/pipeline/README.md) |
| `@quimera/cr-api-passport` | Catálogo verificable de APIs CR, cliente con guardrails, detector de deriva y servidor MCP `stdio`. | [Passport](packages/cr-api-passport/README.md) |
| `@quimera/fiscal-outbox` | Outbox transaccional en PostgreSQL con consecutivos atómicos y worker recuperable. | [Fiscal Outbox](packages/fiscal-outbox/README.md) |
| `@quimera/factura-ci` | Simulador local de Hacienda en `127.0.0.1` y suite conductual de 25 escenarios (`FC-001`..`FC-031`). | [Factura CI](packages/factura-ci/README.md) |
| `@quimera/oficios` | App de referencia para talleres HVAC (API Hono + PostgreSQL + UI React/Vite en español). | [OficiOS](apps/oficios/README.md) |
| `@quimera/demo-pos` | Contraste reproducible entre POS vulnerable (`buggy`) y POS con outbox sobre `@dojocoding/hacienda-sdk`. | [Demo POS](apps/demo-pos/README.md) |
| `@quimera/adapter-clairic` | Stub determinista opcional de extracción IA, aislado del núcleo (`QUIMERA_AI_ENABLED=false`). | [Adapter Clairic](packages/adapter-clairic/README.md) |

Cada paquete de `@quimera/*` se empaqueta de forma independiente (`pnpm test:isolation`) sin depender de `@quimera/oficios` ni de `@quimera/adapter-clairic`.

## Empezá acá

Necesitás **Node.js 22+**, **pnpm 10.33.4** y **PostgreSQL 16** (vía Docker o instalado localmente con rol no superusuario `quimera`).

### Arranque rápido offline y verificación completa

```bash
git clone https://github.com/Abraham2106/quimera.git
cd quimera
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate

# Ejecuta toda la compuerta offline: typecheck, lint, test, security, isolation y demo:verify
pnpm verify
```

### Paquetes: desde tu aplicación TypeScript

Consultá un pasaporte de API costarricense con validación en runtime, caché y verificación de contrato en modo `fixture` (offline) o `live`:

```ts
import {
  getPassportById,
  PassportClient,
  verifyPassport,
} from "@quimera/cr-api-passport";

const passport = await getPassportById("cr.hacienda.cabys");
if (!passport) throw new Error("Pasaporte no encontrado");

const client = new PassportClient({ mode: "fixture" });

const search = await client.query(passport, "search", { q: "refrigeracion" });
console.log(search);

const driftReport = await verifyPassport(passport, { client });
console.log(driftReport.status);
```

### CLI: desde tu terminal (`pnpm quimera`)

Los logs estructurados van exclusivamente a `stderr`; con `--json`, `stdout` contiene únicamente el resultado JSON del negocio:

```bash
# 1. Ejecutar el pipeline de rescate (sale con código 3 mientras decisions-demo.yaml está en DRAFT)
pnpm quimera -- pipeline run pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json

# 2. Aprobar las decisiones humanas y reanudar la carga con procedencia en PostgreSQL
pnpm quimera -- exodus decisions apply --file decisions-demo.yaml --json
pnpm quimera -- pipeline resume --run <run_id> --manifest pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json

# 3. Verificar todos los pasaportes de APIs CR en modo fixture
pnpm quimera -- passport verify --all --mode fixture --json

# 4. Contrastar un POS vulnerable (exit 1) vs uno respaldado por Fiscal Outbox (exit 0, 25/25)
pnpm quimera -- factura-ci run --target fixture:buggy --format json
pnpm quimera -- factura-ci run --target fixture:compliant --format json
```

### MCP: desde tu asistente de IA

Agregá el servidor MCP de `@quimera/cr-api-passport` (transporte `stdio`) a tu cliente MCP (por ejemplo Claude Desktop o Cursor):

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

Herramientas registradas: `passport_list`, `passport_inspect`, `passport_query` y `passport_verify`. Consultá [configuración y detalles del servidor MCP](packages/cr-api-passport/README.md#uso-como-servidor-mcp-stdio).

### App de referencia: OficiOS en local

```bash
# Terminal 1: API Hono en http://127.0.0.1:8787
DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera pnpm oficios:serve

# Terminal 2: UI React/Vite en http://127.0.0.1:5173 (proxya /api al puerto 8787)
pnpm --filter @quimera/oficios dev:web
```

## Módulos, pasaportes y escenarios soportados

### Pasaportes de APIs de Costa Rica (`@quimera/cr-api-passport`)

| Passport ID | Proveedor | Autenticación | Modo por defecto |
| --- | --- | --- | --- |
| `cr.hacienda.taxpayer` | Ministerio de Hacienda (`/fe/ae`) | Pública | `fixture` (soporta `live`) |
| `cr.hacienda.cabys` | Ministerio de Hacienda (`/fe/cabys`) | Pública | `fixture` (soporta `live`) |
| `cr.hacienda.fx` | Ministerio de Hacienda (`/indicadores/tc/*`) | Pública | `fixture` (soporta `live`) |
| `cr.bccr.sdde` | BCCR SDDE (REST post-SOAP 2026) | `Bearer` (`BCCR_SDDE_TOKEN`) | `fixture` (soporta `live`) |
| `cr.snit.geodata` | IGN / SNIT Costa Rica | Pública OGC | `fixture` offline |
| `cr.correos.pymexpress` | Correos de Costa Rica | Contrato privado | Declarado sin endpoints inventados |

### Suites de pruebas fiscales (`@quimera/factura-ci`)

| Suite | Escenarios | Qué valida |
| --- | --- | --- |
| `concurrency` | Incl. `FC-017` | Colisiones de consecutivos y envío paralelo de comprobantes |
| `recovery` | Incl. `FC-031` | Cortes de red, timeouts post-envío y consulta antes de reintentar |
| `isolation` | Multi-emisor | Separación estricta de secuencias y estados entre empresas |
| `states` | Transiciones | Manejo de `procesando`, `aceptado`, `rechazado`, `429` y `5xx` |
| `xml` | Estructura | Validación estructural de comprobantes antes del envío |
| `all` | 25 escenarios (`FC-001`..`FC-024`, `FC-031`) | Suite conductual completa en loopback (`127.0.0.1`) |

## Documentación

- [Contratos OpenSpec](openspec/README.md) y [Backfill](openspec/BACKFILL.md): specs de comportamiento vigente (`openspec/specs/`) y cambios activos hacia producción (`openspec/changes/`).
- [Índice maestro de ingeniería](docs/README.md): mapa completo de las 12 fases documentales.
- [Arquitectura de software](docs/04-architecture/software-architecture.md) y [15 ADRs](docs/DECISIONS.md): fronteras de módulos, dependencias y decisiones.
- [Diseño de CR API Passport](docs/06-interfaces/api-passport-design.md) y [Diseño MCP](docs/06-interfaces/MCP-design.md): manifiestos, cuotas de Hacienda/BCCR y seguridad para agentes.
- [Modelo de reconciliación](docs/05-data/reconciliation-model.md) y [Procedencia de datos](docs/05-data/data-provenance.md): cómo Data Exodus detecta anomalías sin perder trazabilidad.
- [Escenarios de fallo fiscal](docs/08-quality/failure-scenarios.md): frontera entre `@dojocoding/hacienda-sdk`, `@quimera/fiscal-outbox` y `@quimera/factura-ci`.
- [Flujos de OficiOS](docs/10-experience/oficios-user-flows.md) y [Especificación de interfaces](docs/10-experience/interface-specifications.md): máquina de estados, bloqueo `409` y UI en español.
- [Modelo de amenazas (STRIDE)](docs/07-security/threat-model.md) y [Política de seguridad](SECURITY.md).
- [Estado de implementación](docs/IMPLEMENTATION_STATUS.md) y [Plan del MVP](docs/11-implementation/MVP-plan.md).
- Recorridos mínimos ejecutables: [01 Exodus Profile](examples/01-exodus-profile/README.md) · [02 Pipeline](examples/02-pipeline/README.md) · [03 Passport](examples/03-passport/README.md) · [04 Factura CI](examples/04-factura-ci/README.md).

### Límites operativos y verificación honesta

**Pasar `Factura CI` no es aceptación fiscal.** `@quimera/factura-ci` ejecuta pruebas conductuales sintéticas contra un simulador determinista en `127.0.0.1` y rechaza cualquier URL que no sea loopback (`ERR_SEC_LOOPBACK_ONLY`). Aprobar `25/25` verifica resiliencia de software, no certificación ni aceptación del Ministerio de Hacienda.

**Alcance MVP vs producción real:**
- **Emisión real:** el MVP no administra certificados `.p12`, KMS ni envíos a staging/producción de Hacienda.
- **Identidad en `OficiOS`:** el servidor HTTP local acepta cabeceras de prueba (`x-tenant-id`, `x-test-role`, `x-actor-id`) únicamente en `127.0.0.1`; requiere OIDC/JWT/MFA antes de exposición externa.
- **Row-Level Security:** las tablas `qum_*` aplican `ENABLE` y `FORCE ROW LEVEL SECURITY` verificadas en CI con rol `NOSUPERUSER NOBYPASSRLS`; las tablas `ofi_*` filtran por `tenant_id` en aplicación y requieren políticas RLS dedicadas para producción multi-tenant.
- **IA opcional:** `@quimera/adapter-clairic` es un stub determinista desactivado por defecto (`QUIMERA_AI_ENABLED=false`) y aislado del núcleo.

### Variables de entorno y configuración

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://quimera:quimera@127.0.0.1:5432/quimera` | Conexión a PostgreSQL 16 (rol no superusuario `quimera`). |
| `QUIMERA_AI_ENABLED` | `false` | Habilita o deshabilita el adaptador opcional de IA (`adapter-clairic`). |
| `QUIMERA_PASSPORT_MODE` | `fixture` | Modo de consulta de `@quimera/cr-api-passport` (`fixture`, `mock` o `live`). |
| `OFICIOS_HOST` / `OFICIOS_PORT` | `127.0.0.1` / `8787` | Dirección y puerto del servidor HTTP de `OficiOS`. |
| `BCCR_SDDE_TOKEN` | _(vacío)_ | Token Bearer opcional solo si se consulta `cr.bccr.sdde` en modo `live`. |
| `QUIMERA_WHATSAPP_ENABLED` | `false` | Desactivado por defecto; notificaciones opcionales de `OficiOS`. |

`.env.example` documenta la configuración local base. Nunca commitees `.env`, certificados `.p12`, PINs ni tokens.

## Desarrollo y contribuciones

Para desarrollar en este repositorio, usá **Node.js 22+** y la versión de `pnpm` declarada en `package.json` (`pnpm@10.33.4`).

```bash
git clone https://github.com/Abraham2106/quimera.git
cd quimera
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm verify
```

```text
packages/
  core/             Contratos compartidos, dinero exacto, hashing y cédulas CR
  data-exodus/      Perfilado, importadores, reconciliación, decisiones y procedencia
  pipeline/         Motor DAG YAML con checkpoints, compuerta humana (exit 3) y resume
  cr-api-passport/  Manifiestos de APIs CR, cliente con guardrails, drift y MCP stdio
  fiscal-outbox/    Outbox fiscal en PostgreSQL con consecutivos atómicos y worker
  factura-ci/       Simulador local de Hacienda (127.0.0.1) y 25 escenarios conductuales
  adapter-clairic/  Stub opcional de extracción IA, aislado del núcleo
apps/
  oficios/          App de referencia para talleres HVAC (API Hono + UI React/Vite)
  demo-pos/         Contraste POS vulnerable vs Fiscal Outbox con @dojocoding/hacienda-sdk
pipelines/          Manifiestos ejecutables (exodus-to-oficios.yaml)
fixtures/           Datasets sintéticos deterministas (demo-hvac-1000)
examples/           Cuatro recorridos mínimos ejecutables
scripts/            CLI unificada (quimera.mjs), migraciones, verify, isolation y demo:verify
openspec/           Specs de comportamiento vigente y cambios activos (OpenSpec)
docs/               Arquitectura, 15 ADRs, contratos, seguridad, pruebas y assets
```

Para trabajar en un solo paquete:

```bash
pnpm --filter @quimera/cr-api-passport test
pnpm --filter @quimera/data-exodus test
pnpm test:isolation
pnpm audit --audit-level=high
```

Guías para contribuidores y agentes: [`CONTRIBUTING.md`](CONTRIBUTING.md), [`AGENTS.md`](AGENTS.md) y [`SECURITY.md`](SECURITY.md). Usamos Changesets para versionar los paquetes.

## Agradecimientos

Gracias a [Dojo Coding Labs](https://github.com/DojoCodingLabs) y especialmente a [`DojoCodingLabs/hacienda-cr`](https://github.com/DojoCodingLabs/hacienda-cr) (`@dojocoding/hacienda-sdk`), cuya arquitectura, documentación de integración en producción y rigor técnico inspiraron el diseño del repositorio, el outbox fiscal y la suite `Factura CI` para la comunidad de desarrolladores de Costa Rica.

## Licencia

[MIT](LICENSE).
