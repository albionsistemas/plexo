import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import type { TiendanubeOrder } from '@plexo/database';
import { ConvertTiendanubeOrderDto } from './dto/convert-tiendanube-order.dto.js';
import { TiendanubeOrdersService } from './tiendanube-orders.service.js';

// Mismos roles que SalesController - convertir una orden de Tiendanube
// termina creando la misma clase de documento (venta/movimiento de stock)
// que esos endpoints, así que el permiso requerido es el mismo.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('connectors/tiendanube/orders')
export class TiendanubeOrdersController {
  constructor(private readonly ordersService: TiendanubeOrdersService) {}

  @Get()
  list(): Promise<TiendanubeOrder[]> {
    return this.ordersService.list();
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertTiendanubeOrderDto,
  ): Promise<TiendanubeOrder> {
    return this.ordersService.convert(id, dto);
  }
}
