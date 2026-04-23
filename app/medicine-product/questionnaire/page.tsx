'use client';

import React from 'react';
import MedicineQuestionnaire from '@/components/MedicineQuestionnaire';
import { useRouter } from 'next/navigation';

export default function MedicineQuestionnairePage() {
  const router = useRouter();

  const handleComplete = (answers: any) => {
    console.log('Questionnaire completed:', answers);
    // Redirect back to the medicine product page or show a success message
    setTimeout(() => {
      router.push('/medicine-product');
    }, 2000);
  };

  const handleSkip = () => {
    router.push('/medicine-product');
  };

  return (
    <div className="medicine-survey-page" style={{ 
      minHeight: '100vh', 
      background: '#f9fafb', 
      display: 'flex', 
      flexDirection: 'column',
    }}>
      <style jsx>{`
        .medicine-survey-page {
          padding: 40px 20px;
        }
        .page-header h1 {
          color: #059669;
          font-size: 2.5rem;
          font-weight: 800;
        }
        @media (max-width: 640px) {
          .medicine-survey-page {
            padding: 20px 0;
          }
          .page-header {
            padding: 0 16px;
            margin-bottom: 20px !important;
          }
          .page-header h1 {
            font-size: 1.75rem;
          }
          .page-header p {
            font-size: 14px;
          }
        }
      `}</style>
      <header className="page-header" style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1>藥品問卷設定</h1>
        <p style={{ color: '#6b7280', maxWidth: 600, margin: '12px auto' }}>
          歡迎使用藥品諮詢系統。請協助我們了解您的身體狀況，以提供最合適的用藥建議與安全守則。
        </p>
      </header>

      <main style={{ flex: 1 }}>
        <MedicineQuestionnaire 
          onComplete={handleComplete} 
          onSkip={handleSkip} 
        />
      </main>

      <footer style={{ marginTop: 60, padding: '0 20px 40px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        <p>© 2026 JV Tutor Corner - 醫藥諮詢小組</p>
        <p style={{ marginTop: 8 }}>免責聲明：本問卷僅供參考，不具備正式醫療診斷效力。若症狀嚴重請務必就醫。</p>
      </footer>
    </div>
  );
}
