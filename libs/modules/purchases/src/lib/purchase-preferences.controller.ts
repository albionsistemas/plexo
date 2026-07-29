import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdatePurchasePreferencesDto } from './dto/update-purchase-preferences.dto.js';
import { PurchasePreferencesService } from './purchase-preferences.service.js';

@Controller('purchases/preferences')
export class PurchasePreferencesController {
  constructor(private readonly preferencesService: PurchasePreferencesService) {}

  @Get()
  getPreferences() {
    return this.preferencesService.getPreferences();
  }

  @Patch()
  updatePreferences(@Body() dto: UpdatePurchasePreferencesDto) {
    return this.preferencesService.updatePreferences(dto);
  }
}
