/** Exportación OTLP opcional. No abre conexión durante verify. */
export function otelExporterEndpoint(): string | null {
  const value = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return value && value.length > 0 ? value : null;
}
