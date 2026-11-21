# Perfil y mapping.yaml

Desde la raíz del repositorio:

```bash
pnpm exec vitest run --config packages/data-exodus/vitest.config.ts t-data-004
```

Eso perfila los siete archivos de `fixtures/demo-hvac-1000` y escribe la propuesta `mapping.yaml` en memoria, con `NEEDS_REVIEW` en columnas ambiguas. No llama a ningún modelo.
