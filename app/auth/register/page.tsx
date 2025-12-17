'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    gender: 'Male',
    birthday: '',
    country: '',
    role: 'Student',
    email: '',
    password: '',
    accountId: uuidv4(), // 自動產生帳號ID
  });

  const [success, setSuccess] = useState(false);

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submitForm = async (e: any) => {
    e.preventDefault();

    console.log('Register data:', form);

    // 🔥 TODO: 改成你自己的 API Gateway / Lambda
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    setSuccess(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={submitForm}
        className="bg-white p-10 rounded-xl shadow-xl w-full max-w-lg"
      >
        <h1 className="text-3xl font-bold mb-6 text-center">註冊帳號</h1>

        {/* First Name */}
        <div className="mb-4">
          <label className="block font-medium mb-1">First Name</label>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Your First Name"
          />
        </div>

        {/* Last Name */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Last Name</label>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Your Last Name"
          />
        </div>

        {/* Nickname */}
        <div className="mb-4">
          <label className="block font-medium mb-1">暱稱 Nickname</label>
          <input
            name="nickname"
            value={form.nickname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="ex: DD0304許采銘"
          />
        </div>

        {/* Gender */}
        <div className="mb-4">
          <label className="block font-medium mb-1">性別 Gender</label>
          <select
            name="gender"
            value={form.gender}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>

        {/* Birthday */}
        <div className="mb-4">
          <label className="block font-medium mb-1">出生年月日</label>
          <input
            type="date"
            name="birthday"
            value={form.birthday}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {/* Country */}
        <div className="mb-4">
          <label className="block font-medium mb-1">國家 Country</label>
          <input
            name="country"
            value={form.country}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="ex: Taiwan"
          />
        </div>

        {/* Role */}
        <div className="mb-4">
          <label className="block font-medium mb-1">角色 Role</label>
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="Student">學生 Student</option>
            <option value="Teacher">老師 Teacher</option>
          </select>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="example@gmail.com"
          />
        </div>

        {/* Password */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Password</label>
          <input
            type="password"
            name="password"
            required
            value={form.password}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {/* UUID 顯示 */}
        <div className="mb-4">
          <label className="block font-medium mb-1">帳號ID (系統自動產生)</label>
          <input
            disabled
            value={form.accountId}
            className="w-full border rounded-lg px-3 py-2 bg-gray-200"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          註冊 Register
        </button>

        {success && (
          <p className="text-green-600 mt-4 text-center">
            註冊成功！請前往登入頁面。
          </p>
        )}
      </form>
    </div>
  );
}
