'use client';

import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);

  // 取得使用者資料
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch('/api/user/me'); // TODO: 換成你的後端 API
        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.error('Failed to load user:', err);
      }
    };

    loadUser();
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        載入中 Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-5">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-xl p-10">
        <h1 className="text-3xl font-bold mb-6">個人資料 Profile</h1>

        {/* Profile Header */}
        <div className="flex items-center gap-6 border-b pb-6 mb-6">
          <div className="w-24 h-24 rounded-full bg-gray-300 overflow-hidden">
            {user.avatar ? (
              <img src={user.avatar} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                No Photo
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-semibold">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-gray-500">{user.nickname}</p>
            <p className="text-blue-600 font-medium">
              {user.role === 'Teacher' ? '老師 Teacher' : '學生 Student'}
            </p>
          </div>
        </div>

        {/* Profile Details */}
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold mb-3">基本資訊 Basic Info</h3>
            <div className="space-y-2 text-gray-700">
              <p><strong>Email：</strong> {user.email}</p>
              <p><strong>性別 Gender：</strong> {user.gender}</p>
              <p><strong>生日 Birthday：</strong> {user.birthday}</p>
              <p><strong>國家 Country：</strong> {user.country}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3">系統資訊 System Info</h3>
            <div className="space-y-2 text-gray-700">
              <p><strong>帳號 ID：</strong> {user.accountId}</p>
              <p><strong>角色 Role：</strong> {user.role}</p>
              <p><strong>建立時間：</strong> {user.createdAt}</p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-10 flex gap-4">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            編輯資料 Edit Profile
          </button>

          <button className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-black transition">
            登出 Logout
          </button>
        </div>
      </div>
    </div>
  );
}
