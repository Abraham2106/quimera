# Pipeline exodus-to-oficios

```bash
pnpm quimera -- pipeline validate pipelines/exodus-to-oficios.yaml
pnpm quimera -- pipeline run pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json
```

El manifiesto vive en `pipelines/exodus-to-oficios.yaml` y las resoluciones en `decisions-demo.yaml`. El primer `run` pausa con código 3. Después:

```bash
pnpm quimera -- exodus decisions apply --file decisions-demo.yaml --json
pnpm quimera -- pipeline resume --run <run_id> --manifest pipelines/exodus-to-oficios.yaml --tenant taller-frio-demo --json
```
