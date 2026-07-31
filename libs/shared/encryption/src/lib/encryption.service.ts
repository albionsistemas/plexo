import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // recommended nonce size for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Envelope encryption for tenant-owned secrets that must live in Postgres
 * (AFIP certs/keys today; bank and payment-gateway credentials in
 * TenantSettings later). One master key (ENCRYPTION_MASTER_KEY) encrypts
 * everything - GCM's auth tag also catches tampering/corruption, not just
 * confidentiality. Deliberately has no notion of "what" it's encrypting:
 * callers store the returned string as an opaque blob and decrypt it back
 * to the original plaintext.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const hexKey = process.env['ENCRYPTION_MASTER_KEY'];
    if (!hexKey) {
      throw new Error('ENCRYPTION_MASTER_KEY no está configurada');
    }
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_MASTER_KEY debe decodificar a ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} caracteres hex), se recibieron ${key.length}`,
      );
    }
    this.key = key;
  }

  /** Returns base64(iv || authTag || ciphertext) - one self-contained string per secret. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
