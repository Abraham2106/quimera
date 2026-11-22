import http from "node:http";
import { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFiscalCredentialVault } from "../../src/vault/create-fiscal-vault.js";
import {
  LoopbackHttpKeyProvider,
  createLoopbackVaultHttpHandlers,
} from "../../src/vault/http-key-provider.js";
import { LocalFiscalVault } from "../../src/vault/local-envelope.js";
import { asFiscalCredentialVault } from "../../src/vault/port.js";

const KEK = createHash("sha256").update("loopback-kms-test").digest();
const TOKEN = "test-vault-token";

describe("HttpKeyProvider — loopback stub", () => {
  const handlers = createLoopbackVaultHttpHandlers(KEK);
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.statusCode = 401;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, string>;
        if (req.url === "/v1/wrap" && req.method === "POST") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(handlers.wrap({ plaintext: body.plaintext! })));
          return;
        }
        if (req.url === "/v1/unwrap" && req.method === "POST") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(handlers.unwrap({ ciphertext: body.ciphertext! })));
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("seal/open con loopback síncrono no expone el plaintext en ciphertext", async () => {
    const vault = asFiscalCredentialVault(
      new LocalFiscalVault(new LoopbackHttpKeyProvider(handlers)),
    );
    const secret = Buffer.from("secreto-fiscal");
    const sealed = await vault.seal("11111111-1111-4111-8111-111111111111", "pin", "sandbox", secret);
    expect(sealed.ciphertext).not.toContain(secret.toString("utf8"));
    expect(Buffer.compare(await vault.open(sealed), secret)).toBe(0);
  });

  it("factory http usa fetch contra el stub remoto", async () => {
    const prevKind = process.env.FISCAL_VAULT;
    const prevUrl = process.env.FISCAL_VAULT_URL;
    const prevToken = process.env.FISCAL_VAULT_TOKEN;
    process.env.FISCAL_VAULT = "http";
    process.env.FISCAL_VAULT_URL = baseUrl;
    process.env.FISCAL_VAULT_TOKEN = TOKEN;

    const vault = createFiscalCredentialVault({ kind: "http" });
    const plain = randomBytes(16);
    const sealed = await vault.seal("22222222-2222-4222-8222-222222222222", "p12", "sandbox", plain);
    expect((await vault.open(sealed)).equals(plain)).toBe(true);

    if (prevKind === undefined) delete process.env.FISCAL_VAULT;
    else process.env.FISCAL_VAULT = prevKind;
    if (prevUrl === undefined) delete process.env.FISCAL_VAULT_URL;
    else process.env.FISCAL_VAULT_URL = prevUrl;
    if (prevToken === undefined) delete process.env.FISCAL_VAULT_TOKEN;
    else process.env.FISCAL_VAULT_TOKEN = prevToken;
  });

  it("LoopbackHttpKeyProvider alimenta LocalFiscalVault", async () => {
    const vault = asFiscalCredentialVault(new LocalFiscalVault(new LoopbackHttpKeyProvider(handlers)));
    const data = Buffer.from([0x30, 0x01, 0x02]);
    const sealed = await vault.seal("33333333-3333-4333-8333-333333333333", "idp_password", "sandbox", data);
    expect((await vault.open(sealed)).equals(data)).toBe(true);
  });
});