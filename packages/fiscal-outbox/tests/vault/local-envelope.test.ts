import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertCanPromoteToProduction,
  assessPkcs12Upload,
  signedXmlMustExistBeforePost,
} from "../../src/vault/certificate-policy.js";
import { LocalFiscalVault, LocalKeyProvider, redactFiscalSecrets } from "../../src/vault/local-envelope.js";

describe("bóveda fiscal local", () => {
  it("cifra y recupera el .p12, el PIN y la contraseña IDP por tenant", () => {
    const vault = new LocalFiscalVault(new LocalKeyProvider(randomBytes(32)));
    const p12 = Buffer.from([0x30, 0x82, 0x01, 0x00, 0x01]);
    const sealed = vault.seal("11111111-1111-4111-8111-111111111111", "p12", p12);
    expect(sealed.ciphertext).not.toContain(p12.toString("base64"));
    expect(Buffer.compare(vault.open(sealed), p12)).toBe(0);
    const pin = vault.seal("11111111-1111-4111-8111-111111111111", "pin", Buffer.from("4321"));
    expect(vault.open(pin).toString()).toBe("4321");
  });

  it("rechaza un certificado vencido y avisa a 30 días", () => {
    const now = new Date("2026-11-21T00:00:00.000Z");
    const bytes = Uint8Array.from([0x30, 0x80, 0x00, 0x01]);
    expect(assessPkcs12Upload({ bytes, notAfter: new Date("2026-11-01T00:00:00.000Z"), now }).reason).toBe(
      "ERR_P12_EXPIRED",
    );
    const soon = assessPkcs12Upload({
      bytes,
      notAfter: new Date("2026-12-10T00:00:00.000Z"),
      now,
    });
    expect(soon.accepted).toBe(true);
    expect(soon.expiresWithin30Days).toBe(true);
  });

  it("no promueve a producción sin sandbox aceptado", () => {
    const blocked = assertCanPromoteToProduction({
      sandboxAccepted: false,
      productionCertificateValid: true,
      adminConfirmed: true,
    });
    expect(blocked.ok).toBe(false);
    expect(
      assertCanPromoteToProduction({
        sandboxAccepted: true,
        productionCertificateValid: true,
        adminConfirmed: true,
      }).ok,
    ).toBe(true);
  });

  it("exige el XML firmado antes del POST y no deja secretos en el mensaje", () => {
    expect(() => signedXmlMustExistBeforePost(null)).toThrow(/ERR_SIGNED_XML_MISSING/);
    expect(signedXmlMustExistBeforePost("artifact-1")).toBeUndefined();
    expect(redactFiscalSecrets('falló pin=4321 password="secreto"')).not.toContain("4321");
  });
});
