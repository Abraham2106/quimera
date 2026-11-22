# Adaptadores productivos y verificación de staging local/cloud

## Why

Las cuatro oleadas del SaaS B2B cerraron contratos de comportamiento (onboarding, migración, fiscal en vivo, cobro y observabilidad), pero el runtime de staging sigue apoyado en singletons locales (memoria en disco, secretos en claro, worker fiscal sin transporte seleccionable por entorno). Un despliegue verificable de pies a cabeza exige adaptadores productivos seleccionables por variables de entorno, pruebas loopback sin llamadas a AWS/KMS/Hacienda reales y un único change OpenSpec que amarre el objetivo de staging.

## What changes

Definir la capacidad `saas-production-adapters` para: almacén de artefactos por entorno (`memory`, `fs`, `s3` con SigV4), integridad/retención/cuarentena S3 en loopback, bóveda KMS o local con ciphertext por tenant y promoción de certificados sin filtrar secretos, worker fiscal con `HaciendaSdkTransport` o loopback y apagado `SIGTERM`, JWKS RS256/ES256 y anti-replay HMAC en webhooks, servicio de `dist` web estático y rechazo de migraciones con rol superusuario o `BYPASSRLS`.

## Impact

- Paquetes y apps afectados: `@quimera/data-exodus` (cliente HTTP S3 y factoría), `apps/oficios` (factoría `OFICIOS_ARTIFACT_STORE`), worker fiscal, autenticación JWKS, empaquetado web y scripts `db:migrate`.
- Mantiene `pnpm verify` 100 % offline y determinista sin credenciales cloud reales.

## Fuera de alcance

- Aprovisionamiento cloud gestionado (Terraform/Pulumi) y elección comercial de proveedor.
- Certificación fiscal oficial ante el Ministerio de Hacienda (sigue operando solo loopback en CI).