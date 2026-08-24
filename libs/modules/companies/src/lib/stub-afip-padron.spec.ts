import { StubAfipPadronService } from './stub-afip-padron.js';

describe('StubAfipPadronService.lookup', () => {
  const service = new StubAfipPadronService();

  it('resuelve null (AFIP sin datos) para un CUIT terminado en 0', async () => {
    await expect(service.lookup('20111111110')).resolves.toBeNull();
  });

  it('resuelve JURIDICA + Responsable Inscripto para un prefijo de empresa (30) con dígito impar', async () => {
    const result = await service.lookup('30111111113');

    expect(result).toEqual({
      cuit: '30111111113',
      personType: 'JURIDICA',
      name: '[STUB] Empresa de Prueba 30111111113',
      taxCondition: 'Responsable Inscripto',
      fiscalAddress: '[STUB] Av. de Prueba 123, CABA',
    });
  });

  it('resuelve FISICA + Monotributo para un prefijo de persona (20) con dígito par', async () => {
    const result = await service.lookup('20111111112');

    expect(result).toEqual({
      cuit: '20111111112',
      personType: 'FISICA',
      name: '[STUB] Persona de Prueba 20111111112',
      taxCondition: 'Monotributo (Stub)',
      fiscalAddress: '[STUB] Av. de Prueba 123, CABA',
    });
  });

  it('es determinístico - el mismo CUIT siempre devuelve el mismo resultado', async () => {
    const first = await service.lookup('27111111114');
    const second = await service.lookup('27111111114');

    expect(first).toEqual(second);
  });
});
