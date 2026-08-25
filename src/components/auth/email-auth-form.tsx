'use client';

import { useState } from 'react';
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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
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
