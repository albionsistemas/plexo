import type { ReminderTone } from '@plexo/database';
import type { OverdueAlertEmailPayload } from './email-sender.port.js';

type OverdueCopyInput = Pick<OverdueAlertEmailPayload, 'invoiceNumber' | 'dueDate' | 'balanceDue'>;

/**
 * The 3 tenant-selectable wordings for the overdue-reminder email
 * (tenant.reminderTone, see @plexo/tenant-settings) - NEUTRAL is the
 * default and matches the copy this app sent before tone became
 * configurable, so a tenant that never touches the setting sees no
 * change. Only the reminder email has a tone; the invoice-issued email
 * doesn't (per the original request - tone is about how firmly to ask for
 * an overdue payment, not about invoicing in general).
 */
export function buildOverdueEmailCopy(
  tone: ReminderTone | undefined,
  { invoiceNumber, dueDate, balanceDue }: OverdueCopyInput,
): { subject: string; text: string } {
  switch (tone) {
    case 'FRIENDLY':
      return {
        subject: `Recordatorio: tu factura ${invoiceNumber} está pendiente`,
        text: `¡Hola! Te escribimos para recordarte que la factura ${invoiceNumber} venció el ${dueDate} y todavía figura un saldo pendiente de $${balanceDue}. Si ya la pagaste, ¡genial, podés ignorar este mensaje! Caso contrario, te agradecemos que puedas regularizarla cuando puedas.`,
      };
    case 'FIRM':
      return {
        subject: `Aviso de pago pendiente - Factura ${invoiceNumber} vencida`,
        text: `La factura ${invoiceNumber} se encuentra vencida desde el ${dueDate}, con un saldo pendiente de $${balanceDue}. Te pedimos que regularices el pago a la brevedad para evitar inconvenientes.`,
      };
    case 'NEUTRAL':
    default:
      return {
        subject: `Factura ${invoiceNumber} vencida`,
        text: `Tu factura ${invoiceNumber} está vencida desde el ${dueDate}. Saldo pendiente: $${balanceDue}. Por favor, regularizá el pago a la brevedad.`,
      };
  }
}
