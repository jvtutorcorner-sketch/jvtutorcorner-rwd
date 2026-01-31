"use client";

import React, { useState } from 'react';
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';
import { useT } from '@/components/IntlProvider';
import SearchForm from '@/components/SearchForm';
import PageBreadcrumb from '@/components/PageBreadcrumb';

export default function TeachersPage() {
  const t = useT();
  const [filteredTeachers, setFilteredTeachers] = useState(TEACHERS);

  // In a real app, filtering would happen based on query params or via the search component
  // For this mock, we just show all. 
  
  return (
    <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageBreadcrumb />
      <h1 style={{ marginBottom: '24px' }}>{t('menu_teachers')}</h1>
      
      <section style={{ marginBottom: '32px' }}>
        <SearchForm targetPath="/teachers" />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {filteredTeachers.map(teacher => (
          <TeacherCard key={teacher.id} teacher={teacher} />
        ))}
      </div>
      
      {filteredTeachers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
          目前沒有符合條件的老師。
        </div>
      )}
    </main>
  );
}
