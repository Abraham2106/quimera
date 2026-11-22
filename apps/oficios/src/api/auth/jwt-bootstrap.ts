import {
  buildJwtVerifyOptions,
  jwtVerificationConfigured,
  parseAuthorizationBearer,
  verifyBearerJwtBootstrapAsync,
  type VerifiedBootstrapJwt,
} from "./jwt.js";

export type { VerifiedBootstrapJwt };

export async function resolveBootstrapBearer(
  headerValue: string | undefined,
): Promise<VerifiedBootstrapJwt | null> {
  const bearer = parseAuthorizationBearer(headerValue);
  if (!bearer) {
    return null;
  }
  if (!jwtVerificationConfigured()) {
    return null;
  }
  return verifyBearerJwtBootstrapAsync(bearer, buildJwtVerifyOptions());
}