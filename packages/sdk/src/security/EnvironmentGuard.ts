/**
 * Minimal environment detection for security enforcement
 */
export class EnvironmentGuard {
  private static _isProduction: boolean | null = null;

  static isProduction(): boolean {
    if (this._isProduction !== null) {return this._isProduction;}

    this._isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.AGENTKIT_ENV === 'production';

    return this._isProduction;
  }

  static canDisableSandbox(): boolean {
    return !this.isProduction() &&
           (process.env.AGENTKIT_UNSAFE_SANDBOX === 'true' ||
            process.env.AGENTKIT_ALLOW_UNSAFE === 'true' ||
            process.env.NODE_ENV === 'test');
  }
}