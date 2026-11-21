import {
  parseAuthorizationBearer,
  resolveJwtVerificationSecret,
  verifyBearerJwtBootstrap,
  type VerifiedBootstrapJwt,
} from "./jwt.js";

export type { VerifiedBootstrapJwt };

export function resolveBootstrapBearer(
  headerValue: string | undefined,
): VerifiedBootstrapJwt | null {
  const bearer = parseAuthorizationBearer(headerValue);
  if (!bearer) {
    return null;
  }
  const secret = resolveJwtVerificationSecret();
  if (!secret) {
    return null;
  }
  return verifyBearerJwtBootstrap(bearer, {
    secret,
    issuer: process.env.OFICIOS_JWT_ISSUER?.trim() || undefined,
    audience: process.env.OFICIOS_JWT_AUDIENCE?.trim() || undefined,
  });
}