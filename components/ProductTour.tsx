'use client';

import { useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function ProductTour() {
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    // Check if the user just registered and logged in for the first time
    const justRegistered = localStorage.getItem('jv_just_registered');
    if (justRegistered === 'true') {
      setShouldRun(true);
    }
  }, []);

  useEffect(() => {
    if (!shouldRun) return;

    // A small delay ensures the DOM is fully hydrated and painted
    const timer = setTimeout(() => {
      const tour = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: false,
        doneBtnText: '完成導覽 🎉',
        nextBtnText: '下一步',
        prevBtnText: '上一步',
        steps: [
          {
            element: '#tour-welcome',
            popover: {
              title: '歡迎來到導師配對平台！🎉',
              description: '我們為您準備了豐富的學習資源，跟著這份簡短導覽，快速發掘平台的核心功能吧！',
              side: 'bottom',
              align: 'start'
            }
          },
          {
            element: '#tour-recommendation',
            popover: {
              title: '您的專屬學習推薦 🎯',
              description: '這裡將顯示最適合您的課程！強烈建議您後續填寫我們的「課程偏好問卷」，預先收集您的學習目標與標籤內容，讓系統能更精準為您推薦，發揮平台最大價值！',
              side: 'top',
              align: 'start'
            }
          },
          {
            element: '#tour-tabs',
            popover: {
              title: '探索優質師資與熱門好課 📚',
              description: '透過這裡的頁籤，您可以自由跨界尋找心儀的專業導師，或是搶先預約熱門話題課程。事不宜遲，開始您的專屬學習旅程！',
              side: 'top',
              align: 'start'
            }
          }
        ],
        onDestroyStarted: () => {
          if (!tour.hasNextStep() || confirm("確定要略過新人導覽嗎？")) {
            tour.destroy();
            localStorage.removeItem('jv_just_registered');
            setShouldRun(false);
          }
        },
      });

      tour.drive();
    }, 800);

    return () => clearTimeout(timer);
  }, [shouldRun]);

  return null;
}
