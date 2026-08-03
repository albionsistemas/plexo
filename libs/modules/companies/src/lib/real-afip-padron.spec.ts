import type { AfipCredentialsService } from '@plexo/afip-credentials';
import { AfipLookupError, AfipNotConfiguredError } from './afip-padron.port.js';
import { RealAfipPadronService } from './real-afip-padron.js';

describe('RealAfipPadronService.lookup', () => {
  it('throws AfipNotConfiguredError when the tenant has no AFIP certificate configured', async () => {
    const afipCredentials = { getCurrent: jest.fn().mockResolvedValue(null) } as unknown as AfipCredentialsService;
    const service = new RealAfipPadronService(afipCredentials);

    await expect(service.lookup('20111111112')).rejects.toThrow(AfipNotConfiguredError);
  });

  it('resolves credentials from the current tenant on every call, not once at construction', async () => {
    const getCurrent = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        certPem: 'not a real cert',
        keyPem: 'not a real key',
        cuitRepresentada: '20111111112',
        env: 'homologacion',
      });
    const afipCredentials = { getCurrent } as unknown as AfipCredentialsService;
    const service = new RealAfipPadronService(afipCredentials);

    await expect(service.lookup('20111111112')).rejects.toThrow(AfipNotConfiguredError);
    // Second call, same instance, different tenant credentials this time -
    // must re-resolve, not reuse whatever the constructor saw (there is no
    // constructor-time credential resolution anymore).
    await expect(service.lookup('20111111112')).rejects.toThrow(AfipLookupError);
    expect(getCurrent).toHaveBeenCalledTimes(2);
  });

  it('wraps a WSAA/AFIP-side failure as AfipLookupError, not a raw error', async () => {
    const afipCredentials = {
      getCurrent: jest.fn().mockResolvedValue({
        certPem: 'not a real cert',
        keyPem: 'not a real key',
        cuitRepresentada: '20111111112',
        env: 'homologacion',
      }),
    } as unknown as AfipCredentialsService;
    const service = new RealAfipPadronService(afipCredentials);

    await expect(service.lookup('20111111112')).rejects.toThrow(AfipLookupError);
  });
});
