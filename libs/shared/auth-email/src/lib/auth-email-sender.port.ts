export interface SendVerificationCodePayload {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export interface SendPasswordResetLinkPayload {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface SendInvitationPayload {
  to: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
  expiresInMinutes: number;
}

/**
 * Mismo patrón puerto/adaptador que EmailSender de Facturación
 * (libs/modules/invoicing/src/lib/email-sender.port.ts) - SignupService y
 * AuthService dependen de esta interfaz, no de la clase concreta.
 */
export interface AuthEmailSender {
  sendVerificationCode(payload: SendVerificationCodePayload): Promise<void>;
  sendPasswordResetLink(payload: SendPasswordResetLinkPayload): Promise<void>;
  sendInvitation(payload: SendInvitationPayload): Promise<void>;
}

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');
