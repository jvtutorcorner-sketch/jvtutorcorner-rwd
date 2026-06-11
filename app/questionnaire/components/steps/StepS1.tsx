"use client";

import { LearningQuestionnaireValues, QuestionnaireRole } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

const ROLES: { value: QuestionnaireRole; label: string; desc: string; emoji: string }[] = [
  { value: 'student', label: '學生本人', desc: '本人填寫自己的學習需求', emoji: '📚' },
  { value: 'parent', label: '家長', desc: '代子女填寫學習需求', emoji: '👨‍👩‍👧' },
  { value: 'teacher_applicant', label: '老師申請', desc: '我想在平台擔任家教老師', emoji: '🎓' },
];

export default function StepS1({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">請問您的身分是？</h2>
      <p className="text-sm text-gray-500">選擇您填寫此問卷的身分，以便為您提供最合適的服務。</p>
      <div className="grid gap-3">
        {ROLES.map(r => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange({ role: r.value })}
            className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              values.role === r.value
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="text-3xl">{r.emoji}</span>
            <div>
              <p className="font-medium text-gray-800">{r.label}</p>
              <p className="text-sm text-gray-500">{r.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
