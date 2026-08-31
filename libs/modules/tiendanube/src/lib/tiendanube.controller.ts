import { BadRequestException, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import { Public, Roles } from '@plexo/auth';
import { ConnectorService } from '@plexo/connectors';
import { getTenantId, getUserId, PrismaService, withTenantContext } from '@plexo/database';
import type { FastifyReply } from 'fastify';
import { TiendanubeCallbackQueryDto } from './dto/tiendanube-callback-query.dto.js';
import { TiendanubeConnector } from './tiendanube.connector.js';
import { TiendanubeStateService } from './tiendanube-state.service.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

// Where the callback lands the browser once it's done - same convention as
// MercadoPagoController.redirectTarget: no dedicated Integraciones page
// exists yet (that's Fase 5 of PLAN_TIENDANUBE.md), so this points at
// Preferencias with a query flag a future page can read.
function redirectTarget(status: 'connected' | 'error'): string {
  return `${FRONTEND_URL}/preferences?connector=tiendanube&status=${status}`;
}

/**
 * Same reasoning as MercadoPagoController.redirect: Fastify's
 * reply.redirect(url) only defaults to 302 when no status code has been
 * set on the reply yet, and Nest's platform-fastify adapter already
 * stamps 200 before a handler body runs - always pass 302 explicitly.
 */
function redirect(reply: FastifyReply, url: string): void {
  reply.redirect(url, 302);
}

interface TiendanubeConnectorStatusResponse {
  status: 'DISCONNECTED' | 'PENDING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  storeName: string | null;
  storeId: string | null;
  connectedAt: Date | null;
}

@Controller('connectors/tiendanube')
export class TiendanubeController {
  private readonly logger = new Logger(TiendanubeController.name);

  constructor(
    private readonly connector: TiendanubeConnector,
    private readonly connectorService: ConnectorService,
    private readonly stateService: TiendanubeStateService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Get('authorize')
  authorize(): { authorizationUrl: string } {
    const tenantId = getTenantId();
    const userId = getUserId();
    if (!userId) {
      // Can't happen on an authenticated route in practice - JwtAuthGuard
      // always sets request.user.sub before this runs - but the type is
      // string | undefined, so guard against it explicitly rather than
      // silently sign a state with userId: undefined.
      throw new BadRequestException('No se pudo identificar al usuario autenticado');
    }

    const state = this.stateService.sign({ tenantId, userId });
    const authorizationUrl = this.connector.getAuthorizationUrl(tenantId, state);
    return { authorizationUrl };
  }

  /**
   * @Public() - Tiendanube redirects the browser here with a full-page
   * navigation, which never carries the app's bearer token (same reasoning
   * as MercadoPagoController.callback). `state` alone authenticates this
   * request: it's a JWT only this server could have signed, in
   * authorize() above, moments earlier. Tenant context is opened by hand
   * below, same pattern as every other @Public() OAuth callback in this
   * app.
   */
  @Public()
  @Get('callback')
  async callback(@Query() query: TiendanubeCallbackQueryDto, @Res({ passthrough: false }) reply: FastifyReply) {
    if (!query.code || !query.state) {
      redirect(reply, redirectTarget('error'));
      return;
    }

    let tenantId: string;
    let userId: string;
    try {
      ({ tenantId, userId } = this.stateService.verify(query.state));
    } catch {
      redirect(reply, redirectTarget('error'));
      return;
    }

    try {
      await withTenantContext(
        this.prisma,
        tenantId,
        () => this.connector.handleOAuthCallback(tenantId, query.code as string, query.state as string),
        userId,
      );
      redirect(reply, redirectTarget('connected'));
    } catch (err) {
      this.logger.error(`Fallo al completar el OAuth de Tiendanube para tenant ${tenantId}: ${err}`);
      redirect(reply, redirectTarget('error'));
    }
  }

  @Roles('OWNER', 'ADMIN')
  @Post('disconnect')
  async disconnect(): Promise<{ status: 'DISCONNECTED' }> {
    await this.connector.disconnect(getTenantId());
    return { status: 'DISCONNECTED' };
  }

  @Get('status')
  async status(): Promise<TiendanubeConnectorStatusResponse> {
    const connector = await this.connectorService.getConnector('TIENDANUBE');
    if (!connector) {
      return { status: 'DISCONNECTED', storeName: null, storeId: null, connectedAt: null };
    }
    return {
      status: connector.status,
      storeName: connector.externalNickname ?? null,
      storeId: connector.externalAccountId ?? null,
      connectedAt: connector.connectedAt ?? null,
    };
  }
}
