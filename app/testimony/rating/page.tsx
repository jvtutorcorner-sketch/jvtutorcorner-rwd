'use client';

import React, { useState } from 'react';
import { useT } from '@/components/IntlProvider';

export default function TestimonyRatingPage() {
  const t = useT();
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  // 模擬已完課的課程列表
  const [finishedCourses] = useState([
    { id: 'c1', title: '英檢中級衝刺班（12 週）', completedAt: '2025-12-20' },
    { id: 'c3', title: '商用英語會議表達技巧', completedAt: '2026-01-15' },
  ]);
  const [selectedCourseId, setSelectedCourseId] = useState(finishedCourses[0]?.id || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      alert('請選擇要評分的課程');
      return;
    }
    if (!content.trim()) {
      alert('請填寫見證內容');
      return;
    }
    // 模擬提交
    console.log({ rating, content, courseId: selectedCourseId });
    setSubmitted(true);
  };

  if (finishedCourses.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 max-w-lg mx-auto">
          <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4">尚未有完課紀錄</h2>
          <p className="text-gray-600 mb-8">為了維護評論品質，學員必須在課程結束後才能發表見證。請於課程完課後再回來分享您的心得！</p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-full font-bold hover:bg-blue-700 transition"
          >
            返回首頁
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">發表學員見證</h1>
          <p className="text-green-600 font-medium mb-4 flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            符合評分資格：系統偵測到您已完成 {finishedCourses.length} 門課程
          </p>
          <p className="text-gray-600">分享您在課程中的學習心得，幫助更多學員。</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="mb-8">
            <label className="block text-gray-700 font-bold mb-2">選擇評分課程</label>
            <select
              className="w-full border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              {finishedCourses.map(c => (
                <option key={c.id} value={c.id}>{c.title} (完課日期: {c.completedAt})</option>
              ))}
            </select>
          </div>

          <div className="mb-8">
            <label className="block text-gray-700 font-bold mb-4 text-center">總體評分</label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`text-4xl transition-colors ${
                    star <= (hover || rating) ? 'text-yellow-400' : 'text-gray-200'
                  }`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                >
                  ★
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {rating === 5 && '非常滿意'}
              {rating === 4 && '滿意'}
              {rating === 3 && '普通'}
              {rating === 2 && '待改進'}
              {rating === 1 && '非常不滿意'}
            </p>
          </div>

          <div className="mb-8">
            <label className="block text-gray-700 font-bold mb-2">心得內容</label>
            <textarea
              className="w-full h-40 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              placeholder="請分享您的學習過程、老師的教學風格，或是您達成的目標..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition shadow-lg shadow-blue-200"
          >
            提交見證
          </button>
        </form>

        <div className="mt-8 text-center">
          <a href="/testimony" className="text-gray-500 hover:text-blue-600 transition text-sm">
            ← 返回見證清單
          </a>
        </div>
      </div>
    </div>
  );
}
