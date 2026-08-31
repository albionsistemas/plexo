import { DocumentLetter } from '@plexo/database';
import { IsEnum, IsIn, IsUUID, ValidateIf } from 'class-validator';

export type ConvertTiendanubeOrderMode = 'INVOICE' | 'WITHOUT_INVOICE';

/**
 * El "clic humano" de la decisión #4: el usuario elige entre facturar con
 * CAE (INVOICE) o crear la venta sin facturar (WITHOUT_INVOICE, la "venta
 * informal" ya documentada en PROGRESS.md - un SALE_OUT por línea, sin
 * Invoice, sin asiento contable automático). Ninguno de los dos modos se
 * asume - ver TiendanubeOrdersService.convert.
 */
export class ConvertTiendanubeOrderDto {
  @IsIn(['INVOICE', 'WITHOUT_INVOICE'])
  mode!: ConvertTiendanubeOrderMode;

  // Ambos modos mueven stock real.
  @IsUUID()
  warehouseId!: string;

  // Sólo INVOICE: qué Company-rol-BRANCH factura (resuelve el punto de
  // venta AFIP) - mismo campo que CreateSaleDto.branchId, no inferible del
  // pedido de Tiendanube.
  @ValidateIf((o: ConvertTiendanubeOrderDto) => o.mode === 'INVOICE')
  @IsUUID()
  branchId?: string;

  // Sólo INVOICE: A/B/C - depende de la condición fiscal del emisor y el
  // comprador, tampoco inferible del pedido.
  @ValidateIf((o: ConvertTiendanubeOrderDto) => o.mode === 'INVOICE')
  @IsEnum(DocumentLetter)
  documentLetter?: DocumentLetter;
}
