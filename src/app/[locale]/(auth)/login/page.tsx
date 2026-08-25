import { Suspense } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { EmailAuthForm } from '@/components/auth/email-auth-form';
import { Separator } from '@/components/ui/separator';

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <div className="flex flex-col items-center">
      {/* Logo */}
      <div className="mb-6">
        <Image
          src="/logo.png"
          alt="职爪"
          width={56}
          height={56}
          className="rounded-xl drop-shadow-sm"
        />
      </div>

      {/* Heading */}
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {t('welcomeBack')}
      </h1>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        {t('loginDescription')}
      </p>

      {/* Divider */}
      <Separator className="my-6" />

      {/* Auth form */}
      <Suspense fallback={null}>
        <EmailAuthForm />
      </Suspense>

      {/* Terms */}
      <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        {t('agreeTerms')}
      </p>
    </div>
  );
}
