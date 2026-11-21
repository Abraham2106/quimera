export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly correlationId?: string;
}

export interface LoggerPort {
  log(entry: LogEntry): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}