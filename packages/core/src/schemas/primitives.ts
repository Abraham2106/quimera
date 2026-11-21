import { z } from "zod";

/** SemVer `MAJOR.MINOR.PATCH` */
export const SemVerSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "contractVersion must be MAJOR.MINOR.PATCH");

export const ContractVersionSchema = SemVerSchema;

export const UuidSchema = z.string().uuid();

export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "sha256 must be 64 lowercase hex chars");

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const ErrCodeSchema = z
  .string()
  .regex(/^ERR_[A-Z0-9_]+$/, "error code must match ^ERR_[A-Z0-9_]+$");

export const WarningCodeSchema = z
  .string()
  .regex(/^W_[A-Z0-9_]+$/, "warning code must match ^W_[A-Z0-9_]+$");

export const StorageUriSchema = z
  .string()
  .regex(/^(cas|s3|r2):\/\//, "storageUri must use cas://, s3:// or r2://");

export const CrCurrencySchema = z.enum(["CRC", "USD"]);