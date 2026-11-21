import { parseClave, parseDocumentXml, validateDocumentXml } from "@dojocoding/hacienda-sdk";

export interface XmlStructuralCheck {
  readonly ok: boolean;
  readonly mode: "sdk-xsd" | "structural-minimal";
  readonly details: string[];
}

export async function validateXml(xml: string | undefined): Promise<XmlStructuralCheck> {
  const details: string[] = [];
  if (!xml || xml.trim().length === 0) {
    return {
      ok: false,
      mode: "structural-minimal",
      details: ["no xml payload"],
    };
  }

  try {
    const schema = await validateDocumentXml(xml, { requireSignature: false });
    if (!schema.valid) {
      details.push(...schema.issues);
    }
    return {
      ok: schema.valid,
      mode: "sdk-xsd",
      details,
    };
  } catch {
    try {
      parseDocumentXml(xml);
      return { ok: true, mode: "sdk-xsd", details: ["parsed without full xsd"] };
    } catch (err) {
      details.push(err instanceof Error ? err.message : String(err));
      return { ok: false, mode: "sdk-xsd", details };
    }
  }
}

export function minimalStructuralCheck(input: {
  clave: string;
  docType: string;
}): XmlStructuralCheck {
  const details: string[] = [];
  let ok = true;
  if (!/^\d{50}$/.test(input.clave)) {
    ok = false;
    details.push("clave must be 50 digits");
  }
  try {
    const parsed = parseClave(input.clave);
    if (parsed.documentType !== input.docType) {
      ok = false;
      details.push(`doc type mismatch: clave=${parsed.documentType} expected=${input.docType}`);
    }
  } catch (err) {
    ok = false;
    details.push(err instanceof Error ? err.message : String(err));
  }
  return {
    ok,
    mode: "structural-minimal",
    details,
  };
}