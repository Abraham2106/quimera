import { redactFiscalLog } from "../vault/port.js";

export function writeWorkerLog(event: Record<string, unknown>): void {
  process.stdout.write(`${redactFiscalLog(event)}\n`);
}

export function writeWorkerError(event: Record<string, unknown>): void {
  process.stderr.write(`${redactFiscalLog(event)}\n`);
}