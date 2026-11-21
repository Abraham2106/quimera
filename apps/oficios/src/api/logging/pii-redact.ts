const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s()-]{7,}\d/g;

export function redactPiiInText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]").replace(PHONE_PATTERN, "[REDACTED_PHONE]");
}

export function formatPiiAuditLine(fields: Record<string, string | null | undefined>): string {
  const parts = Object.entries(fields).map(([key, raw]) => {
    const text = raw ?? "";
    const redacted = key === "email" || key === "phone" ? redactPiiInText(text) : text;
    return `${key}=${redacted}`;
  });
  return parts.join(" ");
}