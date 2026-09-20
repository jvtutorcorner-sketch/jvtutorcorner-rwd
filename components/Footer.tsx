'use client';
// components/Footer.tsx
/**
 * 全站頁尾：取代 app/layout.tsx 原本的單行 © 頁尾。
 * 提供學生／老師兩條路徑的次要導覽，以及公司資訊連結。
 */
import Link from 'next/link';
import { useT } from './IntlProvider';

export default function Footer() {
  const t = useT();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer home-footer" suppressHydrationWarning>
      <div className="home-footer-inner">
        <div className="home-footer-brand">
          <Link href="/" className="home-footer-logo">JV Tutor Corner</Link>
          <p className="home-footer-tagline">{t('footer_tagline')}</p>
        </div>

        <nav className="home-footer-cols" aria-label={t('footer_nav_label')}>
          <div className="home-footer-col">
            <h3 className="home-footer-col-title">{t('footer_learn')}</h3>
            <Link href="/courses">{t('menu_courses')}</Link>
            <Link href="/teachers">{t('menu_teachers')}</Link>
            <Link href="/pricing">{t('menu_pricing')}</Link>
          </div>
          <div className="home-footer-col">
            <h3 className="home-footer-col-title">{t('footer_teach')}</h3>
            <Link href="/login/register?role=teacher">{t('become_teacher_button')}</Link>
            <Link href="/#how-it-works">{t('menu_how_it_works')}</Link>
          </div>
          <div className="home-footer-col">
            <h3 className="home-footer-col-title">{t('footer_about')}</h3>
            <Link href="/about">{t('menu_about')}</Link>
            <Link href="/testimony">{t('menu_testimony')}</Link>
            <Link href="/terms">{t('footer_terms')}</Link>
          </div>
        </nav>
      </div>
      <div className="home-footer-bottom">© {year} JV Tutor Corner</div>
    </footer>
  );
}
