import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateQuotePreferencesDto } from './dto/update-quote-preferences.dto.js';
import { QuotePreferencesService } from './quote-preferences.service.js';

@Controller('quotes/preferences')
export class QuotePreferencesController {
  constructor(private readonly preferencesService: QuotePreferencesService) {}

  @Get()
  getPreferences() {
    return this.preferencesService.getPreferences();
  }

  @Patch()
  updatePreferences(@Body() dto: UpdateQuotePreferencesDto) {
    return this.preferencesService.updatePreferences(dto);
  }
}
