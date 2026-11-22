/** Verifica que una escritura con fence (WHERE lease_owner = workerId) haya afectado la fila. */
export function assertFencedUpdate(result: { count?: number }, documentId: string): void {
  if (Number(result.count ?? 0) !== 1) {
    throw new Error(`ERR_FOB_FENCE: el lease de ${documentId} ya no pertenece a este worker`);
  }
}
