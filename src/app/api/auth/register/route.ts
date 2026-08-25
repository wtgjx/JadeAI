import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { createSampleResume } from '@/lib/db/sample-resume';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'account_exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userRepository.create({
    email,
    name,
    passwordHash,
    authType: 'credentials',
  });
  if (!user) {
    return NextResponse.json({ error: 'registration_failed' }, { status: 500 });
  }

  await createSampleResume(user.id);
  return NextResponse.json({ ok: true });
}
