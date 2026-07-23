import { EmailSenderMode, ReminderTone } from '@plexo/database';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * arReminderIntervalDays is nullable on purpose (null = off, the original
 * one-time-alert behavior) - ValidateIf skips IsInt/Min entirely when the
 * value is null, but still enforces them when a number is sent. Omitting
 * the field entirely (undefined) is also allowed - a PATCH that doesn't
 * mention it shouldn't be forced to explicitly repeat the current value.
 *
 * emailCustomDomain/resendDomainId/domainStatus are deliberately NOT here -
 * they only ever get written atomically by registerCustomDomain/
 * refreshDomainStatus (see TenantSettingsService), never by this generic
 * PATCH, so a domain name can never end up saved without actually being
 * registered with Resend.
 */
export class UpdateTenantSettingsDto {
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  arReminderIntervalDays?: number | null;

  @IsOptional()
  @IsEnum(EmailSenderMode)
  emailSenderMode?: EmailSenderMode;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  emailFromName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._%+-]+$/, {
    message: 'emailFromLocalPart sólo admite letras, números y ._%+-',
  })
  @MaxLength(64)
  emailFromLocalPart?: string;

  @IsOptional()
  @IsEnum(ReminderTone)
  reminderTone?: ReminderTone;

  /** null clears it (no CC sent); omitting the field leaves the stored
   * value untouched, same convention as arReminderIntervalDays. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail()
  reminderCcEmail?: string | null;
}
