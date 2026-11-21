# Emisión fiscal real en sandbox y producción de Hacienda con bóveda KMS de certificados .p12

## Why

El MVP actual prueba resiliencia fiscal únicamente contra el simulador local de `@quimera/factura-ci` en `127.0.0.1` y no emite comprobantes reales. Para que un taller o comercio opere en B2B/SaaS en Costa Rica (`QG-07`), el outbox fiscal debe integrarse con `@dojocoding/hacienda-sdk` para firmar XAdES-EPES, validar XSD v4.4, enviar y consultar estados en Hacienda (primero `sandbox` y luego `production` bajo activación explícita) protegiendo certificados `.p12`, PINs y credenciales IDP por tenant.

## What changes

1. Definir la capacidad `hacienda-live-delivery` para configuración fiscal multi-tenant (separación estricta `sandbox` vs `production`), bóveda cifrada de certificados `.p12` y credenciales IDP con envelope encryption/KMS, alertas de vencimiento de certificado y worker persistente sobre `@dojocoding/hacienda-sdk`.
2. Extender `fiscal-outbox-sequences` con aislamiento `FORCE ROW LEVEL SECURITY` en tablas `fob_*` y persistencia inmutable de XML firmado y XML de respuesta de Hacienda.

## Impact

- Paquetes y apps afectados: `@quimera/fiscal-outbox` (transporte real basado en `@dojocoding/hacienda-sdk`, migración RLS en `fob_*`, registro de XML firmado/respuesta) y `apps/oficios` (proceso dedicado `fiscal-outbox-worker` y configuración segura de emisor).
- Mantiene `pnpm verify` 100% offline: el transporte real solo se activa bajo configuración y opt-in explícito; `Factura CI` permanece loopback-only de forma permanente (`QR-SEC-012`).

## Fuera de alcance

- Aprobación legal o contable automática de regímenes tributarios especiales (responsabilidad del emisor/contador).
- Modificación de la política loopback-only de `@quimera/factura-ci`.
