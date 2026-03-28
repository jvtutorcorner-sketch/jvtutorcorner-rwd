'use client';

import { useT } from '@/components/IntlProvider';

interface Step {
  number: string;
  title: string;
  description: string;
  gradient: string;
  icon: string;
}

export default function HowItWorks() {
  const t = useT();

  const steps: Step[] = [
    {
      number: '01',
      title: t('how_it_works_step1_title') || 'Tell us about yourself',
      description: t('how_it_works_step1_desc') || 'Take our quiz and tell us about your goals, lifestyle, and diet.',
      gradient: 'linear-gradient(135deg, #fce7f3 0%, #f3e8ff 100%)',
      icon: '📱',
    },
    {
      number: '02',
      title: t('how_it_works_step2_title') || 'Find your routine',
      description: t('how_it_works_step2_desc') || "We'll personalise a plan backed by science made just for you.",
      gradient: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)',
      icon: '📋',
    },
    {
      number: '03',
      title: t('how_it_works_step3_title') || 'Stick with it',
      description: t('how_it_works_step3_desc') || 'Build habits that improve your health goals and earn rewards with the App.',
      gradient: 'linear-gradient(135deg, #d1fae5 0%, #bfdbfe 100%)',
      icon: '🎯',
    },
  ];

  return (
    <section className="how-it-works-section">
      <h2 className="how-it-works-title">{t('how_it_works_title') || 'How It Works'}</h2>
      <div className="how-it-works-grid">
        {steps.map((step) => (
          <div key={step.number} className="how-it-works-card">
            <div className="how-it-works-number">{step.number}</div>
            <h3 className="how-it-works-card-title">{step.title}</h3>
            <p className="how-it-works-card-desc">{step.description}</p>
            <div className="how-it-works-image" style={{ background: step.gradient }}>
              <div className="how-it-works-icon">{step.icon}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
