## ADDED Requirements

### Requirement: Las tablas fob_* aplican FORCE ROW LEVEL SECURITY por tenant

Todas las tablas del esquema `fob_*` SHALL habilitar `ENABLE` y `FORCE ROW LEVEL SECURITY` vinculadas a `app.current_tenant_id`, garantizando que ningún tenant ni worker con contexto de otro emisor pueda leer consecutivos, intenciones fiscales o respuestas de otro cliente B2B.

#### Scenario: Consulta sobre fob_* desde Tenant A no accede a documentos de Tenant B

- **WHEN** existen intenciones fiscales y secuencias del tenant B y se consulta bajo el contexto de sesión del tenant A
- **THEN** PostgreSQL devuelve cero filas del tenant B
