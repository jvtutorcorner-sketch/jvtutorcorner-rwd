'use client';

import { useT } from '@/components/IntlProvider';

interface Step {
  number: string;
  title: string;
  description: string;
  gradient: string;
  icon: string;
}

export default function MedicineIdentificationFlow() {
  const t = useT();

  const steps: Step[] = [
    {
      number: '01',
      title: t('medicine_step1_title') || 'Use LINE Official Account',
      description: t('medicine_step1_desc') || 'Add our official LINE account and start the medicine identification service.',
      gradient: 'linear-gradient(135deg, #c7d2fe 0%, #a78bfa 100%)',
      icon: '📱',
    },
    {
      number: '02',
      title: t('medicine_step2_title') || 'Pick Up Your Medicine',
      description: t('medicine_step2_desc') || 'Prepare the medicine you want to identify, ensuring the packaging is visible.',
      gradient: 'linear-gradient(135deg, #fed7aa 0%, #fbcfe8 100%)',
      icon: '💊',
    },
    {
      number: '03',
      title: t('medicine_step3_title') || 'Take a Photo',
      description: t('medicine_step3_desc') || 'Capture a clear photo of the medicine and upload it through LINE to get instant identification results.',
      gradient: 'linear-gradient(135deg, #86efac 0%, #7dd3fc 100%)',
      icon: '📸',
    },
  ];

  return (
    <section className="how-it-works-section">
      <h2 className="how-it-works-title">{t('medicine_identification_title') || 'Medicine Identification Steps'}</h2>
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
