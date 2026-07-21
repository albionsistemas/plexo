import { Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { InvoiceCreatedEvent, StockUpdatedEvent } from './events.js';
import { INVOICE_CREATED, STOCK_UPDATED } from './events.js';

@WebSocketGateway(3001, {
  cors: { origin: ['http://localhost:4200', 'http://localhost:3000'], credentials: true },
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(DashboardGateway.name);

  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth['token'] as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<{ tenantId: string }>(token);
      client.data['tenantId'] = payload.tenantId;
      void client.join(`tenant:${payload.tenantId}`);
      this.logger.log(`Client connected to tenant room ${payload.tenantId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected (tenant: ${client.data['tenantId'] ?? 'unknown'})`);
  }

  @OnEvent(STOCK_UPDATED)
  onStockUpdated(event: StockUpdatedEvent) {
    this.server.to(`tenant:${event.tenantId}`).emit(STOCK_UPDATED, event);
  }

  @OnEvent(INVOICE_CREATED)
  onInvoiceCreated(event: InvoiceCreatedEvent) {
    this.server.to(`tenant:${event.tenantId}`).emit(INVOICE_CREATED, event);
  }
}
