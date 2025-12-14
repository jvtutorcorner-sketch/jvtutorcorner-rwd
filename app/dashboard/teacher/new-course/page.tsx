'use client';

import { useState } from 'react';

export default function NewCoursePage() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: 'Math',
    duration: '50',
    price: '',
    level: '初階',
    status: '上架',
    cover: null as File | null,
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);

  const handleChange = (e: any) => {
    const { name, value, files } = e.target;

    if (name === 'cover') {
      const file = files[0];
      setForm({ ...form, cover: file });

      // 圖片預覽
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const submitForm = async (e: any) => {
    e.preventDefault();

    console.log('📌 New Course Data:', form);

    // TODO: 換成課程新增 API，例如 /api/courses
    const res = await fetch('/api/courses/new', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    setSuccess(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold mb-6">新增課程 New Course</h1>

        <form onSubmit={submitForm} className="space-y-6">

          {/* Cover Upload */}
          <div>
            <label className="block font-medium mb-2">課程封面 Cover</label>

            <input
              type="file"
              accept="image/*"
              name="cover"
              onChange={handleChange}
              className="w-full border p-2 rounded-lg"
            />

            {preview && (
              <img
                src={preview}
                className="w-full h-48 object-cover rounded-lg mt-3"
              />
            )}
          </div>

          {/* Course Title */}
          <div>
            <label className="block font-medium mb-2">課程名稱 Title</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              placeholder="例如：國中數學基礎課程"
              className="w-full border px-3 py-2 rounded-lg"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-medium mb-2">課程描述 Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              required
              placeholder="課程內容描述..."
              className="w-full border px-3 py-2 rounded-lg"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block font-medium mb-2">科目 Subject</label>
            <select
              name="subject"
              value={form.subject}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-lg"
            >
              <option value="Math">數學</option>
              <option value="English">英文</option>
              <option value="Programming">程式設計</option>
              <option value="Science">自然科學</option>
              <option value="Custom">自訂科目</option>
            </select>
          </div>

          {/* Duration & Price */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block font-medium mb-2">時長 Duration</label>
              <select
                name="duration"
                value={form.duration}
                onChange={handleChange}
                className="w-full border px-3 py-2 rounded-lg"
              >
                <option value="50">50 分鐘</option>
                <option value="60">60 分鐘</option>
                <option value="90">90 分鐘</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2">價格 Price (NTD)</label>
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                required
                placeholder="例如：500"
                className="w-full border px-3 py-2 rounded-lg"
              />
            </div>
          </div>

          {/* Level */}
          <div>
            <label className="block font-medium mb-2">難度 Level</label>
            <select
              name="level"
              value={form.level}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-lg"
            >
              <option>初階</option>
              <option>中階</option>
              <option>進階</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block font-medium mb-2">課程狀態 Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded-lg"
            >
              <option value="上架">上架</option>
              <option value="下架">下架</option>
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            建立課程 Create Course
          </button>

          {success && (
            <p className="text-green-600 text-center mt-4">
              課程已成功建立！
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
