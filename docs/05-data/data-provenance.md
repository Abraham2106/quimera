# Modelo de Procedencia y Linaje de Datos — QUIMERA

- **Versión:** 1.0.0
- **Fecha:** 2026-11-21
- **Estado:** Propuesto para implementación MVP
- **Referencias:** [Modelo de Dominio](./domain-model.md) | [ADR-004](../04-architecture/ADR/ADR-004-immutable-evidence-storage.md) | [ADR-005](../04-architecture/ADR/ADR-005-provenance-model.md)

---

## 1. Propósito

La procedencia a nivel de registro y campo es uno de los diferenciadores centrales de QUIMERA. Un usuario técnico o un auditor debe poder responder de forma determinista y sin inspeccionar scripts manuales las siguientes siete preguntas fundamentales:

| # | Pregunta de auditoría | Cómo responde QUIMERA |
|---|---|---|
| 1 | **¿De dónde vino este dato?** | `qum_provenance_entries.raw_record_id` → `qum_raw_records.source_locator` (ej. `hoja:Clientes!fila:42`, `csv:linea:118`, `xml:/FacturaElectronica/Receptor/Nombre`) + `qum_data_sources.name`. |
| 2 | **¿Qué archivo lo contenía?** | `qum_provenance_entries.artifact_id` → `qum_artifacts` (`original_name`, `sha256`, `ingested_at`, `storage_uri`). |
| 3 | **¿Qué transformación se aplicó?** | `qum_provenance_entries.transformation_id`, `rule_version` y `metadata_json` (parámetros exactos, ej. `normalize_cr_tax_id@1.0.0`). |
| 4 | **¿Qué regla decidió su equivalencia?** | `qum_decisions` vinculada por `decision_id` (`actor_type = RULE`, `rationale`, `payload_json` con claves comparadas). |
| 5 | **¿Quién revisó la decisión?** | `qum_decisions` (`actor_type = HUMAN`, `actor_id`, `rationale`, `decided_at`) + historial de `supersedes_decision_id`. |
| 6 | **¿Qué versión del esquema estaba vigente?** | `qum_provenance_entries.schema_version_id` → `qum_schema_versions` (`schema_name`, `semver`, `json_schema`). |
| 7 | **¿Qué registros posteriores dependen de él?** | Consulta inversa sobre `qum_provenance_entries` (por `artifact_id` o `raw_record_id`) y `qum_entity_relations` (grafo de impacto descendente). |

---

## 2. Distinción Rigurosa: Hash, Firma, Autenticidad y Procedencia

QUIMERA exige no confundir cuatro conceptos que frecuentemente se mezclan en documentación informal:

| Concepto | Qué demuestra realmente | Qué NO demuestra | Mecanismo en QUIMERA |
|---|---|---|---|
| **Hash criptográfico (`SHA-256`)** | Integridad de bytes: que el archivo almacenado hoy en el CAS tiene exactamente los mismos bits que cuando se ingirió. | **NO** demuestra que el contenido original sea verídico, legal, completo ni emitido por la entidad que dice emitirlo. Un Excel falsificado tiene un SHA-256 perfectamente válido. | Calculado en streaming al ingerir en `qum_artifacts.sha256` y por fila en `qum_raw_records.record_hash`. |
| **Firma digital criptográfica (ej. XAdES-EPES)** | Que un documento XML fue firmado con la llave privada asociada a un certificado digital específico y no fue alterado tras firmarse. | Por sí sola **NO** prueba aceptación tributaria de Hacienda ni corrección contable comercial (se requiere el `MensajeHacienda` firmado por Hacienda). | Verificada con `verifySignedDocumentXml` y `verifyHaciendaResponseXml` de `@dojocoding/hacienda-sdk`. |
| **Autenticidad de origen** | Que un registro proviene legítimamente de una fuente autorizada (ej. consulta directa con TLS a `api.hacienda.go.cr` o comprobante aceptado por Hacienda). | No se puede asumir para archivos locales subidos manualmente (CSV/XLSX). | Clasificada explícitamente mediante `origin_kind` y metadatos de verificación (`verifiedByHacienda`, `sourceTrustLevel`). |
| **Procedencia (Provenance / Lineage)** | El grafo histórico verificable de qué insumos, reglas, versiones y decisiones humanas produjeron un dato actual. | No garantiza por sí sola veracidad del insumo inicial (*garbage in → traceable garbage out*), pero hace auditable y corregible el origen del error. | `qum_provenance_entries` + `qum_decisions` + `qum_artifacts` + `qum_schema_versions`. |

