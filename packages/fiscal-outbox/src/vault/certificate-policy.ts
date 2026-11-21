const PKCS12_PREFIX = 0x30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CertificateAssessment = {
  readonly accepted: boolean;
  readonly expiresWithin30Days: boolean;
  readonly reason?: string;
};

export function assessPkcs12Upload(input: {
  bytes: Uint8Array;
  notAfter: Date;
  now?: Date;
}): CertificateAssessment {
  const now = input.now ?? new Date();
  if (input.bytes.byteLength < 4 || input.bytes[0] !== PKCS12_PREFIX) {
    return { accepted: false, expiresWithin30Days: false, reason: "ERR_P12_INVALID" };
  }
  if (input.notAfter.getTime() <= now.getTime()) {
    return { accepted: false, expiresWithin30Days: false, reason: "ERR_P12_EXPIRED" };
  }
  const expiresWithin30Days = input.notAfter.getTime() - now.getTime() <= 30 * DAY_MS;
  return { accepted: true, expiresWithin30Days };
}

export type PromotionInput = {
  readonly sandboxAccepted: boolean;
  readonly productionCertificateValid: boolean;
  readonly adminConfirmed: boolean;
};

export function assertCanPromoteToProduction(input: PromotionInput): { ok: true } | { ok: false; reason: string } {
  if (!input.sandboxAccepted) {
    return { ok: false, reason: "QG-07: falta una aceptación previa en sandbox" };
  }
  if (!input.productionCertificateValid) {
    return { ok: false, reason: "QG-07: el certificado de producción no está vigente" };
  }
  if (!input.adminConfirmed) {
    return { ok: false, reason: "QG-07: un ADMIN debe confirmar la promoción" };
  }
  return { ok: true };
}

export function signedXmlMustExistBeforePost(signedXmlArtifactId: string | null): void {
  if (!signedXmlArtifactId) {
    throw new Error("ERR_SIGNED_XML_MISSING: el XML firmado debe persistirse antes del POST");
  }
}
