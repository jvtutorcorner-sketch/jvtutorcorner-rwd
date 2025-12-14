'use client';

import { useEffect, useState } from 'react';

export default function TeacherDashboard() {
  const [teacher, setTeacher] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);

  // 假資料（你後續可改成 API）
  useEffect(() => {
    // Teacher info
    setTeacher({
      firstName: 'Kai',
      lastName: 'Lin',
      nickname: 'DD0304許采銘',
      subjects: ['數學', '程式設計'],
      experience: '3 年教學經驗',
      avatar: null,
    });

    // Courses
    setCourses([
      {
        id: 'c1',
        title: '國中數學 一對一課程',
        price: 500,
        duration: 50,
        status: '上架中',
      },
      {
        id: 'c2',
        title: 'Python 程式入門班',
        price: 650,
        duration: 60,
        status: '上架中',
      },
    ]);

    // Bookings
    setBookings([
      {
        id: 'b1',
        student: 'Kevin Wu',
        course: '國中數學 一對一課程',
        date: '2025-12-15 19:00',
        status: '已預約',
      },
      {
        id: 'b2',
        student: 'Amy Lee',
        course: 'Python 程式入門班',
        date: '2025-12-20 14:00',
        status: '完成課程',
      },
    ]);
  }, []);

  if (!teacher) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {/* Dashboard Title */}
      <h1 className="text-3xl font-bold mb-6">老師後台 Teacher Dashboard</h1>

      {/* Teacher Info */}
      <div className="bg-white p-6 rounded-xl shadow mb-10">
        <h2 className="text-2xl font-semibold mb-4">教師資訊 Teacher Info</h2>

        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center">
            {teacher.avatar ? (
              <img src={teacher.avatar} className="w-full h-full rounded-full" />
            ) : (
              <span className="text-gray-600">No Photo</span>
            )}
          </div>

          <div>
            <p className="text-xl font-semibold">
              {teacher.firstName} {teacher.lastName}
            </p>
            <p className="text-blue-600">{teacher.nickname}</p>
            <p className="text-gray-700">
              專長科目：{teacher.subjects.join(', ')}
            </p>
            <p className="text-gray-700">{teacher.experience}</p>
          </div>
        </div>
      </div>

      {/* Courses Section */}
      <div className="bg-white p-6 rounded-xl shadow mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">課程管理 My Courses</h2>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
            ➕ 新增課程
          </button>
        </div>

        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-200">
            <tr>
              <th className="py-3 px-4 text-left">課程名稱</th>
              <th className="py-3 px-4 text-left">價格</th>
              <th className="py-3 px-4 text-left">時數</th>
              <th className="py-3 px-4 text-left">狀態</th>
              <th className="py-3 px-4">操作</th>
            </tr>
          </thead>

          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-3 px-4">{c.title}</td>
                <td className="py-3 px-4">${c.price}</td>
                <td className="py-3 px-4">{c.duration} 分鐘</td>
                <td className="py-3 px-4">{c.status}</td>
                <td className="py-3 px-4 text-center">
                  <button className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    編輯
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bookings Section */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-2xl font-semibold mb-4">預約管理 Bookings</h2>

        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-200">
            <tr>
              <th className="py-3 px-4 text-left">學生</th>
              <th className="py-3 px-4 text-left">課程</th>
              <th className="py-3 px-4 text-left">時間</th>
              <th className="py-3 px-4 text-left">狀態</th>
              <th className="py-3 px-4 text-center">操作</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-3 px-4">{b.student}</td>
                <td className="py-3 px-4">{b.course}</td>
                <td className="py-3 px-4">{b.date}</td>
                <td className="py-3 px-4">{b.status}</td>
                <td className="py-3 px-4 text-center">
                  <button className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    進入教室
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
