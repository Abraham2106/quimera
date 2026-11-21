const LEGAL_SUFFIX_RE =
  /\b(s\.?\s*a\.?|s\.?\s*r\.?\s*l\.?|ltda\.?|sociedad\s+anonima|limitada)\b/gi;

const DIACRITICS_RE = /[\u0300-\u036f]/g;

export function normalizeLegalName(raw: string): string {
  let s = raw.normalize("NFD").replace(DIACRITICS_RE, "");
  s = s.replace(LEGAL_SUFFIX_RE, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

export function sameTaxId(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  return a.replace(/\D/g, "") === b.replace(/\D/g, "");
}