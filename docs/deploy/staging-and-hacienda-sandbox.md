# Staging local y sandbox Hacienda

Guía breve para levantar el stack de staging en esta máquina o en un entorno cloud con Docker.

## Requisitos

- Node.js ≥ 22 y `pnpm install` en la raíz del repositorio.
- Docker (opcional) para PostgreSQL 16 y las imágenes de API y worker.

## Base de datos

1. Levante PostgreSQL con el rol de aplicación `quimera` (no superusuario, sin `BYPASSRLS`):

   ```bash
   docker compose -f deploy/compose.staging.yml up -d postgres
   ```

   El script `docker/postgres/init.sql` crea el rol `quimera` y la base `quimera`.

2. Exporte la URL de conexión (mismo valor que en `.env`):

   ```bash
   export DATABASE_URL=postgres://quimera:quimera@127.0.0.1:5432/quimera
   ```

3. Aplique migraciones en orden (falla si el rol es superusuario o tiene `BYPASSRLS`):

   ```bash
   pnpm db:migrate
   ```

## Servicios de aplicación

Con la base lista:

```bash
docker compose -f deploy/compose.staging.yml up -d
```

- **oficios-api** escucha en el puerto `8787` y sirve el bundle estático de `apps/oficios/web/dist` cuando está presente.
- **fiscal-outbox-worker** procesa la outbox fiscal (en staging suele usarse transporte `loopback`).

Variables de producción: copie `.env.example` a `.env` y rellene solo los nombres que use su despliegue (JWT, S3, bóveda, webhooks, OTEL).

## Prueba sandbox Hacienda (opcional)

La suite contra el sandbox real **no se ejecuta por defecto**. Solo corre cuando:

```bash
HACIENDA_SANDBOX_E2E=1 pnpm test:hacienda-sandbox
```

Sin `HACIENDA_SANDBOX_E2E=1`, el script termina con código 0 y mensaje `skipped`. Configure credenciales y red solo en el entorno donde autorice pruebas contra Hacienda.