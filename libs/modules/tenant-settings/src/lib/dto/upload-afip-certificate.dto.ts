import { AfipEnvironment } from '@plexo/database';
import { IsEnum, IsString, MinLength } from 'class-validator';

/**
 * certPem/keyPem are pasted-in PEM text (same content AFIP_CERT_PATH/
 * AFIP_KEY_PATH used to point at on disk), not a binary file upload - the
 * frontend reads the .crt/.key file as text (FileReader) and sends its
 * contents here. No file-storage infra involved on purpose: these are
 * secrets, so the only place they land is encrypted in Postgres (see
 * TenantSettingsService.uploadAfipCertificate), never a shared disk path.
 */
export class UploadAfipCertificateDto {
  @IsString()
  @MinLength(1)
  certPem!: string;

  @IsString()
  @MinLength(1)
  keyPem!: string;

  @IsEnum(AfipEnvironment)
  env!: AfipEnvironment;
}
