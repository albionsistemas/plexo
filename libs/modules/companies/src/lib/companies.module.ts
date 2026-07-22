import { readFileSync } from 'node:fs';
import { Logger, Module } from '@nestjs/common';
import { AFIP_PADRON, type AfipPadronPort } from './afip-padron.port.js';
import type { AfipCredentials } from './afip-wsaa-client.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { RealAfipPadronService } from './real-afip-padron.js';
import { StubAfipPadronService } from './stub-afip-padron.js';

const logger = new Logger('CompaniesModule');

/**
 * Global config, not per-tenant - one AFIP certificate for the whole app,
 * same convention as RESEND_API_KEY/JWT_SECRET. Falls back to the stub
 * (which throws AfipNotConfiguredError) when the cert/key/CUIT aren't all
 * set, so local/dev environments keep working, just without the AFIP
 * lookup button doing anything - see StubAfipPadronService.
 */
function createAfipPadron(): AfipPadronPort {
  const certPath = process.env['AFIP_CERT_PATH'];
  const keyPath = process.env['AFIP_KEY_PATH'];
  const cuitRepresentada = process.env['AFIP_CUIT_REPRESENTADA'];
  const env: AfipCredentials['env'] = process.env['AFIP_ENV'] === 'produccion' ? 'produccion' : 'homologacion';

  if (!certPath || !keyPath || !cuitRepresentada) {
    logger.warn(
      'AFIP_CERT_PATH/AFIP_KEY_PATH/AFIP_CUIT_REPRESENTADA not set - AFIP CUIT lookup is disabled',
    );
    return new StubAfipPadronService();
  }

  try {
    const certPem = readFileSync(certPath, 'utf8');
    const keyPem = readFileSync(keyPath, 'utf8');
    return new RealAfipPadronService({ certPem, keyPem, env }, cuitRepresentada);
  } catch (err) {
    logger.error(`Failed to read AFIP_CERT_PATH/AFIP_KEY_PATH: ${(err as Error).message}`);
    return new StubAfipPadronService();
  }
}

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, { provide: AFIP_PADRON, useFactory: createAfipPadron }],
  exports: [CompaniesService],
})
export class CompaniesModule {}
