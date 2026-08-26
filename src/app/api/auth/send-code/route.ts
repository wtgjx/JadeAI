import { NextResponse } from 'next/server';
import { isRateLimited } from '@/lib/rate-limit';
import { generateCode, saveCode, canResend } from '@/lib/verification-code';
import { sendVerificationCodeMail } from '@/lib/mail/send';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(`sendcode:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (!canResend(email)) {
    return NextResponse.json({ error: 'too_frequent' }, { status: 429 });
  }

  const code = generateCode();
  saveCode(email, code);
  try {
    await sendVerificationCodeMail(email, code);
  } catch (err) {
    console.error('[send-code] failed to send email:', err);
    return NextResponse.json({ error: 'send_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
