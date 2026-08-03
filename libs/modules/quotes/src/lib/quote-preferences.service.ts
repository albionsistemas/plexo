import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, type PdfStyle } from '@plexo/database';
import type { UpdateQuotePreferencesDto } from './dto/update-quote-preferences.dto.js';

export interface QuotePreferencesView {
  quotePrefix: string;
  quoteNextNumber: number;
  quotePdfStyle: PdfStyle;
}

/** Personal preferences for the current user - same "GET/PATCH on the
 * authenticated user, no id in the route" shape as
 * PurchasePreferencesService. */
@Injectable()
export class QuotePreferencesService {
  async getPreferences(): Promise<QuotePreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { quotePrefix: true, quoteNextNumber: true, quotePdfStyle: true },
    });
  }

  async updatePreferences(dto: UpdateQuotePreferencesDto): Promise<QuotePreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.update({
      where: { id: userId },
      data: { quotePrefix: dto.quotePrefix, quotePdfStyle: dto.quotePdfStyle },
      select: { quotePrefix: true, quoteNextNumber: true, quotePdfStyle: true },
    });
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
