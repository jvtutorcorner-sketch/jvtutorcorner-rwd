"use client";

import { LearningQuestionnaireValues, GRADE_LEVELS, LEARNING_STYLES } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

function toggleArray(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

export default function StepS2({ values, onChange }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-gray-800">基本資料</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          {values.role === 'parent' ? '學生年齡' : '您的年齡'}
        </label>
        <input
          type="number"
          min={4}
          max={80}
          value={values.studentAge ?? ''}
          onChange={e => onChange({ studentAge: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="請輸入年齡"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">目前年級 / 學習階段</label>
        <select
          value={values.gradeLevel || ''}
          onChange={e => onChange({ gradeLevel: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">請選擇</option>
          {GRADE_LEVELS.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">學習方式偏好（可多選）</label>
        <div className="flex flex-wrap gap-2">
          {LEARNING_STYLES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ learningStyle: toggleArray(values.learningStyle, s) })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                values.learningStyle.includes(s)
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
