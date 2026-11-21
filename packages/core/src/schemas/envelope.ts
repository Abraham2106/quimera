import { z } from "zod";
import { ContractVersionSchema, IsoDateTimeSchema, UuidSchema } from "./primitives.js";

export const QuimeraProducerSchema = z.object({
  module: z.string().min(1),
  version: z.string().min(1),
});

export function createQuimeraEnvelopeSchema<T extends z.ZodType>(payloadSchema: T) {
  return z.object({
    contractVersion: ContractVersionSchema,
    tenantId: UuidSchema,
    correlationId: UuidSchema,
    producedAt: IsoDateTimeSchema,
    producer: QuimeraProducerSchema,
    payload: payloadSchema,
  });
}

export type QuimeraEnvelope<T> = {
  contractVersion: `${number}.${number}.${number}`;
  tenantId: string;
  correlationId: string;
  producedAt: string;
  producer: z.infer<typeof QuimeraProducerSchema>;
  payload: T;
};