---

## 3. Taxonomía de `origin_kind`

Toda `ProvenanceEntry` clasifica su origen en exactamente uno de cinco tipos:

1. **`DIRECT_PARSE`:** Valor leído directamente desde un formato estructurado (CSV, XLSX, XML) sin alteración semántica (ej. `trim` inocuo).
2. **`RULE_TRANSFORM`:** Valor derivado mediante una función determinista versionada (ej. conversión de `₡85.000,00` a `8500000` minor units en `CRC` con `parse_cr_money@1.0.0`).
3. **`HUMAN_DECISION`:** Valor fijado, fusionado o corregido por una persona a través de `ResolutionDecision`.
4. **`EXTERNAL_API`:** Valor enriquecido mediante una consulta verificada de `CR API Passport` (incluye `passportId`, `passportVersion`, `endpoint`, `fetchedAt`).
5. **`AI_EXTRACTION`:** Valor propuesto por un extractor opcional (`@quimera/adapter-clairic`); **obliga** registrar `modelId`, `confidence`, `pNull`, `valid`, `complete` y `charSpans`. Nunca puede quedar como única autoridad en campos fiscales o monetarios sin validación posterior (`HUMAN_DECISION` o verificación de regla exacta).

---

## 4. Ejemplo Concreto: «¿Por qué el cliente X debe ₡85.000?»

Ante la consulta `quimera exodus trace --entity ent_cust_019 --field balance_due_minor`, el motor construye el árbol de procedencia:

```json
{
  "entityId": "ent_cust_019",
  "entityType": "customer",
  "fieldPath": "balance_due_minor",
  "currentValue": { "amountMinor": 8500000, "currency": "CRC" },
  "schemaVersion": "oficios-v1@1.0.0",
  "lineage": [
    {
      "relation": "INVOICE_TOTAL (+120,000 CRC)",
      "entityId": "ent_inv_204",
      "artifact": { "name": "FE-00100001010000000204.xml", "sha256": "a1b2...f9", "verifiedSignature": true },
      "locator": "xml:/FacturaElectronica/ResumenFactura/TotalComprobante",
      "originKind": "DIRECT_PARSE",
      "rule": "parse_fe44_xml@1.0.0"
    },
    {
      "relation": "PAYMENT_APPLIED (-35,000 CRC)",
      "entityId": "ent_pay_088",
      "artifact": { "name": "ventas_2025.csv", "sha256": "9f8e...10", "verifiedSignature": false },
      "locator": "csv:line:347",
      "originKind": "HUMAN_DECISION",
      "decision": {
        "decisionId": "dec_0041",
        "actorId": "admin@taller-frio.cr",
        "action": "OVERRIDE_FIELD",
        "rationale": "Pago #88 aparecía atribuido a cliente homónimo; confirmado abono contra factura 204 según comprobante SINPE.",
        "decidedAt": "2026-11-21T14:22:10Z"
      }
    }
  ]
}
```

---

## 5. Preservación en el Esquema Destino

Al ejecutar `Data Exodus migrate` hacia una aplicación consumidora como `OficiOS`:
- Cada registro migrado (`ofi_customers`, `ofi_equipment`) guarda `provenance_entity_id` apuntando a `qum_entities.id`.
- La aplicación consumidora puede mostrar en su UI un panel «Origen del registro» invocando un servicio de lectura sobre `qum_provenance_entries` sin duplicar lógica de linaje.
- Si en una exportación ligera el usuario pide una base destino separada sin tablas `qum_*`, `Data Exodus` emite un archivo adjunto `provenance-bundle.jsonl` + reporte JSON con el mapa completo `target_id -> provenance_chain`.
