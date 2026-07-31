import { EncryptionService } from './encryption.service.js';

describe('EncryptionService', () => {
  const originalEnv = process.env['ENCRYPTION_MASTER_KEY'];

  beforeAll(() => {
    // 32 bytes of zeros, hex-encoded - deterministic key just for tests.
    process.env['ENCRYPTION_MASTER_KEY'] = '00'.repeat(32);
  });

  afterAll(() => {
    process.env['ENCRYPTION_MASTER_KEY'] = originalEnv;
  });

  it('throws if ENCRYPTION_MASTER_KEY is not set', () => {
    delete process.env['ENCRYPTION_MASTER_KEY'];
    expect(() => new EncryptionService()).toThrow('ENCRYPTION_MASTER_KEY no está configurada');
    process.env['ENCRYPTION_MASTER_KEY'] = '00'.repeat(32);
  });

  it('throws if ENCRYPTION_MASTER_KEY does not decode to 32 bytes', () => {
    process.env['ENCRYPTION_MASTER_KEY'] = 'abcd';
    expect(() => new EncryptionService()).toThrow(/debe decodificar a 32 bytes/);
    process.env['ENCRYPTION_MASTER_KEY'] = '00'.repeat(32);
  });

  it('decrypts back to the original plaintext', () => {
    const service = new EncryptionService();
    const plaintext = '-----BEGIN CERTIFICATE-----\nMIIB...fake...\n-----END CERTIFICATE-----';

    const ciphertext = service.encrypt(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(service.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV) for the same plaintext', () => {
    const service = new EncryptionService();
    const plaintext = 'mismo-secreto';

    const first = service.encrypt(plaintext);
    const second = service.encrypt(plaintext);

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe(plaintext);
    expect(service.decrypt(second)).toBe(plaintext);
  });

  it('rejects a tampered ciphertext instead of returning corrupted plaintext', () => {
    const service = new EncryptionService();
    const ciphertext = service.encrypt('secreto-sensible');

    const raw = Buffer.from(ciphertext, 'base64');
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff; // flip the last ciphertext byte
    const tampered = raw.toString('base64');

    expect(() => service.decrypt(tampered)).toThrow();
  });
});
