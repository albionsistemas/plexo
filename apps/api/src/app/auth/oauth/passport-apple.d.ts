// `passport-apple` ships no type declarations of its own, and the
// DefinitelyTyped ones (@types/passport-apple) use `export =` against
// passport-oauth2's own `export =` types - same interop friction already
// avoided for passport-microsoft, same fix: a minimal self-contained shim,
// not a full re-typing. Based on reading node_modules/passport-apple/src/
// strategy.js directly.
//
// Two Apple-specific quirks this shim exists to type correctly:
//   - `idToken` (4th verify arg) is the RAW encoded id_token JWT string -
//     the caller must jwt.decode() it themselves (see AppleStrategy).
//   - Apple only ever sends the user's name via `req.body.user` (a JSON
//     string), and only on the very first authorization ever - the
//     strategy parses it onto `req.appleProfile` for the same request's
//     validate() call to read (see Strategy.prototype.authenticate in the
//     package source).
declare module 'passport-apple' {
  export interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    callbackURL: string;
    privateKeyString?: string;
    privateKeyLocation?: string;
    passReqToCallback?: boolean;
    scope?: string[];
  }

  export type VerifyCallback = (err?: Error | null, user?: unknown) => void;

  export type VerifyFunctionWithRequest = (
    req: { appleProfile?: { name?: { firstName?: string; lastName?: string } } },
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: unknown,
    done: VerifyCallback,
  ) => void;

  export class Strategy {
    constructor(options: AppleStrategyOptions, verify: VerifyFunctionWithRequest);
    name: string;
  }
}
