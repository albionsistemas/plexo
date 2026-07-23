import { IsInt, Min, ValidateIf } from 'class-validator';

/**
 * arReminderIntervalDays is nullable on purpose (null = off, the original
 * one-time-alert behavior) - ValidateIf skips IsInt/Min entirely when the
 * value is null, but still enforces them when a number is sent. Omitting
 * the field entirely (undefined) is also allowed - a PATCH that doesn't
 * mention it shouldn't be forced to explicitly repeat the current value.
 */
export class UpdateTenantSettingsDto {
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  arReminderIntervalDays?: number | null;
}
