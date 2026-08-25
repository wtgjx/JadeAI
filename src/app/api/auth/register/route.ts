import { NextResponse, after } from 'next/server';
import bcrypt from 'bcryptjs';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { createSampleResume } from '@/lib/db/sample-resume';
import { isRateLimited } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(`reg:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

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
  if (password.length < 8) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  try {
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

    // 样例简历在响应返回后异步创建（after 由平台保证执行完再冻结函数）：
    // 飞书 bitable 单次写入延迟 3~4s，若串行等待会把注册接口拖到 12s+。
    // 失败不阻断注册（账号已创建成功，dashboard 为空只影响观感）。
    after(async () => {
      try {
        await createSampleResume(user.id, { assumeNewUser: true });
      } catch (e) {
        console.error('[register] failed to create sample resume:', e);
      }
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'registration_failed' }, { status: 500 });
  }
}
