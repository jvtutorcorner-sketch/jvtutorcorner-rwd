"use client";
import React, { useEffect, useState } from 'react';
import RedeemProductCard from '@/components/RedeemProductCard';
import { redeemProducts } from '@/data/redeemProducts';
import { getStoredUser } from '@/lib/mockAuth';

export default function RedeemPage() {
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [rawProfile, setRawProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [redeemedIds, setRedeemedIds] = useState<string[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setUserLoggedIn(Boolean(u && u.email));
    
    if (!u?.email) {
      setUserPoints(null);
      setMounted(true);
      return;
    }

    async function fetchProfileFor(email: string) {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile?email=${encodeURIComponent(email)}`);
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();
        setRawProfile(json);
        const profile = json?.profile || json?.profile; // support different shapes
        setUserPoints(typeof profile?.points === 'number' ? profile.points : 0);
      } catch (e) {
        console.warn(e);
        setUserPoints(0);
      } finally {
        setLoading(false);
        setMounted(true);
      }
    }

    if (u?.email) fetchProfileFor(u.email);

    // listen for profile-updated events to refresh points
    function onProfileUpdated(e: any) {
      const email = e?.detail?.email;
      if (email && u?.email && email.toLowerCase() === u.email.toLowerCase()) {
        fetchProfileFor(email);
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('profile-updated', onProfileUpdated as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile-updated', onProfileUpdated as EventListener);
      }
    };
  }, []);

  async function handleRedeem(productId: string) {
    const product = redeemProducts.find((p) => p.id === productId);
    if (!product || userPoints === null) return;
    if (userPoints < product.points) {
      alert('點數不足');
      return;
    }

    const u = getStoredUser();
    if (!u?.email) {
      alert('請先登入');
      return;
    }

    // call backend to deduct points
    setProcessingId(productId);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, pointsToAdd: -product.points }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || '更新點數失敗');
      }
      const json = await res.json();
      const profile = json?.profile || json?.profile;
      const newPoints = typeof profile?.points === 'number' ? profile.points : (userPoints - product.points);
      setUserPoints(newPoints);
      setRedeemedIds((s) => [...s, productId]);
      // notify other parts of the app
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('profile-updated', { detail: { email: u.email, added: -product.points } })); } catch {}
      alert(`已兌換 ${product.title}`);
    } catch (e: any) {
      alert(e?.message || '兌換失敗');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 12px 0' }}>兌換商品</h1>
      {!mounted && <p style={{ color: '#6b7280' }}>讀取中...</p>}
      {mounted && !userLoggedIn && <p style={{ color: '#6b7280' }}>請先登入以使用點數兌換。</p>}
      {mounted && userLoggedIn && (
        <>
          <p style={{ marginTop: 0, color: '#6b7280' }}>
            您的點數：{loading ? '讀取中...' : userPoints ?? 0} 點
          </p>
          {rawProfile && (
            <pre style={{ background: '#111827', color: '#fff', padding: 8, borderRadius: 6, marginTop: 8, fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(rawProfile, null, 2)}
            </pre>
          )}
        </>
      )}

      <section style={{ display: 'flex', flexWrap: 'wrap', marginTop: 16 }}>
        {redeemProducts.map((p) => (
          <RedeemProductCard
            key={p.id}
            product={p}
            userPoints={userPoints ?? 0}
            onRedeem={handleRedeem}
            redeemed={redeemedIds.includes(p.id)}
            processing={processingId === p.id}
          />
        ))}
      </section>
    </main>
  );
}
