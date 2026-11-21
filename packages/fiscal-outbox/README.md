# @quimera/fiscal-outbox

Outbox transaccional en PostgreSQL 16 para emisión fiscal resiliente: asignación atómica de consecutivos por emisor/sucursal/terminal/ambiente, idempotencia por intento (`FiscalIntent`) y worker de entrega basado en *leases* recuperables.

## Qué resuelve

Complementa bibliotecas de firma/XML como `@dojocoding/hacienda-sdk` cubriendo las responsabilidades operativas de backend documentadas en producción:

- **Consecutivos atómicos en PostgreSQL:** evita colisiones bajo concurrencia (`allocateConsecutive`).
- **Idempotencia por negocio:** `enqueueIntent` garantiza que un mismo evento comercial genere un único `FiscalIntent`.
- **Recuperación tras caída o timeout:** `claimNextDocument`, `processOnce` y `releaseDocumentLease` consultan estados inciertos antes de reintentar envíos para evitar duplicación de claves.

## Exports principales

| Export | Tipo | Descripción |
| --- | --- | --- |
| `applyFobMigration`, `createPostgresClient`, `resolveDatabaseUrl` | Funciones | Gestión de conexión y migraciones del esquema `fob_*` |
| `PgDocumentStore`, `enqueueIntent`, `allocateConsecutive` | Clase / Funciones | Almacén durable de intenciones fiscales y asignación atómica de consecutivos |
| `processOnce`, `claimNextDocument`, `releaseDocumentLease`, `isPostDispatched` | Funciones | Worker de entrega con *leases* e inspección de estados ambiguos |

## Pruebas

```bash
pnpm --filter @quimera/fiscal-outbox test
```

Ver también [`packages/factura-ci/README.md`](../factura-ci/README.md) y [`apps/demo-pos/README.md`](../../apps/demo-pos/README.md).
