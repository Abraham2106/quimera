import { createHash, randomUUID } from "node:crypto";

import type { OficiosSql } from "../../db/connection.js";
import { workbenchArtifactStore } from "./artifact-store.js";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export class AttachmentRejected extends Error {
  constructor(
    readonly status: 400 | 404 | 413,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentRejected";
  }
}

function matchesMagic(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mime === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mime === "application/pdf") {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  return false;
}

export async function storeDiagnosisAttachment(
  client: OficiosSql,
  tenantId: string,
  workOrderId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
): Promise<{ attachmentId: string; sha256: string; storageUri: string }> {
  if (file.bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentRejected(413, "ERR_ATTACHMENT_TOO_LARGE", "El adjunto supera 5 MiB.");
  }
  if (!ALLOWED_MIME.has(file.mime) || !matchesMagic(file.mime, file.bytes)) {
    throw new AttachmentRejected(400, "ERR_ATTACHMENT_MIME", "Solo se aceptan JPEG, PNG, WEBP o PDF.");
  }
  const stored = await workbenchArtifactStore.put({
    tenantId,
    bytes: file.bytes,
    artifactKind: "work_order_photo",
    originalName: file.name,
    mimeType: file.mime,
  });
  if (!stored.ok) {
    throw new AttachmentRejected(400, stored.error.code, stored.error.message);
  }
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const attachmentId = randomUUID();
  const diagnosisId = randomUUID();
  {
    const tx = client;
    const orders = await tx<{ id: string }[]>`
      SELECT id::text FROM ofi_work_orders WHERE id = ${workOrderId}::uuid
    `;
    if (!orders[0]) {
      throw new AttachmentRejected(404, "ERR_NOT_FOUND", "Orden de trabajo no encontrada.");
    }
    await tx`
      INSERT INTO qum_artifacts (
        id, tenant_id, sha256, artifact_kind, original_name, mime_type, byte_size, storage_uri
      )
      VALUES (
        ${stored.data.id}::uuid,
        ${tenantId}::uuid,
        ${stored.data.sha256},
        'work_order_photo',
        ${file.name},
        ${file.mime},
        ${file.bytes.byteLength},
        ${stored.data.storageUri}
      )
      ON CONFLICT (tenant_id, sha256, artifact_kind) DO NOTHING
    `;
    await tx`
      INSERT INTO ofi_diagnoses (id, tenant_id, work_order_id, notes, measurements_json)
      VALUES (
        ${diagnosisId}::uuid,
        ${tenantId}::uuid,
        ${workOrderId}::uuid,
        'Evidencia fotográfica',
        ${tx.json({})}
      )
    `;
    await tx`
      INSERT INTO ofi_diagnosis_attachments (
        id, tenant_id, diagnosis_id, filename, sha256, byte_length, mime_type, storage_uri
      )
      VALUES (
        ${attachmentId}::uuid,
        ${tenantId}::uuid,
        ${diagnosisId}::uuid,
        ${file.name},
        ${sha256},
        ${file.bytes.byteLength},
        ${file.mime},
        ${stored.data.storageUri}
      )
    `;
  }
  return { attachmentId, sha256, storageUri: stored.data.storageUri };
}

export async function readDiagnosisAttachment(
  client: OficiosSql,
  tenantId: string,
  workOrderId: string,
  attachmentId: string,
): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const rows = await (async (tx) =>
    tx<{ mime_type: string | null; storage_uri: string | null }[]>`
      SELECT a.mime_type, a.storage_uri
      FROM ofi_diagnosis_attachments AS a
      INNER JOIN ofi_diagnoses AS d ON d.id = a.diagnosis_id
      WHERE a.id = ${attachmentId}::uuid AND d.work_order_id = ${workOrderId}::uuid
    `
  )(client);
  const row = rows[0];
  if (!row?.storage_uri) return null;
  const loaded = await workbenchArtifactStore.get(row.storage_uri);
  if (!loaded.ok) return null;
  return { mime: row.mime_type ?? "application/octet-stream", bytes: loaded.data };
}
