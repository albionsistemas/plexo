import forge from 'node-forge';

export interface ParsedAfipCertificate {
  /** Cert's own expiry (notAfter) - stored in the clear, it's not secret,
   * just so the UI can warn "vence en N días" without decrypting anything. */
  expiresAt: Date;
}

/**
 * Parses the uploaded cert/key PEM pair and confirms the key actually
 * belongs to that certificate (matching RSA modulus/exponent) - catches the
 * "pasted the wrong file" mistake at upload time instead of at the first
 * failed WSAA call, where the error would be far less obvious.
 */
export function parseAndValidateAfipCertificate(
  certPem: string,
  keyPem: string,
): ParsedAfipCertificate {
  let certificate: forge.pki.Certificate;
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    certificate = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error('El certificado no es un PEM válido');
  }
  try {
    privateKey = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch {
    throw new Error('La clave privada no es un PEM válido');
  }

  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  const matches =
    publicKey.n.compareTo(privateKey.n) === 0 && publicKey.e.compareTo(privateKey.e) === 0;
  if (!matches) {
    throw new Error('La clave privada no corresponde al certificado');
  }

  return { expiresAt: certificate.validity.notAfter };
}
