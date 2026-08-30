import { IsIn, IsUUID } from 'class-validator';

export class CreatePaymentLinkDto {
  @IsIn(['INVOICE', 'QUOTE'])
  documentType!: 'INVOICE' | 'QUOTE';

  @IsUUID()
  documentId!: string;
}
