import { redactFiscalSecrets } from "../vault/port.js";

export function writeWorkerLog(event: Record<string, unknown>): void {
  const line = redactFiscalSecrets(JSON.stringify(event));
  process.stdout.write(`${line}\n`);
}

export function writeWorkerError(event: Record<string, unknown>): void {
  const line = redactFiscalSecrets(JSON.stringify(event));
  process.stderr.write(`${line}\n`);
}