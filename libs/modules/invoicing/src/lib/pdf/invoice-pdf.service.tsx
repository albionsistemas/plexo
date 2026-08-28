import { Injectable } from '@nestjs/common';
import type { InvoicePdfFormat } from '@plexo/database';
import { renderToBuffer } from '@react-pdf/renderer';
import type { InvoicePdfData } from './pdf-data.js';
import { ArcaTemplate } from './templates/arca.js';
import { TicketTemplate } from './templates/ticket.js';

/** A diferencia de PdfGeneratorService (Compras/Cotizaciones, 5 estilos
 * visuales libres), acá el diseño es uno solo fiel al formato real de
 * ARCA - lo que se elige es el tamaño de papel (A4/A5 comparten el mismo
 * template, TICKET es un layout angosto propio), no el estilo. */
@Injectable()
export class InvoicePdfService {
  async generate(format: InvoicePdfFormat, data: InvoicePdfData): Promise<Buffer> {
    return renderToBuffer(this.pickTemplate(format, data));
  }

  private pickTemplate(format: InvoicePdfFormat, data: InvoicePdfData) {
    switch (format) {
      case 'A4':
        return <ArcaTemplate data={data} pageSize="A4" />;
      case 'A5':
        return <ArcaTemplate data={data} pageSize="A5" />;
      case 'TICKET':
        return <TicketTemplate data={data} />;
    }
  }
}
