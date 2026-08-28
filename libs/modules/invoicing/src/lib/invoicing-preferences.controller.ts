import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateInvoicingPreferencesDto } from './dto/update-invoicing-preferences.dto.js';
import { InvoicingPreferencesService } from './invoicing-preferences.service.js';

@Controller('invoicing/preferences')
export class InvoicingPreferencesController {
  constructor(private readonly preferencesService: InvoicingPreferencesService) {}

  @Get()
  getPreferences() {
    return this.preferencesService.getPreferences();
  }

  @Patch()
  updatePreferences(@Body() dto: UpdateInvoicingPreferencesDto) {
    return this.preferencesService.updatePreferences(dto);
  }
}
