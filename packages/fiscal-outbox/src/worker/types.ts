import type { DeliveryState } from "@dojocoding/hacienda-sdk";

import type { FiscalEnvironment } from "../store/types.js";
import type { FiscalDocumentRow } from "../store/row-map.js";

/** Estado de entrega persistido en PostgreSQL (extiende el SDK con `INCIERTO`). */
export type FobDeliveryState = DeliveryState | "INCIERTO";

export const POST_DISPATCHED_JSON_KEY = "_postDispatched" as const;

export type HaciendaTransportPayload = {
  estado?: string;
  detalle?: string;
} | null;

export type TransportCallResult = {
  httpStatus?: number;
  response?: HaciendaTransportPayload;
  responseXml?: string;
  error?: Error | null;
};

export type FiscalOutboxTransport = {
  postDocument(input: {
    clave: string;
    xml: string;
  }): Promise<TransportCallResult>;
  getByClave(clave: string): Promise<TransportCallResult>;
};

export type ProcessOnceOptions = {
  readonly workerId: string;
  readonly tenantId: string;
  readonly transport: FiscalOutboxTransport;
  readonly leaseSeconds?: number;
  readonly now?: () => Date;
  /** Firma el XML (XAdES-EPES) antes de persistirlo y de hacer POST. */
  readonly signXml?: (xml: string) => Promise<string>;
};

export type ClaimedFiscalDocument = FiscalDocumentRow & {
  issuer_id: string;
  environment: FiscalEnvironment;
  signed_xml_artifact_id: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  next_poll_at: string | null;
};

export type ProcessOnceResult =
  | { readonly processed: false }
  | {
      readonly processed: true;
      readonly clave: string;
      readonly action: "post" | "get" | "skip";
    };