"use client";
import { useEffect, useRef } from 'react';
import { driver, Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useRouter, usePathname } from 'next/navigation';

export default function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    const handleSurveyClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('survey-opt-btn')) {
        const key = target.getAttribute('data-key');
        if (key) {
          localStorage.setItem('jv_survey_answers', JSON.stringify({ q1: key }));
          // Visual feedback
          const container = target.closest('.tour-survey-container');
          if (container) {
            container.innerHTML = '<p style="color: #4338ca; font-size: 14px; margin-top: 10px; font-weight: 600; text-align: center; background: #eef2ff; padding: 12px; border-radius: 8px;">✅ 已記錄您的偏好！正在優化推薦內容...</p>';
          }
          setTimeout(() => {
            if (driverRef.current) driverRef.current.moveNext();
          }, 1200);
        }
      }
    };
    document.addEventListener('click', handleSurveyClick);
    return () => document.removeEventListener('click', handleSurveyClick);
  }, []);

  useEffect(() => {
    const justRegistered = localStorage.getItem('jv_just_registered');
    
    // 1. Initial trigger logic
    if (justRegistered === 'true') {
      localStorage.removeItem('jv_just_registered');
      localStorage.setItem('jv_tour_phase', 'home');
      // The update to localStorage will be picked up on the next render or navigation
    }

    const currentPhase = localStorage.getItem('jv_tour_phase');
    if (!currentPhase) return;

    // Check if we are on the correct page for the phase
    const isCorrectPage = 
      (currentPhase === 'home' && pathname === '/') ||
      (currentPhase === 'teachers' && pathname === '/teachers') ||
      (currentPhase === 'courses' && pathname === '/courses');

    if (!isCorrectPage) return;

    const timer = setTimeout(() => {
      let steps: any[] = [];

      if (currentPhase === 'home') {
        const btnStyle = 'display: block; width: 100%; text-align: left; padding: 10px 14px; margin-bottom: 6px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; color: #374151; transition: all 0.2s;';
        steps = [
          {
            element: 'a.logo',
            popover: {
              title: '歡迎來到導師配對平台！🎉',
              description: '這是您的學習起點。讓我們快速示範如何發掘最強大的功能！',
              side: 'bottom', align: 'start'
            }
          },
          {
            element: '#tour-recommendation',
            popover: {
              title: 'AI 專屬推薦 🎯',
              description: '系統會根據您的興趣自動推薦課程。您可以透過下方的「填寫偏好」按鈕來讓推薦更精準！',
              side: 'top', align: 'start'
            }
          },
          {
            element: '#tour-recommendation',
            popover: {
              title: '告訴我們您的興趣 ✍️',
              description: `
                <div class="tour-survey-container">
                  <p style="margin-bottom: 12px; font-weight: 600; font-size: 14px; color: #374151;">您目前最想突破的，是哪個困境？</p>
                  <div style="display: grid;">
                    <button class="survey-opt-btn" data-key="A" style="${btnStyle}">💬 想開口說英文，但每次卡在第一句</button>
                    <button class="survey-opt-btn" data-key="B" style="${btnStyle}">🚀 準備轉職或升職，需要補足實戰技能</button>
                    <button class="survey-opt-btn" data-key="C" style="${btnStyle}">📜 想攻下一張重要證照 (多益、日檢等)</button>
                    <button class="survey-opt-btn" data-key="D" style="${btnStyle}">🌱 剛好有個新興趣，想試試看但不知從何開始</button>
                  </div>
                  <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">(選擇後將自動進入下一步，或點擊「下一步」略過)</p>
                </div>
              `,
              side: 'top', align: 'start'
            }
          },
          {
            element: '#tour-tabs',
            popover: {
              title: '快速切換預覽 📚',
              description: '在這裡，您可以不用切換頁面就能預覽最新的專業師資與熱門課程。',
              side: 'top', align: 'start'
            }
          },
          {
            element: '.main-nav a[href="/teachers"]',
            popover: {
              title: '即將前往：師資專區 👩‍🏫',
              description: '點擊下一步，我們將帶您深入了解如何挑選最合適的老師。',
              side: 'bottom', align: 'start',
              onNextClick: () => {
                localStorage.setItem('jv_tour_phase', 'teachers');
                router.push('/teachers');
                if (driverRef.current) driverRef.current.destroy();
              }
            }
          },
          {
            element: 'body',
            popover: { title: 'Redirecting...', description: 'Please wait...', side: 'bottom', align: 'start' }
          }
        ];
      } else if (currentPhase === 'teachers') {
        steps = [
          {
            element: '.search-form',
            popover: {
              title: '精準搜尋老師 🔍',
              description: '輸入老師姓名或教學語言，快速篩選出符合您需求的專業導師。',
              side: 'bottom', align: 'start'
            }
          },
          {
            element: '.card-link',
            popover: {
              title: '深入了解導師 📄',
              description: '每張卡片都清楚展示了老師的專長與簡介。點擊卡片即可查看完整履歷與評價！',
              side: 'top', align: 'start'
            }
          },
          {
            element: '.main-nav a[href="/courses"]',
            popover: {
              title: '下一個：精選課程 📚',
              description: '準備好了嗎？我們接著去看看有哪些適合您的精彩課程。',
              side: 'bottom', align: 'start',
              onNextClick: () => {
                localStorage.setItem('jv_tour_phase', 'courses');
                router.push('/courses');
                if (driverRef.current) driverRef.current.destroy();
              }
            }
          },
          {
            element: 'body',
            popover: { title: 'Redirecting...', description: 'Please wait...', side: 'bottom', align: 'start' }
          }
        ];
      } else if (currentPhase === 'courses') {
        steps = [
          {
            element: '.card[href^="/courses/"]',
            popover: {
              title: '探索多樣化課程 🚀',
              description: '從入門到進階，這裡涵蓋了所有的學習資源。趕快選一門課開始您的學習之旅吧！',
              side: 'top', align: 'start'
            }
          },
          {
            element: '.main-nav a[href="/about"]',
            popover: {
              title: '最後：關於我們 🤝',
              description: '想更了解我們的理念與團隊嗎？隨時可以來這裡看看。祝您學習愉快！',
              side: 'bottom', align: 'start',
              onNextClick: () => {
                localStorage.removeItem('jv_tour_phase');
                if (driverRef.current) driverRef.current.destroy();
              }
            }
          }
        ];
      }

      if (steps.length === 0) return;

      const d = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        doneBtnText: '完成導覽 🎉',
        nextBtnText: '下一步',
        prevBtnText: '上一步',
        steps,
        onDestroyStarted: () => {
           d.destroy();
        },
      });

      driverRef.current = d;
      d.drive();
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, [pathname, router]);

  return null;
}
