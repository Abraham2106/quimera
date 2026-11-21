# @quimera/demo-pos

Aplicación de demostración que contrasta un punto de venta (POS) con errores comunes de integración contra un POS respaldado por `@quimera/fiscal-outbox`, utilizando `@dojocoding/hacienda-sdk` y verificado con `@quimera/factura-ci`.

## Propósito

Reproduce en local y de forma determinista el problema documentado en [`DojoCodingLabs/hacienda-cr/docs/production-integration.md`](https://github.com/DojoCodingLabs/hacienda-cr/blob/main/docs/production-integration.md):

- **Modo `buggy`:** falla bajo concurrencia de consecutivos (`FC-017`) y cortes de red post-envío (`FC-031`), terminando con código de salida `1`.
- **Modo `outbox`:** delega consecutivos atómicos, idempotencia y recuperación a `@quimera/fiscal-outbox` sobre PostgreSQL 16, aprobando `25/25` escenarios con código de salida `0`.

## Comandos

```bash
pnpm --filter @quimera/demo-pos test
pnpm --filter @quimera/demo-pos factura-ci
```

Esta app solo se ejecuta contra el simulador loopback local de `@quimera/factura-ci` y nunca envía comprobantes a Hacienda.
