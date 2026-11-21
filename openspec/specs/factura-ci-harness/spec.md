# factura-ci-harness Specification

## Purpose

Define la suite conductual determinista `@quimera/factura-ci`, su simulador local en loopback y el contraste reproducible en `apps/demo-pos`.

## Requirements

### Requirement: Factura CI restringe el tráfico estrictamente a loopback y declara no certificación

`@quimera/factura-ci` SHALL rechazar cualquier URL de destino que no sea loopback con `ERR_SEC_LOOPBACK_ONLY` y SHALL incluir en sus reportes el aviso explícito de que aprobar la suite no constituye certificación ni aceptación del Ministerio de Hacienda.

#### Scenario: URL remota es rechazada antes de emitir tráfico

- **WHEN** se configura un target externo (no `127.0.0.1` / `localhost` / `::1`)
- **THEN** el harness falla inmediatamente con `ERR_SEC_LOOPBACK_ONLY`

### Requirement: La suite cubre los 25 escenarios canónicos y distingue un POS vulnerable de uno con outbox

`runScenarioSuite` SHALL ejecutar los 25 escenarios registrados (`FC-001`..`FC-024` y `FC-031`) con soporte de formatos `pretty`, `json` y `junit`; el target `fixture:buggy` y el POS `buggy` SHALL salir con código `1` fallando en concurrencia (`FC-017`) y corte TCP (`FC-031`), mientras que `fixture:compliant` y el POS con `@quimera/fiscal-outbox` SHALL aprobar `25/25` con código `0`.

#### Scenario: Contraste entre POS vulnerable y POS respaldado por outbox

- **WHEN** se ejecuta la suite completa contra `fixture:buggy` y contra `fixture:compliant`
- **THEN** `fixture:buggy` termina con exit code `1` reportando fallos (incluyendo `FC-017` y `FC-031`) y `fixture:compliant` termina con exit code `0` con `25/25` escenarios aprobados
