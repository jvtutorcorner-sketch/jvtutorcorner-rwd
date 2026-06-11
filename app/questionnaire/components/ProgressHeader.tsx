"use client";

import { STEP_LABELS, QUESTIONNAIRE_STEPS } from '@/types/questionnaire';

interface ProgressHeaderProps {
  currentStep: number;
  totalSteps?: number;
}

export default function ProgressHeader({ currentStep, totalSteps = QUESTIONNAIRE_STEPS.length }: ProgressHeaderProps) {
  const percent = Math.round((currentStep / (totalSteps - 1)) * 100);
  const stepKey = QUESTIONNAIRE_STEPS[currentStep];
  const label = stepKey ? STEP_LABELS[stepKey] : '';

  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>步驟 {currentStep + 1} / {totalSteps}</span>
        <span>{label}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
