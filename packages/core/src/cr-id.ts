const CR_ID_DIGITS_RE = /^\d{9,12}$/;

/**
 * Normaliza identificación costarricense: solo dígitos, longitud 9–12.
 * Retorna `null` si la entrada no es válida.
 */
export function normalizeCrIdentification(input: string): string | null {
  const digitsOnly = input.replace(/\D/g, "");
  if (!CR_ID_DIGITS_RE.test(digitsOnly)) {
    return null;
  }
  return digitsOnly;
}