const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;

interface CodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

const store = new Map<string, CodeEntry>();

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function saveCode(email: string, code: string): void {
  const now = Date.now();
  store.set(email, { code, expiresAt: now + CODE_TTL_MS, lastSentAt: now });
}

export function canResend(email: string): boolean {
  const entry = store.get(email);
  if (!entry) return true;
  return Date.now() - entry.lastSentAt >= RESEND_INTERVAL_MS;
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'missing';

export function verifyCode(email: string, code: string): VerifyResult {
  const entry = store.get(email);
  if (!entry) return 'missing';
  if (Date.now() > entry.expiresAt) {
    store.delete(email);
    return 'expired';
  }
  if (entry.code !== code) return 'invalid';
  store.delete(email);
  return 'ok';
}
