# Factura CI loopback

```bash
pnpm quimera -- factura-ci run --target fixture:buggy --format json
pnpm quimera -- factura-ci run --target fixture:compliant --format json
```

`fixture:buggy` falla `FC-017` y `FC-031` (código 1). `fixture:compliant` aprueba los 25 escenarios (código 0). El simulador solo acepta `127.0.0.1`.
