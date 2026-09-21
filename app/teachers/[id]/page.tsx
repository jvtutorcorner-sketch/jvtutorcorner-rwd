import React from 'react';
import type { Metadata } from 'next';
import { ServerT } from '@/components/IntlProvider';
import Link from 'next/link';
import TeacherEditButton from '@/components/auth/TeacherEditButton';
import AutoTranslateText from '@/components/AutoTranslateText';
import { pageOpenGraph, toMetaDescription } from '@/lib/seo';
import { getTeacherById } from '../_data';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const canonical = `/teachers/${encodeURIComponent(id)}`;
  const teacher = await getTeacherById(id);

  if (!teacher) {
    return {
      title: '找不到老師',
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const name = String(teacher.name || teacher.displayName || '老師');
  const subjects = Array.isArray(teacher.subjects) ? teacher.subjects.join(' · ') : '';
  const title = subjects ? `${name}（${subjects}）` : name;
  const description = toMetaDescription(teacher.intro) || toMetaDescription(`${name} 的線上家教課程：${subjects}`);

  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: pageOpenGraph({ title, description, url: canonical, type: 'profile' }),
  };
}

export default async function TeacherDetailPage({ params }: { params: any }) {
  const { id } = await params;

  const teacher = await getTeacherById(id);

  if (!teacher) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2><ServerT k="teacher_not_found_title" /></h2>
        <Link href="/teachers"><ServerT k="teacher_not_found_back_link" /></Link>
      </div>
    );
  }

  return (
    <main style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>

      <div style={{ display: 'flex', gap: '32px', marginTop: '24px', flexWrap: 'wrap' }}>
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          style={{ width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <div style={{ flex: 1 }}>
          <h1><AutoTranslateText text={teacher.name} as="span" /></h1>
          <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '8px' }}>
            <AutoTranslateText text={(teacher.subjects || []).join(' · ')} as="span" />
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '16px 0' }}>
            {(teacher.languages || []).map((lang: string) => (
              <span key={lang} style={{ background: '#f3f4f6', padding: '4px 12px', borderRadius: '16px', fontSize: '14px' }}>
                <AutoTranslateText text={lang} as="span" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '24px', background: '#f9fafb', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '16px' }}>
          <ServerT k="about_teacher_title" />
        </h3>
        <AutoTranslateText text={teacher.intro} as="p" style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }} />
      </div>

    </main>
  );
}
