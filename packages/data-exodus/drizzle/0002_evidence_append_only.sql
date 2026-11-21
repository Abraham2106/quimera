-- QR-SEC-005: tablas de evidencia append-only para el rol de aplicación (quimera).
-- Nota: REVOKE UPDATE/DELETE al dueño de la tabla rompe FK (FOR KEY SHARE) en PG 16;
-- con dueño quimera la protección efectiva son los triggers + REVOKE desde PUBLIC.

CREATE OR REPLACE FUNCTION qum_deny_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on %.% is forbidden', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS qum_append_only_qum_artifacts ON qum_artifacts;
CREATE TRIGGER qum_append_only_qum_artifacts
  BEFORE UPDATE OR DELETE ON qum_artifacts
  FOR EACH ROW EXECUTE FUNCTION qum_deny_evidence_mutation();

DROP TRIGGER IF EXISTS qum_append_only_qum_provenance_entries ON qum_provenance_entries;
CREATE TRIGGER qum_append_only_qum_provenance_entries
  BEFORE UPDATE OR DELETE ON qum_provenance_entries
  FOR EACH ROW EXECUTE FUNCTION qum_deny_evidence_mutation();

DROP TRIGGER IF EXISTS qum_append_only_qum_decisions ON qum_decisions;
CREATE TRIGGER qum_append_only_qum_decisions
  BEFORE UPDATE OR DELETE ON qum_decisions
  FOR EACH ROW EXECUTE FUNCTION qum_deny_evidence_mutation();

REVOKE UPDATE, DELETE ON qum_artifacts FROM PUBLIC;
REVOKE UPDATE, DELETE ON qum_provenance_entries FROM PUBLIC;
REVOKE UPDATE, DELETE ON qum_decisions FROM PUBLIC;

DO $revoke$
DECLARE
  tbl TEXT;
  owner NAME;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['qum_artifacts', 'qum_provenance_entries', 'qum_decisions']
  LOOP
    SELECT r.rolname
      INTO owner
      FROM pg_class c
      JOIN pg_roles r ON r.oid = c.relowner
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = tbl;
    IF owner IS NOT NULL AND owner <> 'quimera' THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON %I FROM quimera', tbl);
    END IF;
  END LOOP;
END;
$revoke$;