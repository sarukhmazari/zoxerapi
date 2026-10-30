/**
 * Zoxer Media API - Safe Logger
 * Enforces sanitization of authorization tokens and sensitive data in logs
 */

export class SafeLogger {
  private static sanitize(message: string, secrets: string[] = []): string {
    let sanitized = message;
    
    // Mask Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    // Mask API keys in URL query params
    sanitized = sanitized.replace(/(key|token|secret|api_key|access_token)=([^&]+)/gi, '$1=[REDACTED]');
    
    // Mask any known secret values if passed
    for (const secret of secrets) {
      if (secret && secret.length > 4) {
        sanitized = sanitized.replaceAll(secret, '[REDACTED_SECRET]');
      }
    }

    return sanitized;
  }

  static info(message: string, meta?: Record<string, unknown>, secrets: string[] = []): void {
    const sanitizedMsg = this.sanitize(message, secrets);
    console.log(JSON.stringify({ level: 'info', message: sanitizedMsg, ...meta, timestamp: new Date().toISOString() }));
  }

  static warn(message: string, meta?: Record<string, unknown>, secrets: string[] = []): void {
    const sanitizedMsg = this.sanitize(message, secrets);
    console.warn(JSON.stringify({ level: 'warn', message: sanitizedMsg, ...meta, timestamp: new Date().toISOString() }));
  }

  static error(message: string, error?: unknown, meta?: Record<string, unknown>, secrets: string[] = []): void {
    const sanitizedMsg = this.sanitize(message, secrets);
    const errObj = error instanceof Error 
      ? { name: error.name, message: this.sanitize(error.message, secrets) }
      : error;
    console.error(JSON.stringify({ level: 'error', message: sanitizedMsg, error: errObj, ...meta, timestamp: new Date().toISOString() }));
  }
}
