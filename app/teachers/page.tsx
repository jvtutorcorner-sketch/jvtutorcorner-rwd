// app/teachers/page.tsx
import { TEACHERS } from '@/data/teachers';
import { TeacherCard } from '@/components/TeacherCard';
import SearchForm from '@/components/SearchForm';

type TeachersPageProps = {
  searchParams?: {
    subject?: string;
    language?: string;
    region?: string;
    mode?: string;
    teacher?: string;
  };
};

export default function TeachersPage({ searchParams }: TeachersPageProps) {
  const teacher = (searchParams?.teacher ?? '').trim().toLowerCase();
  const language = (searchParams?.language ?? '').trim().toLowerCase();
  const region = (searchParams?.region ?? '').trim().toLowerCase();
  // mode 目前沒有用在老師資料上
  // const mode = searchParams?.mode ?? '';

  const filtered = TEACHERS.filter((t) => {
    if (teacher && !t.name.toLowerCase().includes(teacher)) return false;
    if (language) {
      const ok = t.languages.some((l) => l.toLowerCase().includes(language));
      if (!ok) return false;
    }
    if (region) {
      if (!t.location.toLowerCase().includes(region)) return false;
    }
    return true;
  });

  const hasFilter = Boolean(teacher || language || region);

  // build option lists from TEACHERS data
  const subjectOptions = Array.from(
    new Set(TEACHERS.flatMap((t) => t.subjects))
  ).sort();

  const languageOptions = Array.from(
    new Set(TEACHERS.flatMap((t) => t.languages))
  ).sort();

  const regionOptions = Array.from(
    new Set(
      TEACHERS.flatMap((t) =>
        t.location.split('/').map((s) => s.trim())
      )
    )
  ).sort();

  return (
    <div className="page">
      <header className="page-header">
        <h1>所有老師</h1>
        {hasFilter ? (
          <p>目前顯示符合條件的老師，共 {filtered.length} 位。</p>
        ) : (
          <p>依照科目、語言與時薪，找到最適合你的老師。</p>
        )}
      </header>

      {/* 搜尋表單（移到專業師資頁面） */}
      <section className="section">
        <SearchForm
          initial={{ teacher, language, region }}
          targetPath="/teachers"
          subjectOptions={subjectOptions}
          languageOptions={languageOptions}
          regionOptions={regionOptions}
        />
      </section>

      <section className="section">
        {filtered.length === 0 ? (
          <p>目前沒有符合篩選條件的老師，請調整搜尋條件再試試。</p>
        ) : (
          <div className="card-grid">
            {filtered.map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
