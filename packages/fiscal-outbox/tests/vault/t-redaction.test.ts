import { describe, expect, it, vi } from "vitest";

import {
  FISCAL_REDACTED,
  isFiscalSensitiveKey,
  redactFiscalLog,
  redactFiscalObject,
  redactFiscalSecrets,
} from "../../src/vault/redact.js";
import { writeWorkerError, writeWorkerLog } from "../../src/worker/worker-log.js";

describe("T-SEC-FOB-REDACT — redacción estructurada", () => {
  it("detecta claves sensibles sin confundir palabras como mapping", () => {
    expect(isFiscalSensitiveKey("idpPassword")).toBe(true);
    expect(isFiscalSensitiveKey("idp_password")).toBe(true);
    expect(isFiscalSensitiveKey("p12Base64")).toBe(true);
    expect(isFiscalSensitiveKey("token")).toBe(true);
    expect(isFiscalSensitiveKey("secret")).toBe(true);
    expect(isFiscalSensitiveKey("mapping")).toBe(false);
  });

  it("redacta un objeto anidado con idpPassword, p12, token y secret", () => {
    const redacted = redactFiscalObject({
      ok: false,
      detail: {
        idpPassword: "super-secreto",
        p12: Buffer.from([0x30, 0x82]),
        p12Base64: "MIIBAQ==",
        token: "abc123",
        secret: "llave",
        nested: [{ authorization: "Bearer abc" }],
        issuerId: "3101000099",
      },
    });
    const json = JSON.stringify(redacted);
    for (const value of ["super-secreto", "MIIBAQ==", "abc123", "llave", "Bearer abc"]) {
      expect(json).not.toContain(value);
    }
    expect(json).toContain("3101000099");
    expect(json.split(FISCAL_REDACTED).length - 1).toBeGreaterThanOrEqual(5);
  });

  it("redacta mensajes de texto con asignaciones y Bearer", () => {
    const message = redactFiscalSecrets(
      'falló pin=4321 password="secreto" idpPassword:abc p12Base64=MIIB token=abc123 secret=llave Authorization: Bearer xyz',
    );
    expect(message).not.toContain("4321");
    expect(message).not.toContain("secreto");
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("Bearer xyz");
    expect(message).toMatch(/pin=\[redacted\]/i);
  });

  it("protege los mensajes del route de credenciales fiscales", () => {
    const routeMessage =
      '{"error":"Faltan issuerId, environment, p12Base64, pin, idpUsername, idpPassword o certNotAfter.","p12Base64":"MIIBsecret","idpPassword":"ruteo-secreto"}';
    const log = redactFiscalLog(JSON.parse(routeMessage));
    expect(log).not.toContain("MIIBsecret");
    expect(log).not.toContain("ruteo-secreto");
  });

  it("los logs del worker pasan por la redacción estructurada", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      writeWorkerLog({ event: "worker.credenciales", idpPassword: "log-secreto" });
      writeWorkerError({ event: "worker.error", token: "log-token" });
      const joined = `${stdout.mock.calls.map((c) => c[0]).join("")}${stderr.mock.calls
        .map((c) => c[0])
        .join("")}`;
      expect(joined).not.toContain("log-secreto");
      expect(joined).not.toContain("log-token");
      expect(joined).toContain(FISCAL_REDACTED);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});
