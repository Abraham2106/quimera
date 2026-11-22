/** Limpieza determinista de buffers que contienen material criptográfico. */

export function zeroBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

export function zeroBuffers(...buffers: Array<Buffer | undefined>): void {
  for (const buffer of buffers) {
    if (buffer) {
      zeroBuffer(buffer);
    }
  }
}
