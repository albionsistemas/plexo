import { codeChallengeFromVerifier, generateCodeVerifier } from './pkce.js';

describe('pkce', () => {
  it('generateCodeVerifier produces a string within RFC 7636\'s 43-128 char range', () => {
    const verifier = generateCodeVerifier();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    // base64url charset only - never '+', '/', or '=' padding.
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a different verifier every call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it('derives the same challenge from the same verifier every time (deterministic)', () => {
    const verifier = generateCodeVerifier();

    expect(codeChallengeFromVerifier(verifier)).toBe(codeChallengeFromVerifier(verifier));
  });

  it('derives different challenges for different verifiers', () => {
    const a = codeChallengeFromVerifier(generateCodeVerifier());
    const b = codeChallengeFromVerifier(generateCodeVerifier());

    expect(a).not.toBe(b);
  });

  it('never reveals the verifier inside the challenge', () => {
    const verifier = generateCodeVerifier();

    expect(codeChallengeFromVerifier(verifier)).not.toContain(verifier);
  });
});
