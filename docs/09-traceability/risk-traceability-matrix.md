# Matriz de Trazabilidad de Riesgos — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Línea base v1.0
- **Referencias:** [Modelo de Amenazas](../07-security/threat-model.md) | [Quality Gates](../08-quality/quality-gates.md) | [Plan MVP](../11-implementation/MVP-plan.md)

---

## Riesgo → Impacto → Probabilidad → Mitigación → Prueba → Riesgo Residual

| ID | Riesgo | Categoría | Impacto | Probabilidad | Mitigación principal | Prueba / Control | Riesgo residual |
|---|---|---|---|---|---|---|---|
| `RSK-001` | **Sobrealcance en hackathon** por intentar construir 5 productos completos a la vez | Proyecto / Alcance | Crítico | Alta | Vertical slices estrictos (`MVP-plan.md`), priorización MoSCoW, foco en historia unificada `Data Exodus → OficiOS` + `CR API Passport` + `Factura CI` con `Fiscal Outbox` mínimo | Revisión de corte por slice + `QG-06` | Medio (gestionable recortando `Should` si falta tiempo) |
| `RSK-002` | **Ban IP de 10 min por `api.hacienda.go.cr`** durante desarrollo o demo en red compartida (WeWork CGNAT) | Integración externa | Alto | Alta | Rate limiter conservador (`15/8 req/s`), caché agresivo TTL y modo `--mode fixture` 100% offline para demos y PR CI | `T-PASS-002`, `T-PASS-004`, `QG-06` | Bajo |
| `RSK-003` | **Ruptura de contrato en BCCR SDDE** (inconsistencias de casing observadas en su PDF o cambios de cuadros como el de dic 2026) | Integración externa | Medio | Alta | Pasaporte versionado con ruta canónica verificada, detector de deriva (`verify`) y degradación documentada a Hacienda `/indicadores/tc/dolar` para TC básico | `T-PASS-003`, `T-PASS-006` | Bajo |
| `RSK-004` | **Cambio breaking en `@dojocoding/hacienda-sdk` (pre-1.0, v0.13.0)** | Dependencia externa | Alto | Media | Fijar versión en `pnpm-lock.yaml`, encapsular detrás de adaptador delgado (`ADR-010`) y pruebas de contrato sobre `DocumentStore` | `T-OUT-001`, `T-DATA-003` | Bajo |
| `RSK-005` | **Fusión automática incorrecta de clientes o saldos** en `Data Exodus` | Integridad de datos | Crítico | Media | Política conservadora (`ADR-006`): solo `EXACT_DUPLICATE` es automático; toda similitud difusa o contradicción crea `Conflict(BLOCKING, OPEN)` | `T-DATA-006`, `T-DATA-007`, `AT-06` | Bajo |
| `RSK-006` | **Doble emisión fiscal o colisión de consecutivos** ante timeout o concurrencia | Integridad fiscal | Crítico | Media | `fob_fiscal_intents` UNIQUE + `fob_fiscal_sequences` atómico por `issuerId` + prohibición de `POST` tras timeout (solo `GET` por clave) | `T-OUT-002`, `T-OUT-003`, `T-OUT-005`, `FC-017`, `FC-031` | Bajo |
| `RSK-007` | **Fuga de datos entre empresas (cross-tenant)** | Seguridad | Crítico | Media | `tenant_id NOT NULL` en toda tabla + claves compuestas + RLS (`FORCE ROW LEVEL SECURITY`) en producción + pruebas `FC-020..022` | `T-SEC-001`, `T-FCI-006` | Bajo |
| `RSK-008` | **Acoplamiento accidental de `Core`/`Data Exodus` a `OficiOS`** bajo presión de demo | Arquitectura | Alto | Media | Regla ESLint/CI prohibiendo imports desde `packages/*` hacia `apps/*` + `oficios-v1` declarado como `TargetSchema` genérico (`ADR-011`) | `T-OFI-001`, `T-CORE-003` | Muy bajo |
| `RSK-009` | **Dependencia implícita o retiro del preview de `Clairic`** (Workers AI sin SLA, cambio de precio dic 2026) | Dependencia IA | Alto | Alta (si se acopla) | Aislamiento absoluto en `@quimera/adapter-clairic` opcional (`ADR-012`); baseline opera 100% sin IA ni GPU | `T-CORE-004`, `T-CLAI-001`, `AT-17` | Muy bajo |
| `RSK-010` | **Inyección maliciosa vía archivos importados** (XXE, Zip-bomb XLSX, CSV Formula Injection) | Seguridad | Alto | Media | Parser XML sin DTD/XXE, límite 50 MiB descomprimido en XLSX, neutralización de prefijos `= + - @` al exportar CSV | `T-SEC-003` | Bajo |
| `RSK-011` | **Confusión legal de `Factura CI` como certificación oficial de Hacienda** | Legal / Producto | Alto | Media | Aviso explícito obligatorio en CLI, JSON (`disclaimer`) y documentación + bloqueo loopback-only | `T-FCI-008`, `T-SEC-012` | Bajo |
| `RSK-012` | **Comoditización por mejora de LLMs o wrappers MCP existentes (`jmnzcn/mcp-hacienda-cr`)** | Producto / Mercado | Alto | Media | Diferenciación en propiedades no resolubles solo con inteligencia del modelo: determinismo, procedencia criptográfica, detección empírica de deriva, concurrencia y recovery (`technical-landscape.md §4`) | Revisión estratégica + validación usuarios (`validation-plan.md`) | Medio |
| `RSK-013` | **OficiOS compite sin diferenciación contra TallerApp y Astra** | Producto / Mercado | Alto | Alta | Enfoque vertical inicial (`hvac-refrigeration-v1`), continuidad directa desde `Data Exodus` con procedencia auditable y validación con 5–10 talleres reales antes de escalar | Plan de validación (`docs/12-product-strategy/validation-plan.md`) | Medio |
| `RSK-014` | **Deriva hacia consultoría personalizada no escalable** en `Data Exodus` | Negocio | Alto | Media | `mapping.yaml` declarativo, catálogo reutilizable de reglas CR y enfoque *tool-first* para agencias/implementadores antes que servicios manuales | Revisión de métricas de tiempo de onboarding en pilotos | Medio |
| `RSK-015` | **Contaminación por licencia BSL 1.1** si se reutiliza `make-no-mistakes-toolkit` | Legal / OSS | Alto | Baja | Exclusión explícita documentada en `RESEARCH_LOG.md` y auditoría de licencias en CI | `T-SEC-011`, auditoría de dependencias | Muy bajo |
| `RSK-016` | **Fuga de secretos o uso de cédulas reales en fixtures del repositorio** | Seguridad / Privacidad | Crítico | Media | Generador 100% sintético de fixtures, `.gitignore` estricto (`*.p12`, `.env`), redacción `pino` y `gitleaks` en CI | `T-SEC-002`, `T-SEC-009`, `QG-01` | Bajo |
| `RSK-017` | **Escritura parcial o corrupción de BD tras crash en migración** | Confiabilidad | Alto | Media | Transacciones ACID + checkpoints atómicos + pruebas de interrupción forzada + `verify-artifacts` | `T-DATA-012`, `T-PIPE-004`, `T-SEC-006` | Bajo |
| `RSK-018` | **Expectativa incorrecta de acceso a APIs privadas (Correos CR Pymexpress)** | Alcance / Producto | Medio | Media | Documentar acceso contractual explícito (`private_contract_required`) sin inventar endpoints | `T-PASS-007`, `QG-02` | Muy bajo |
