import { signXml } from "@dojocoding/hacienda-sdk";

import type { FiscalOutboxTransport, TransportCallResult } from "./types.js";
import type { HaciendaEmitterIdentity } from "./hacienda-sdk-transport.js";

export type LoopbackRecepcionTransportOptions = {
  readonly baseUrl: string;
  readonly p12: Buffer;
  readonly pin: string;
  readonly emitter: HaciendaEmitterIdentity;
  readonly fetchFn?: typeof fetch;
};

/**
 * Cliente de recepción contra un simulador HTTP en loopback (p. ej. Factura CI),
 * sin OAuth contra el IDP real de Hacienda.
 */
export class LoopbackRecepcionTransport implements FiscalOutboxTransport {
  constructor(private readonly options: LoopbackRecepcionTransportOptions) {}

  async sign(xml: string): Promise<string> {
    return signXml(xml, this.options.p12, this.options.pin);
  }

  private base(): string {
    return this.options.baseUrl.replace(/\/$/, "");
  }

  async postDocument(input: { clave: string; xml: string }): Promise<TransportCallResult> {
    const signed = await this.sign(input.xml);
    const fetchFn = this.options.fetchFn ?? fetch;
    const url = `${this.base()}/recepcion`;
    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        redirect: "error",
        body: JSON.stringify({
          clave: input.clave,
          fecha: new Date().toISOString(),
          emisor: {
            tipoIdentificacion: this.options.emitter.tipoIdentificacion,
            numeroIdentificacion: this.options.emitter.numeroIdentificacion,
          },
          comprobanteXml: Buffer.from(signed, "utf8").toString("base64"),
        }),
      });
      if (!response.ok) {
        return {
          httpStatus: response.status,
          response: null,
          error: new Error(`ERR_LOOPBACK_POST status=${response.status}`),
        };
      }
      return {
        httpStatus: response.status,
        response: null,
        error: null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("ERR_LOOPBACK_POST"),
      };
    }
  }

  async getByClave(clave: string): Promise<TransportCallResult> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const url = `${this.base()}/recepcion/${encodeURIComponent(clave)}`;
    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        return {
          httpStatus: response.status,
          error: new Error(`ERR_LOOPBACK_GET status=${response.status}`),
        };
      }
      const estado =
        typeof data["ind-estado"] === "string"
          ? data["ind-estado"]
          : typeof data.estado === "string"
            ? data.estado
            : undefined;
      let responseXml: string | undefined;
      const encoded = data["respuesta-xml"];
      if (typeof encoded === "string") {
        try {
          responseXml = Buffer.from(encoded, "base64").toString("utf8");
        } catch {
          responseXml = undefined;
        }
      } else if (typeof data.responseXml === "string") {
        responseXml = data.responseXml;
      }
      return {
        httpStatus: response.status,
        response: estado ? { estado } : null,
        responseXml,
        error: null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("ERR_LOOPBACK_GET"),
      };
    }
  }
}