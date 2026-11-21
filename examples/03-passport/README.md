# CR API Passport en fixture

```bash
pnpm quimera -- passport list --json
pnpm quimera -- passport verify --all --mode fixture --json
```

La salida `--json` queda en stdout. Un fixture con deriva responde `ERR_PASSPORT_CONTRACT_DRIFT` y código 5.
