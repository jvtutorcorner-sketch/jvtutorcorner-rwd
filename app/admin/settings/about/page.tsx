"use client";

import React, { useEffect, useState } from 'react';

export default function AdminAboutSettings() {
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState('');
  const [contact, setContact] = useState('');
  const [intro, setIntro] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (res.ok && data?.ok) {
        const about = data.settings?.pageContents?.['/about'] || {};
        // support features as array or string
        const feats = about?.features;
        if (Array.isArray(feats)) {
          setFeatures(feats.join('\n'));
        } else if (feats) {
          setFeatures(String(feats));
        } else {
          setFeatures('');
        }
        setContact(about?.contact || '');
        setIntro(about?.intro || '');
        // If settings do not contain about content, try to fetch the public /about
        // page and extract the <p> / <ul> content so admin page is pre-filled
        if ((!about || Object.keys(about).length === 0) || (!about.intro && !about.features && !about.contact)) {
          try {
            const htmlRes = await fetch('/about');
            const html = await htmlRes.text();
            // parse in browser
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // intro: first <main> p (or first p)
            const main = doc.querySelector('main') || doc;
            const introEl = main.querySelector('p');
            const introText = introEl ? (introEl.textContent || '').trim() : '';
            if (introText && (!about || !about.intro)) setIntro(introText);

            // features: find H2 with text 包含 我們的特色
            const h2s = Array.from(doc.querySelectorAll('h2'));
            const featH2 = h2s.find((h) => (h.textContent || '').includes('我們的特色'));
            if (featH2) {
              let featVal = '';
              const next = featH2.nextElementSibling;
              if (next && next.tagName === 'UL') {
                const items = Array.from(next.querySelectorAll('li')).map((li) => (li.textContent || '').trim()).filter(Boolean);
                featVal = items.join('\n');
              } else if (next) {
                featVal = (next.textContent || '').trim();
              }
              if (featVal && (!about || !about.features)) setFeatures(featVal);
            }

            // contact: find H2 包含 聯絡我們 and next p
            const contactH2 = h2s.find((h) => (h.textContent || '').includes('聯絡我們'));
            if (contactH2) {
              const next = contactH2.nextElementSibling;
              const contactText = next ? (next.textContent || '').trim() : '';
              if (contactText && (!about || !about.contact)) setContact(contactText);
            }
          } catch (e) {
            // ignore fetch/parse errors
            // console.warn('failed to parse /about for defaults', e);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        pageContents: {
          '/about': {
            intro: intro || null,
            // store features as newline-separated string for simplicity
            features: features || null,
            contact: contact || null,
          }
        }
      };
      const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data?.ok) {
        alert('已儲存 About 頁面內容');
      } else {
        alert('儲存失敗');
      }
    } catch (e) {
      console.error(e);
      alert('儲存發生錯誤');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>載入中…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>About 頁面內容編輯（/about）</h2>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600 }}>導言 / 介紹 (intro)</label>
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} style={{ width: '100%', padding: 8 }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600 }}>我們的特色 (每行一個項目)</label>
        <textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={6} style={{ width: '100%', padding: 8 }} />
        <div style={{ marginTop: 6, color: '#6b7280' }}>輸入多行文字，每行將轉為一個列表項目；也可貼入 HTML 片段。</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600 }}>聯絡我們 (contact)</label>
        <textarea value={contact} onChange={(e) => setContact(e.target.value)} rows={3} style={{ width: '100%', padding: 8 }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving} style={{ padding: '8px 12px', background: saving ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6 }}>{saving ? '儲存中…' : '儲存 About 內容'}</button>
      </div>
    </div>
  );
}
