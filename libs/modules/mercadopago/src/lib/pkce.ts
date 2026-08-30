import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 7636 PKCE, used because MP's authorization-code flow supports it
 * (see MercadoPagoOAuthClient) and the plan calls for it explicitly - a
 * stolen `code` alone (10 minutes, single-use per MP's own docs) still
 * can't be exchanged for tokens without the verifier, which never leaves
 * the server (see McpStateService - it travels inside the signed `state`,
 * never in a redirect URL).
 */

/** 32 random bytes -> 43 base64url chars, within RFC 7636's 43-128 range. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** S256 method: BASE64URL(SHA256(code_verifier)) - the method MP's docs
 * recommend over the plain passthrough method. */
export function codeChallengeFromVerifier(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}
