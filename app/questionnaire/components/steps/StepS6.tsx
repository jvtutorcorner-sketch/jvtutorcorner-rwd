"use client";

import { LearningQuestionnaireValues, BUDGET_RANGES, TEACHING_STYLES } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

function toggleArray(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

const GENDER_OPTIONS = [
  { value: 'no_preference', label: '不限' },
  { value: 'male', label: '男老師' },
  { value: 'female', label: '女老師' },
] as const;

const MODE_OPTIONS = [
  { value: 'online', label: '線上上課', emoji: '💻' },
  { value: 'in_person', label: '實體到府', emoji: '🏠' },
  { value: 'both', label: '線上或實體皆可', emoji: '🔄' },
] as const;

export default function StepS6({ values, onChange }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-gray-800">偏好設定</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">每小時預算</label>
        <div className="grid grid-cols-2 gap-2">
          {BUDGET_RANGES.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => onChange({ budgetRange: b })}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                values.budgetRange === b
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">上課方式</label>
        <div className="grid grid-cols-3 gap-2">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ onlineOrInPerson: opt.value })}
              className={`px-2 py-3 rounded-lg text-sm border transition-colors text-center ${
                values.onlineOrInPerson === opt.value
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="text-xl mb-1">{opt.emoji}</div>
              <div>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">老師性別偏好</label>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ tutorGenderPref: opt.value })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                values.tutorGenderPref === opt.value
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
        <label className="text-sm font-medium text-gray-700">教學風格偏好（可多選）</label>
        <div className="flex flex-wrap gap-2">
          {TEACHING_STYLES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ teachingStylePref: toggleArray(values.teachingStylePref, s) })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                values.teachingStylePref.includes(s)
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">其他特殊需求（選填）</label>
        <textarea
          value={values.specialRequirements || ''}
          onChange={e => onChange({ specialRequirements: e.target.value })}
          placeholder="例：需要老師有特定科系背景、有教學障礙學生的經驗等"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
        />
      </div>
    </div>
  );
}
