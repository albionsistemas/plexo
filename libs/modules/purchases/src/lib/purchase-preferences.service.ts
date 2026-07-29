import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId, type PdfStyle } from '@plexo/database';
import type { UpdatePurchasePreferencesDto } from './dto/update-purchase-preferences.dto.js';

export interface PurchasePreferencesView {
  quoteRequestPrefix: string;
  quoteRequestNextNumber: number;
  purchaseOrderPrefix: string;
  purchaseOrderNextNumber: number;
  purchaseDocumentPdfStyle: PdfStyle;
}

/** Personal preferences for the current user (numbering prefixes + default
 * PDF style) - same "GET/PATCH on the authenticated user, no id in the
 * route" shape as /auth/me. */
@Injectable()
export class PurchasePreferencesService {
  async getPreferences(): Promise<PurchasePreferencesView> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        quoteRequestPrefix: true,
        quoteRequestNextNumber: true,
        purchaseOrderPrefix: true,
        purchaseOrderNextNumber: true,
        purchaseDocumentPdfStyle: true,
      },
    });
    return user;
  }

  async updatePreferences(dto: UpdatePurchasePreferencesDto): Promise<PurchasePreferencesView> {
    const userId = requireUserId();
    return getTenantDb().user.update({
      where: { id: userId },
      data: {
        quoteRequestPrefix: dto.quoteRequestPrefix,
        purchaseOrderPrefix: dto.purchaseOrderPrefix,
        purchaseDocumentPdfStyle: dto.purchaseDocumentPdfStyle,
      },
      select: {
        quoteRequestPrefix: true,
        quoteRequestNextNumber: true,
        purchaseOrderPrefix: true,
        purchaseOrderNextNumber: true,
        purchaseDocumentPdfStyle: true,
      },
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
