import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TEACHERS, type Teacher } from '@/data/teachers';
import { COURSES } from '@/data/courses';
import TeacherDashboard from '@/components/TeacherDashboard';
import { promises as fs } from 'fs';
import path from 'path';

type Props = { params: { id: string } };

export default async function TeacherPage({ params }: Props) {
  const id = params?.id ? decodeURIComponent(params.id) : '';

  // If no id was provided, avoid rendering an empty-detail page — redirect to the teachers list.
  if (!id) {
    redirect('/teachers');
  }

  // Normalize incoming id/name for robust matching (trim + case-insensitive)
  const idNorm = String(id).trim().toLowerCase();

  // Try find by id first; if not present try matching by name (case-insensitive, trimmed)
  let teacher: Teacher | undefined = TEACHERS.find((t) => {
    const tid = String(t.id || '').trim().toLowerCase();
    const tname = String(t.name || '').trim().toLowerCase();
    return tid === idNorm || tname === idNorm;
  });

  // Fallback: if not found in bundled data, try reading local fallback file (.local_data/teachers.json)
  if (!teacher) {
    try {
      const localPath = path.resolve(process.cwd(), '.local_data/teachers.json');
      const raw = await fs.readFile(localPath, 'utf8');
      const arr = JSON.parse(raw) as Array<Record<string, any>>;
      teacher = arr.find((t) => {
        const tid = String(t.id || '').trim().toLowerCase();
        const tname = String(t.name || '').trim().toLowerCase();
        return tid === idNorm || tname === idNorm;
      }) as Teacher | undefined;
      // If found, we can continue rendering with that teacher
    } catch (e) {
      // ignore — file not present or parse error
    }
  }

  if (!teacher) {
    return (
      <div className="page">
        <h1>找不到老師</h1>
        <p>抱歉，我們找不到該位老師（ID: {id || '<空>'}）。</p>
        <p className="muted">請確認網址是否正確，或從下方師資列表選擇老師：</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {TEACHERS.map((t) => (
            <Link key={t.id} href={`/teachers/${encodeURIComponent(String(t.id))}`} className="card card-link">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={t.avatarUrl} alt={t.name} style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover' }} />
                <div>
                  <strong>{t.name}</strong>
                  <div className="muted">{t.subjects.join(' · ')} ｜ NT$ {t.hourlyRate}/時</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <Link href="/teachers">回到完整師資列表</Link>
        </div>
      </div>
    );
  }

  const teacherCourses = COURSES.filter((c) => c.teacherName === teacher.name);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{teacher.name}</h1>
        <p className="muted">{teacher.subjects.join(' · ')} ｜ {teacher.location}</p>
      </header>

      <section className="section">
        <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <img src={teacher.avatarUrl} alt={teacher.name} style={{ width: 160, height: 160, borderRadius: 8, objectFit: 'cover' }} />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>{teacher.name}</h2>
                <div className="muted">⭐ {teacher.rating.toFixed(1)} • NT$ {teacher.hourlyRate}/時</div>
              </div>
              <div>
                <Link
                  href={
                    teacher.id
                      ? `/teachers/${encodeURIComponent(String(teacher.id))}/book`
                      : `/teachers?teacher=${encodeURIComponent(String(teacher.name))}`
                  }
                  className="card-button primary"
                >預約此老師</Link>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <h3>自我介紹</h3>
              <p>{teacher.intro}</p>

              <h4>授課科目</h4>
              <p>{teacher.subjects.join('、')}</p>

              <h4>語言</h4>
              <p>{teacher.languages.join('、')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Teacher dashboard (client-side) for owners/admins */}
      <section className="section">
        <TeacherDashboard teacherId={(teacher as any).id || ''} teacherName={teacher.name} />
      </section>

      <section className="section">
        <h2>該老師的課程</h2>
        {teacherCourses.length === 0 ? (
          <p className="muted">目前沒有公開課程。</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {teacherCourses.map((c) => (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{c.title}</h3>
                    <p className="muted">{c.subject} • {c.level} • {c.language}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p className="muted">NT$ {c.pricePerSession}</p>
                    <Link href={`/courses/${c.id}`} className="card-button secondary">查看課程</Link>
                  </div>
                </div>
                <p style={{ marginTop: 8 }}>{c.description}</p>
              </div>
            ))}
          </div>

        )}
      </section>
    </div>
  );
}
