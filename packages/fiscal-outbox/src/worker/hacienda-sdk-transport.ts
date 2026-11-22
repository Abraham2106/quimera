import {
  getStatus,
  signXml,
  submitDocument,
  type HttpClient,
} from "@dojocoding/hacienda-sdk";

import type { FiscalOutboxTransport, TransportCallResult } from "./types.js";

export type HaciendaEmitterIdentity = {
  readonly tipoIdentificacion: "01" | "02" | "03" | "04";
  readonly numeroIdentificacion: string;
};

export type HaciendaSdkTransportOptions = {
  readonly httpClient: HttpClient;
  readonly p12: Buffer;
  readonly pin: string;
  readonly emitter: HaciendaEmitterIdentity;
};

/**
 * Transporte de emisión que firma con XAdES-EPES y habla con el API de recepción
 * a través de `@dojocoding/hacienda-sdk`. El `HttpClient` puede apuntar a loopback.
 */
export class HaciendaSdkTransport implements FiscalOutboxTransport {
  constructor(private readonly options: HaciendaSdkTransportOptions) {}

  async sign(xml: string): Promise<string> {
    return signXml(xml, this.options.p12, this.options.pin);
  }

  async postDocument(input: {
    clave: string;
    xml: string;
    signal?: AbortSignal;
  }): Promise<TransportCallResult> {
    const signed = await this.sign(input.xml);
    try {
      const submitted = await submitDocument(this.options.httpClient, {
        clave: input.clave,
        fecha: new Date().toISOString(),
        emisor: {
          tipoIdentificacion: this.options.emitter.tipoIdentificacion,
          numeroIdentificacion: this.options.emitter.numeroIdentificacion,
        },
        comprobanteXml: Buffer.from(signed, "utf8").toString("base64"),
      });
      return { httpStatus: submitted.status, response: null, error: null };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      return {
        httpStatus: Number.isFinite(statusCode) ? statusCode : undefined,
        error: error instanceof Error ? error : new Error("ERR_HACIENDA_SUBMIT"),
      };
    }
  }

  async getByClave(clave: string): Promise<TransportCallResult> {
    try {
      const status = await getStatus(this.options.httpClient, clave);
      return {
        httpStatus: 200,
        response: { estado: status.status },
        responseXml: status.responseXml,
        error: null,
      };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
      return {
        httpStatus: Number.isFinite(statusCode) ? statusCode : undefined,
        error: error instanceof Error ? error : new Error("ERR_HACIENDA_STATUS"),
      };
    }
  }
}
