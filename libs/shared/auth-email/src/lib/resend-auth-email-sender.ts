import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  AuthEmailSender,
  SendPasswordResetLinkPayload,
  SendVerificationCodePayload,
} from './auth-email-sender.port.js';
import { buildVerificationEmailCopy } from './verification-email-template.js';

/** Real sender, wired in sólo cuando RESEND_API_KEY está seteado (ver
 * AuthEmailModule) - mismo criterio que ResendEmailSender de Facturación.
 * Fallos se loguean, no se propagan: un signup/reset no debe fallar porque
 * el mail rebotó, el código/token ya quedó persistido y puede reenviarse. */
@Injectable()
export class ResendAuthEmailSender implements AuthEmailSender {
  private readonly logger = new Logger(ResendAuthEmailSender.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async sendVerificationCode(payload: SendVerificationCodePayload): Promise<void> {
    const { subject, html, text } = buildVerificationEmailCopy({
      code: payload.code,
      expiresInMinutes: payload.expiresInMinutes,
    });
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject,
      html,
      text,
    });

    if (error) {
      this.logger.error(`Failed to email verification code to ${payload.to}: ${error.message}`);
    }
  }

  async sendPasswordResetLink(payload: SendPasswordResetLinkPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject: 'Recuperar tu contraseña de Plexo',
      text: `Para elegir una contraseña nueva, entrá a ${payload.resetUrl}. El link expira en ${payload.expiresInMinutes} minutos. Si no pediste esto, ignorá este mensaje.`,
    });

    if (error) {
      this.logger.error(`Failed to email password reset link to ${payload.to}: ${error.message}`);
    }
  }
}
