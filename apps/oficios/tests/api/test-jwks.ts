import { createPublicKey, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function exportRsaJwk(publicKey: KeyObject, kid: string): Record<string, string> {
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, kid, use: "sig", alg: "RS256" };
}

function exportEcJwk(publicKey: KeyObject, kid: string): Record<string, string> {
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, kid, use: "sig", alg: "ES256" };
}

export type LoopbackJwks = {
  readonly url: string;
  readonly kid: string;
  readonly privateKey: KeyObject;
  readonly server: Server;
  rotateKeys(keys: Array<{ kid: string; publicKey: KeyObject; alg: "RS256" | "ES256" }>): void;
  close(): Promise<void>;
};

export function signJwtWithPrivateKey(
  privateKey: KeyObject,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const alg = header.alg;
  let sig: Buffer;
  if (alg === "RS256") {
    sig = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  } else if (alg === "ES256") {
    sig = createSign("SHA256")
      .update(signingInput)
      .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  } else {
    throw new Error(`unsupported alg ${String(alg)}`);
  }
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export async function startLoopbackJwks(initialKid = "key-a"): Promise<LoopbackJwks> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let keys: Array<Record<string, string>> = [exportRsaJwk(publicKey, initialKid)];

  const server = createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("jwks server failed to bind");
  }

  return {
    url: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
    kid: initialKid,
    privateKey,
    server,
    rotateKeys(nextKeys) {
      keys = nextKeys.map((entry) =>
        entry.alg === "RS256"
          ? exportRsaJwk(entry.publicKey, entry.kid)
          : exportEcJwk(entry.publicKey, entry.kid),
      );
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}