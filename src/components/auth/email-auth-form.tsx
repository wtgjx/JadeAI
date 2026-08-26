'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TabValue = 'login' | 'register';

/** 确保回调路径带 locale 前缀（路由是 /[locale]/dashboard 形式）。 */
function normalizeCallback(raw: string | null, locale: string): string {
  const path = raw && !raw.startsWith('/') ? `/${raw}` : raw;
  if (!path) return `/${locale}/dashboard`;
  if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return path;
  if (path.startsWith('/zh/') || path.startsWith('/en/')) return path;
  return `/${locale}${path}`;
}

export function EmailAuthForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = pathname.match(/^\/(zh|en)/)?.[1] || 'zh';
  const callbackUrl = normalizeCallback(searchParams.get('callbackUrl'), locale);

  const [tab, setTab] = useState<TabValue>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function switchTab(value: string) {
    setTab(value as TabValue);
    setError(null);
    setInfo(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError(t('loginFailed'));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError(t('loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode() {
    const emailTrim = email.trim();
    if (!emailTrim) {
      setError('请先填写邮箱');
      return;
    }
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrim }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setCountdown(60);
        setInfo('验证码已发送，请查收邮箱');
      } else if (data.error === 'too_frequent') {
        setError('发送太频繁，请稍后再试');
      } else if (data.error === 'invalid_email') {
        setError('邮箱格式不正确');
      } else {
        setError('验证码发送失败，请稍后再试');
      }
    } catch {
      setError('验证码发送失败，请稍后再试');
    } finally {
      setSending(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined, code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setInfo(t('registerSuccess'));
        setTab('login');
      } else if (res.status === 409 || data.error === 'account_exists') {
        setError(t('accountExists'));
      } else if (data.error === 'invalid_email') {
        setError(t('invalidEmail'));
      } else if (data.error === 'password_too_short') {
        setError(t('passwordTooShort'));
      } else if (data.error === 'invalid_code') {
        setError('验证码错误');
      } else if (data.error === 'code_expired') {
        setError('验证码已过期，请重新获取');
      } else if (data.error === 'code_required') {
        setError('请先获取验证码');
      } else {
        setError(t('loginFailed'));
      }
    } catch {
      setError(t('loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'h-11 rounded-xl border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          <TabsTrigger value="login" className="rounded-lg text-sm font-medium">
            {t('loginTab')}
          </TabsTrigger>
          <TabsTrigger value="register" className="rounded-lg text-sm font-medium">
            {t('registerTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <form onSubmit={handleLogin} className="mt-4 space-y-3">
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full cursor-pointer rounded-xl bg-brand text-sm font-medium shadow-sm transition-colors hover:bg-brand-hover"
            >
              {loading ? t('loggingIn') : t('login')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="register">
          <form onSubmit={handleRegister} className="mt-4 space-y-3">
            <Input
              type="text"
              autoComplete="name"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <div className="flex gap-2">
              <Input
                type="text"
                required
                autoComplete="one-time-code"
                placeholder="验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
              />
              <Button
                type="button"
                variant="outline"
                disabled={sending || countdown > 0}
                onClick={handleSendCode}
                className="h-11 w-32 shrink-0 cursor-pointer"
              >
                {sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '发送验证码'}
              </Button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {info && <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full cursor-pointer rounded-xl bg-brand text-sm font-medium shadow-sm transition-colors hover:bg-brand-hover"
            >
              {loading ? t('registering') : t('register')}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
