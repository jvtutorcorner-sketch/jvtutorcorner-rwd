"use client";

import { LearningQuestionnaireValues, LEARNING_GOALS } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

const URGENCY_OPTIONS = [
  { value: 'immediate', label: '馬上開始（這週內）' },
  { value: 'within_month', label: '一個月內' },
  { value: 'within_3months', label: '三個月內' },
  { value: 'flexible', label: '時間彈性' },
] as const;

export default function StepS4({ values, onChange }: Props) {
  const toggleGoal = (goal: string) => {
    const newGoals = values.goals.includes(goal)
      ? values.goals.filter(g => g !== goal)
      : [...values.goals, goal];
    onChange({ goals: newGoals });
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-gray-800">學習目標</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">主要學習目標（可多選）</label>
        <div className="flex flex-wrap gap-2">
          {LEARNING_GOALS.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGoal(g)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                values.goals.includes(g)
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">目標考試 / 課程（選填）</label>
        <input
          type="text"
          value={values.targetExam || ''}
          onChange={e => onChange({ targetExam: e.target.value })}
          placeholder="例：113學測、多益800分、APCS競賽"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">希望何時開始？</label>
        <div className="grid grid-cols-2 gap-2">
          {URGENCY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ urgencyLevel: opt.value })}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                values.urgencyLevel === opt.value
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
