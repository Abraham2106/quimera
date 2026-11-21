export type SimulatorResponseMode =
  | "accepted"
  | "rejected"
  | "processing"
  | "conflict_409"
  | "rate_limit_429"
  | "unavailable_503"
  | "tcp_cut_post";

export interface SimulatorRequestLogEntry {
  readonly method: "POST" | "GET";
  readonly path: string;
  readonly clave: string | null;
  readonly consecutivo: string | null;
  readonly emisor: string | null;
  readonly body: string;
  readonly at: string;
}

export interface SimulatorOptions {
  readonly host?: string;
  readonly port?: number;
  readonly seed?: number;
  readonly mode?: SimulatorResponseMode;
}

export interface SimulatorHandle {
  readonly baseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly seed: number;
  setMode(mode: SimulatorResponseMode): void;
  getMode(): SimulatorResponseMode;
  getLog(): readonly SimulatorRequestLogEntry[];
  clearLog(): void;
  close(): Promise<void>;
}

export interface ParsedSubmissionBody {
  clave: string | null;
  consecutivo: string | null;
  emisor: string | null;
  tenantId: string | null;
  operationId: string | null;
  docType: string | null;
  raw: string;
}