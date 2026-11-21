# @quimera/factura-ci

Suite conductual determinista y simulador local de Hacienda en loopback (`127.0.0.1`) para probar la resiliencia fiscal de sistemas POS, ERP y backends antes de llegar a producción.

> **Aviso importante:** Factura CI ejecuta pruebas conductuales sintéticas contra un simulador local determinista. Aprobar esta suite **no constituye certificación ni validación oficial del Ministerio de Hacienda de Costa Rica**.

## Escenarios cubiertos (25)

Incluye los escenarios `FC-001` a `FC-024` más `FC-031`, agrupables por suite (`all`, `concurrency`, `recovery`, `isolation`, `states`, `xml`), cubriendo:

- Concurrencia de consecutivos y claves duplicadas (`FC-017`).
- Cortes de red, timeouts post-envío y recuperación de estados ambiguos (`FC-031`).
- Reintentos ante `429` / `5xx`, aislamiento multi-empresa y validación estructural XML.

## Uso desde la CLI

```bash
# Contraste contra un SUT con defectos de concurrencia/recuperación (sale con código 1)
pnpm quimera -- factura-ci run --target fixture:buggy --format json

# Contraste contra un SUT respaldado por Fiscal Outbox (sale con código 0, 25/25)
pnpm quimera -- factura-ci run --target fixture:compliant --format json
```

Formatos soportados: `pretty`, `json` y `junit` (para integración en pipelines CI).

## Garantía de seguridad (Loopback Only)

`assertLoopbackHost` y `parseTargetUrl` rechazan cualquier host que no sea loopback (`ERR_SEC_LOOPBACK_ONLY`), garantizando que Factura CI jamás envíe tráfico a entornos externos ni a Hacienda real.

## Ejemplo y pruebas

Recorrido ejecutable: [`examples/04-factura-ci/README.md`](../../examples/04-factura-ci/README.md).  
Catálogo detallado: [`docs/08-quality/failure-scenarios.md`](../../docs/08-quality/failure-scenarios.md).

```bash
pnpm --filter @quimera/factura-ci test
```
