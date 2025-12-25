"use client";

import Link from 'next/link';
import { useT } from '@/components/IntlProvider';

export default function NotFound() {
  const t = useT();

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>404 - {t('page_not_found_title') || 'Page Not Found'}</h1>
      <p>{t('page_not_found_message') || 'The page you are looking for does not exist.'}</p>
      <Link href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        {t('go_back_home') || 'Go back to Home'}
      </Link>
    </div>
  );
}