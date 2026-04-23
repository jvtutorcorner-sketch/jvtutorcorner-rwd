'use client';

import React, { useState } from 'react';
import MedicineQuestionnaire from '@/components/MedicineQuestionnaire';

interface Option {
  key: string;
  emoji?: string;
  text: string;
}

interface Question {
  id: string;
  title: string;
  subtitle?: string;
  options: Option[];
}

export default function MedicineSurveySettingsPage() {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 'q1',
      title: '您目前最主要的身體不適症狀是？',
      options: [
        { key: 'A', emoji: '🌡️', text: '發燒、頭痛、全身痠痛' },
        { key: 'B', emoji: '🤧', text: '鼻塞、流鼻水、打噴嚏' },
        { key: 'C', emoji: '🗣️', text: '咳嗽、喉嚨痛、多痰' },
        { key: 'D', emoji: '🤢', text: '胃痛、消化不良、腹瀉' },
      ]
    },
    {
      id: 'q2',
      title: '該症狀已經持續多久了？',
      options: [
        { key: 'A', text: '剛開始 (1-2 天)' },
        { key: 'B', text: '有一段時間了 (3-5 天)' },
        { key: 'C', text: '持續一週以上' },
        { key: 'D', text: '反覆發作，斷斷續續' },
      ]
    }
  ]);

  const addOption = (qId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const nextKey = String.fromCharCode(65 + q.options.length);
        return { ...q, options: [...q.options, { key: nextKey, text: '新選項' }] };
      }
      return q;
    }));
  };

  const updateOptionText = (qId: string, optKey: string, text: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        return {
          ...q,
          options: q.options.map(opt => opt.key === optKey ? { ...opt, text } : opt)
        };
      }
      return q;
    }));
  };

  const updateOptionEmoji = (qId: string, optKey: string, emoji: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        return {
          ...q,
          options: q.options.map(opt => opt.key === optKey ? { ...opt, emoji } : opt)
        };
      }
      return q;
    }));
  };

  const addQuestion = () => {
    const newId = `q${questions.length + 1}`;
    setQuestions(prev => [
      ...prev,
      {
        id: newId,
        title: '新問卷題目',
        options: [
          { key: 'A', text: '選項 A' },
          { key: 'B', text: '選項 B' }
        ]
      }
    ]);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111827' }}>藥品問卷內容設定</h1>
        <p style={{ color: '#6b7280', marginTop: '8px' }}>管理藥品諮詢問卷的所有題目、選項與邏輯對應。</p>
      </header>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderBottom: '1px solid #e5e7eb' }}>
        <button 
          onClick={() => setActiveTab('editor')}
          style={{ 
            padding: '12px 20px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'editor' ? '2px solid #059669' : 'none',
            color: activeTab === 'editor' ? '#059669' : '#6b7280',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          題目編輯器
        </button>
        <button 
          onClick={() => setActiveTab('preview')}
          style={{ 
            padding: '12px 20px', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'preview' ? '2px solid #059669' : 'none',
            color: activeTab === 'preview' ? '#059669' : '#6b7280',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          即時預覽 (手機版)
        </button>
      </div>

      {activeTab === 'editor' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {questions.map((q, idx) => (
            <div key={q.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ background: '#ecfdf5', color: '#059669', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>題目 {idx + 1}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>⬆️</button>
                  <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>⬇️</button>
                  <button 
                    onClick={() => setQuestions(prev => prev.filter(item => item.id !== q.id))}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer', marginLeft: '8px' }}
                  >
                    刪除
                  </button>
                </div>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>題目內容</label>
                <input 
                  value={q.title} 
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, title: newTitle } : item));
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>選項管理</label>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {q.options.map((opt) => (
                    <div key={opt.key} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ width: '30px', fontWeight: 700, color: '#9ca3af' }}>{opt.key}</span>
                      {opt.emoji !== undefined && (
                        <input 
                          value={opt.emoji} 
                          onChange={(e) => updateOptionEmoji(q.id, opt.key, e.target.value)}
                          style={{ width: '50px', textAlign: 'center', padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db' }} 
                        />
                      )}
                      <input 
                        value={opt.text} 
                        onChange={(e) => updateOptionText(q.id, opt.key, e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }} 
                      />
                      <button 
                        onClick={() => setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, options: item.options.filter(o => o.key !== opt.key) } : item))}
                        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => addOption(q.id)}
                    style={{ marginTop: '10px', padding: '8px', border: '1px dashed #d1d5db', borderRadius: '8px', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '13px' }}
                  >
                    + 新增選項
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          <button 
            onClick={addQuestion}
            style={{ padding: '16px', border: '2px dashed #059669', borderRadius: '12px', background: '#ecfdf5', color: '#059669', fontWeight: 600, cursor: 'pointer' }}
          >
            + 新增問卷題目
          </button>


          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button style={{ padding: '12px 32px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.4)' }}>
              儲存所有設定
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', background: '#f3f4f6', padding: '40px', borderRadius: '24px' }}>
          <div style={{ width: '375px', height: '667px', background: '#fff', borderRadius: '40px', border: '8px solid #374151', overflowY: 'auto', position: 'relative' }}>
            <div style={{ padding: '20px' }}>
              <div style={{ width: '40px', height: '4px', background: '#e5e7eb', borderRadius: '2px', margin: '0 auto 20px' }} />
              <MedicineQuestionnaire onComplete={() => alert('預覽完成')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
