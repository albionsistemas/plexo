import { Injectable } from '@nestjs/common';

export interface OAuthProvidersStatus {
  google: boolean;
  microsoft: boolean;
}

/**
 * Single place that decides "is provider X usable right now" - both the
 * strategies (to fail fast with a clear error instead of a confusing OAuth
 * redirect loop) and the public GET /auth/oauth/providers endpoint (so the
 * frontend can render the buttons disabled instead of letting a click 400)
 * read from here, never straight from process.env at the call site.
 */
@Injectable()
export class OAuthConfigService {
  isGoogleConfigured(): boolean {
    return Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']);
  }

  isMicrosoftConfigured(): boolean {
    return Boolean(process.env['MICROSOFT_CLIENT_ID'] && process.env['MICROSOFT_CLIENT_SECRET']);
  }

  getProviders(): OAuthProvidersStatus {
    return { google: this.isGoogleConfigured(), microsoft: this.isMicrosoftConfigured() };
  }
}
