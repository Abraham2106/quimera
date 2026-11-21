-- Row-Level Security for fob_* (tenant isolation via SET LOCAL app.current_tenant_id)

DO $rls$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'fob_fiscal_sequences',
    'fob_fiscal_intents',
    'fob_fiscal_documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
        USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      tbl,
      tbl
    );
  END LOOP;
END;
$rls$;