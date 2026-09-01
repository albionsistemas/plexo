export type CashflowLineItemType = 'INVOICE' | 'CHECK';
export type CashflowFlowDirection = 'INFLOW' | 'OUTFLOW';

export interface CashflowLineItem {
  id: string;
  type: CashflowLineItemType;
  /** Número de factura o de cheque, según `type`. */
  reference: string;
  counterparty: string | null;
  /** Fecha de vencimiento real del comprobante/cheque - puede caer antes
   * de `weekStart` si estaba vencido y se agrupó en la primera semana
   * (ver CashflowProjectionService), o ser null si nunca tuvo dueDate. */
  dueDate: string | null;
  amount: number;
}

export interface CashflowWeekBucket {
  weekStart: string;
  weekEnd: string;
  inflows: number;
  outflows: number;
  netChange: number;
  /** Saldo acumulado al cierre de esta semana (disponibilidad inicial +
   * todo lo entrado/salido hasta acá inclusive). */
  projectedBalance: number;
  invoiceInflows: CashflowLineItem[];
  checkInflows: CashflowLineItem[];
  invoiceOutflows: CashflowLineItem[];
  checkOutflows: CashflowLineItem[];
}

export interface CashflowProjection {
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  closingBalance: number;
  /** true si `projectedBalance` cae por debajo de cero en algún cierre de
   * semana - la UI lo usa para resaltar el gráfico, no cambia el cálculo. */
  hasNegativeWeek: boolean;
  weeks: CashflowWeekBucket[];
}
