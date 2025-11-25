// app/students/page.tsx
import { STUDENTS } from '@/data/students';

export default function StudentsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>學生專區</h1>
        <p>未來可顯示個人課表、預約紀錄與推薦課程。</p>
      </header>

      <section className="section">
        <table className="table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>學習階段</th>
              <th>學習目標</th>
              <th>偏好科目</th>
            </tr>
          </thead>
          <tbody>
            {STUDENTS.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.level}</td>
                <td>{s.goals.join('、')}</td>
                <td>{s.preferredSubjects.join('、')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

