"use client";
import React from 'react';

type Product = {
  id: string;
  title: string;
  points: number;
  description?: string;
};

export default function RedeemProductCard({
  product,
  userPoints = 0,
  onRedeem,
  redeemed = false,
  processing = false,
}: {
  product: Product;
  userPoints?: number;
  redeemed?: boolean;
  onRedeem?: (productId: string) => void;
  processing?: boolean;
}) {
  const canRedeem = userPoints >= product.points && !redeemed;
  const disabled = !canRedeem || processing;

  function handleRedeem() {
    if (!canRedeem) {
      alert('點數不足或已兌換');
      return;
    }
    onRedeem?.(product.id);
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', padding: 16, borderRadius: 8, width: 320, margin: 8 }}>
      <h3 style={{ margin: '0 0 8px 0' }}>{product.title}</h3>
      <p style={{ margin: '0 0 8px 0', color: '#6b7280' }}>{product.description}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{product.points} 點</strong>
        <button
          onClick={handleRedeem}
          disabled={disabled}
          style={{ padding: '8px 12px', background: disabled ? '#9ca3af' : '#111827', color: 'white', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {processing ? '處理中...' : redeemed ? '已兌換' : '兌換'}
        </button>
      </div>
      <div style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>您的點數：{userPoints}</div>
    </div>
  );
}
