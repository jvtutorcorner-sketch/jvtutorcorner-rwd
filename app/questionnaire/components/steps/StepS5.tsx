"use client";

import { LearningQuestionnaireValues, PREFERRED_DAYS, PREFERRED_TIME_SLOTS } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

function toggleArray(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

const FREQUENCY_OPTIONS = [
  { value: '1', label: '每週 1 次' },
  { value: '2', label: '每週 2 次' },
  { value: '3', label: '每週 3 次' },
  { value: '4+', label: '每週 4 次以上' },
] as const;

const SESSION_OPTIONS = [
  { value: '60', label: '60 分鐘' },
  { value: '90', label: '90 分鐘' },
  { value: '120', label: '120 分鐘' },
] as const;

export default function StepS5({ values, onChange }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-gray-800">時間安排</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">每週上課頻率</label>
        <div className="grid grid-cols-2 gap-2">
          {FREQUENCY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ weeklyFrequency: opt.value })}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                values.weeklyFrequency === opt.value
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">每次上課時長</label>
        <div className="flex gap-2">
          {SESSION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ sessionLength: opt.value })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                values.sessionLength === opt.value
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">偏好上課日（可多選）</label>
        <div className="flex flex-wrap gap-2">
          {PREFERRED_DAYS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ preferredDays: toggleArray(values.preferredDays, d) })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                values.preferredDays.includes(d)
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">偏好上課時段（可多選）</label>
        <div className="space-y-2">
          {PREFERRED_TIME_SLOTS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ preferredTimeSlots: toggleArray(values.preferredTimeSlots, t) })}
              className={`w-full px-3 py-2 rounded-lg text-sm border text-left transition-colors ${
                values.preferredTimeSlots.includes(t)
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
