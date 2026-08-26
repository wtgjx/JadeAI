'use client';

import dynamic from 'next/dynamic';

const AptitudeApp = dynamic(
  () => import('@/components/aptitude/aptitude-app').then((m) => m.default),
  { ssr: false },
);

export default function AptitudePage() {
  return <AptitudeApp />;
}
