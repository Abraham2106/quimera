# Política de Seguridad

## Alcance y límites operativos del MVP

QUIMERA sigue una disciplina estricta entre **garantías verificadas en el MVP offline** y **requisitos pendientes para producción**:

- **Sin red externa en el baseline:** `pnpm verify` y `pnpm demo:verify` corren 100% en local contra fixtures sintéticos (`fixtures/demo-hvac-1000`) y simuladores en `127.0.0.1`.
- **Loopback obligatorio en Factura CI:** `@quimera/factura-ci` rechaza cualquier URL que no sea loopback (`ERR_SEC_LOOPBACK_ONLY`) y nunca envía documentos al Ministerio de Hacienda.
- **Aislamiento multi-tenant (`qum_*`):** Las tablas `qum_*` aplican `ENABLE` y `FORCE ROW LEVEL SECURITY` en PostgreSQL 16. Tanto CI como desarrollo local deben usar un rol de aplicación con `NOSUPERUSER NOBYPASSRLS`. Las tablas `ofi_*` del taller aún filtran por `tenant_id` en aplicación y requieren políticas RLS dedicadas antes de producción multi-tenant.
- **Autenticación en OficiOS:** En el MVP local, `apps/oficios` acepta cabeceras de prueba (`x-tenant-id`, `x-test-role`, `x-actor-id`). No expongas `apps/oficios` fuera de `127.0.0.1` sin reemplazar esa capa por autenticación real (OIDC/JWT/MFA).
- **IA opcional aislada:** `@quimera/adapter-clairic` está deshabilitado por defecto (`QUIMERA_AI_ENABLED=false`), no es importado por ningún paquete del núcleo y trata el texto extraído como datos no confiables.
- **Higiene de secretos:** Nunca commitees archivos `.env`, certificados `.p12`, PINs, tokens del BCCR SDDE ni datos reales de clientes.

## Reporte de vulnerabilidades

Si encontrás una vulnerabilidad de seguridad, evitá publicar un issue con un exploit reproducible si afecta a terceros. Abrí un aviso privado (GitHub Security Advisories) o contactá a los mantenedores del repositorio con:

1. Paquete o ruta afectada y commit/versión.
2. Pasos mínimos de reproducción con datos sintéticos.
3. Impacto esperado y sugerencia de mitigación si la tenés.

Para el modelo de amenazas completo (STRIDE/OWASP) y los controles normativos, consultá [`docs/07-security/threat-model.md`](docs/07-security/threat-model.md) y [`docs/07-security/security-requirements.md`](docs/07-security/security-requirements.md).
