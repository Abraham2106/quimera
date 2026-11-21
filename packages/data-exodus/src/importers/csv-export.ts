const CSV_FORMULA_PREFIX = /^[=+\-@]/;

/**
 * Neutraliza prefijos de inyección de fórmulas CSV al exportar.
 * El valor crudo en `raw_payload` no se modifica; usar solo en salida CSV.
 */
export function neutralizeCsvFormulaPrefix(value: string): string {
  if (value.length === 0) {
    return value;
  }
  if (CSV_FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function neutralizeCsvExportRow(values: readonly string[]): string[] {
  return values.map((value) => neutralizeCsvFormulaPrefix(value));
}