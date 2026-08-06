// `passport-microsoft` ships no type declarations of its own (confirmed:
// no .d.ts anywhere in node_modules/passport-microsoft). Minimal self-
// contained shim covering only what microsoft.strategy.ts actually uses -
// not a full re-typing of the package, and deliberately not importing
// passport-oauth2's own types (that package uses `export =`, which adds
// interop friction not worth it for this one small shim). Based on reading
// node_modules/passport-microsoft/lib/strategy.js directly.
declare module 'passport-microsoft' {
  export interface Profile {
    provider: 'microsoft';
    id: string;
    displayName?: string;
    name?: { familyName?: string; givenName?: string };
    userPrincipalName?: string;
    emails?: { type: string; value: string }[];
    _raw: string;
    _json: unknown;
  }

  export interface MicrosoftStrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    tenant?: string;
    scope?: string[];
  }

  export type VerifyCallback = (err?: Error | null, user?: unknown) => void;

  export class Strategy {
    constructor(
      options: MicrosoftStrategyOptions,
      verify: (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => void,
    );
    name: string;
  }
}
