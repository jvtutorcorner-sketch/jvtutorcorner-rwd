// app/testimony/page.tsx
'use client';

import React from 'react';

const testimonials = [
  {
    id: 1,
    name: '王小明',
    role: '英文學習者',
    content: '在這裡學習英文真的很有趣！老師非常有耐心，教材也很豐富。我的口說能力在短短三個月內有了顯著的進步。',
    createdAt: '2025-11-30T10:30:00.000Z',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  },
  {
    id: 2,
    name: '李美華',
    role: '日文進修中',
    content: '小班制的教學讓我有很多練習機會。即時白板功能非常強大，老師可以隨時糾正我的筆順和發音。',
    createdAt: '2025-12-05T14:20:00.000Z',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  },
  {
    id: 3,
    name: '張大衛',
    role: '商務英語學員',
    content: '課程時間非常彈性，適合忙碌的上班族。錄影回放功能讓我可以在下班後隨時複習，真的很方便。',
    createdAt: '2025-12-10T09:00:00.000Z',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
  },
];

export default function TestimonyPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">學員見證</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          聽聽來自世界各地的學員分享他們在 Tutor Corner 的學習旅程與成長故事。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {testimonials.map((item) => (
          <div key={item.id} className="testimony-card bg-white p-6 md:p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center mb-6">
              <img
                src={item.avatar}
                alt={item.name}
                className="testimony-avatar"
              />
              <div>
                <h3 className="font-bold text-lg">{item.name}</h3>
                  <p className="text-blue-600 text-sm">{item.role}</p>
                  {item.createdAt && (
                    <p className="text-gray-500 text-xs" style={{ marginTop: 4 }}>
                      發布於：{new Date(item.createdAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
              </div>
            </div>
            <p className="text-gray-700 leading-relaxed italic">
              "{item.content}"
            </p>
            <div className="rating-row" style={{ color: '#FBBF24' }}>
              {[...Array(5)].map((_, i) => (
                <svg key={i} viewBox="0 0 20 20" aria-hidden="true">
                  <path fill="currentColor" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 bg-blue-600 rounded-2xl p-10 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">準備好開始您的學習旅程了嗎？</h2>
        <p className="mb-8 text-blue-100">加入數千名成功學員的行列，開啟您的語言學習新篇章。</p>
        {/* Navigate to registration page */}
        <a href="/login/register" className="bg-white text-blue-600 px-8 py-3 rounded-full font-bold hover:bg-blue-50 transition-colors inline-block">
          立即免費註冊
        </a>
      </div>
    </div>
  );
}
