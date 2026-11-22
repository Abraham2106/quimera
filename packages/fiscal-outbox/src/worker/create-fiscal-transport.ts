import {
  Environment as HaciendaEnvironment,
  getEnvironmentConfig,
  HttpClient,
  TokenManager,
  type EnvironmentConfig,
} from "@dojocoding/hacienda-sdk";

import type { FiscalCredentialEnvironment } from "../store/pg-fiscal-credentials.js";
import type { DecryptedFiscalCredentials } from "./fiscal-credentials.js";
import {
  HaciendaSdkTransport,
  type HaciendaEmitterIdentity,
} from "./hacienda-sdk-transport.js";
import { LoopbackRecepcionTransport } from "./loopback-recepcion-transport.js";
import type { FiscalOutboxTransport } from "./types.js";

export type FiscalTransportKind = "loopback" | "hacienda";

export function resolveFiscalTransportKind(): FiscalTransportKind {
  const explicit = process.env.FISCAL_TRANSPORT?.trim().toLowerCase();
  if (explicit === "hacienda" || explicit === "loopback") {
    return explicit;
  }
  if (process.env.NODE_ENV === "test") {
    return "loopback";
  }
  return "hacienda";
}

export function emitterFromIssuerId(issuerId: string): HaciendaEmitterIdentity {
  return {
    tipoIdentificacion: issuerId.length === 9 ? "01" : "02",
    numeroIdentificacion: issuerId,
  };
}

function resolveLoopbackBaseUrl(): string {
  const url = process.env.FISCAL_TRANSPORT_URL?.trim();
  if (!url) {
    throw new Error("ERR_FISCAL_TRANSPORT: FISCAL_TRANSPORT_URL es obligatorio para loopback");
  }
  return url.replace(/\/$/, "");
}

function environmentConfig(
  fiscalEnv: FiscalCredentialEnvironment,
  apiBaseOverride?: string,
): EnvironmentConfig {
  const base = getEnvironmentConfig(
    fiscalEnv === "production" ? HaciendaEnvironment.Production : HaciendaEnvironment.Sandbox,
  );
  if (!apiBaseOverride) {
    return base;
  }
  return {
    ...base,
    name: `${base.name}-loopback`,
    apiBaseUrl: apiBaseOverride,
    idpTokenUrl: `${apiBaseOverride}/token`,
  };
}

export type CreateFiscalTransportInput = {
  readonly credentials: DecryptedFiscalCredentials;
  readonly emitter?: HaciendaEmitterIdentity;
  readonly kind?: FiscalTransportKind;
  readonly fetchFn?: typeof fetch;
};

export type WorkerTransportBundle = {
  readonly transport: FiscalOutboxTransport;
  readonly signXml: (xml: string) => Promise<string>;
};

export async function createFiscalWorkerTransport(
  input: CreateFiscalTransportInput,
): Promise<WorkerTransportBundle> {
  const kind = input.kind ?? resolveFiscalTransportKind();
  const emitter = input.emitter ?? emitterFromIssuerId(input.credentials.issuerId);
  const loopbackUrl = process.env.FISCAL_TRANSPORT_URL?.trim();

  if (kind === "loopback") {
    const transport = new LoopbackRecepcionTransport({
      baseUrl: resolveLoopbackBaseUrl(),
      p12: input.credentials.p12,
      pin: input.credentials.pin,
      emitter,
      fetchFn: input.fetchFn,
    });
    return {
      transport,
      signXml: (xml) => transport.sign(xml),
    };
  }

  const apiOverride =
    loopbackUrl && loopbackUrl.length > 0 ? loopbackUrl.replace(/\/$/, "") : undefined;
  const envConfig = environmentConfig(input.credentials.environment, apiOverride);
  let tokenManager: TokenManager;
  if (apiOverride) {
    tokenManager = {
      async getAccessToken() {
        return "loopback-static-token";
      },
      invalidate() {},
      get isAuthenticated() {
        return true;
      },
    } as unknown as TokenManager;
  } else {
    tokenManager = new TokenManager({ envConfig, fetchFn: input.fetchFn });
    await tokenManager.authenticate({
      username: input.credentials.idpUsername,
      password: input.credentials.idpPassword,
    });
  }

  const httpClient = new HttpClient({
    envConfig,
    tokenManager,
    fetchFn: input.fetchFn,
    rateLimiterOptions: false,
  });
  const transport = new HaciendaSdkTransport({
    httpClient,
    p12: input.credentials.p12,
    pin: input.credentials.pin,
    emitter,
  });
  return {
    transport,
    signXml: (xml) => transport.sign(xml),
  };
}