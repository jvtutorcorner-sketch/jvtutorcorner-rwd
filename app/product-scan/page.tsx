"use client";
import React, { useState, useEffect, useRef } from 'react';
import { getStoredUser } from '@/lib/mockAuth';

interface ScanResult {
  products: Array<{ name: string; quantity: number; pointsPerItem: number }>;
  totalPoints: number;
  success: boolean;
}

interface User {
  email: string;
  plan?: string;
}

export default function ProductScanPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    setMounted(true);
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      // user cancelled selection
      return;
    }

    setError(null);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleScan() {
    if (!imageFile) {
      setError('請選擇一張圖片');
      return;
    }

    if (!user?.email) {
      setError('請先登入');
      return;
    }

    setScanning(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('email', user.email);

    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '掃描失敗');
      }

      const json = await res.json();
      setResult(json);
    } catch (e) {
      setError((e as any).message || '掃描發生錯誤');
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirmPoints() {
    if (!result || !user?.email) return;

    setConfirming(true);
    setError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pointsToAdd: result.totalPoints,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || '新增點數失敗');
      }

      setResult(null);
      setImageFile(null);
      setPreview(null);
      // notify other parts of the app to refresh profile
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('profile-updated', { detail: { email: user.email, added: result.totalPoints } }));
        }
      } catch {}
      alert(`成功新增 ${result.totalPoints} 點！`);
    } catch (e) {
      setError((e as any).message || '新增點數發生錯誤');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1>商品掃描與點數兌換</h1>

      {!mounted && <p style={{ color: '#888' }}>讀取中...</p>}

      {mounted && !user?.email && (
        <p style={{ color: '#dc2626' }}>請先登入以使用此功能。</p>
      )}

      {mounted && user?.email && (
        <>
          <div style={{ marginBottom: 12, padding: 8, border: '1px dashed #e5e7eb', borderRadius: 6, background: '#fafafa' }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>DEBUG</strong>
            <div style={{ fontSize: 12, color: '#374151' }}>
              <div>mounted: {String(mounted)}</div>
              <div>user.email: {user?.email ?? 'null'}</div>
              <div>imageFile: {imageFile ? imageFile.name : 'null'}</div>
              <div>scanning: {String(scanning)}</div>
              <div>hasResult: {result ? 'true' : 'false'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <label style={{ display: 'block', marginBottom: 12, fontWeight: 'bold' }}>
              上傳商品圖片：
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={scanning || confirming}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning || confirming}
                style={{
                  padding: '8px 12px',
                  background: scanning || confirming ? '#9ca3af' : '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: scanning || confirming ? 'not-allowed' : 'pointer'
                }}
              >
                選擇檔案
              </button>

              <div style={{ fontSize: 13, color: '#374151' }}>{imageFile ? imageFile.name : '尚未選擇檔案'}</div>
            </div>

            {preview && (
              <div style={{ marginBottom: 12 }}>
                <img
                  src={preview}
                  alt="preview"
                  style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                />
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={!imageFile || scanning}
              style={{
                padding: '10px 16px',
                background: !imageFile || scanning ? '#9ca3af' : '#111827',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: !imageFile || scanning ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              {scanning ? '掃描中...' : '掃描商品'}
            </button>
          </div>

          {error && (
            <p style={{ color: '#dc2626', marginBottom: 12 }}>❌ {error}</p>
          )}

          {result && (
            <div style={{ padding: 16, border: '1px solid #10b981', borderRadius: 8, backgroundColor: '#f0fdf4' }}>
              <h3 style={{ marginTop: 0 }}>掃描結果</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ backgroundColor: '#d1fae5' }}>
                    <th style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'left' }}>商品名稱</th>
                    <th style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'center' }}>數量</th>
                    <th style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'right' }}>點數/件</th>
                    <th style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'right' }}>小計</th>
                  </tr>
                </thead>
                <tbody>
                  {result.products.map((p, i) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #a7f3d0', padding: 8 }}>{p.name}</td>
                      <td style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'center' }}>{p.quantity}</td>
                      <td style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'right' }}>{p.pointsPerItem}</td>
                      <td style={{ border: '1px solid #a7f3d0', padding: 8, textAlign: 'right', fontWeight: 'bold' }}>
                        {p.quantity * p.pointsPerItem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#10b981' }}>
                總計：{result.totalPoints} 點
              </p>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleConfirmPoints}
                  disabled={confirming}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: confirming ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: confirming ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 'bold',
                  }}
                >
                  {confirming ? '新增中...' : '確認新增點數'}
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setImageFile(null);
                    setPreview(null);
                  }}
                  disabled={confirming}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    cursor: confirming ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 'bold',
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
