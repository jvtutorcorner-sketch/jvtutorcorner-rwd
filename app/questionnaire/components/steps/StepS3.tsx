"use client";

import { LearningQuestionnaireValues, SUBJECTS } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

const DIFFICULTY_LABELS = { easy: '偏易', medium: '普通', hard: '偏難' } as const;

export default function StepS3({ values, onChange }: Props) {
  const toggleSubject = (subject: string) => {
    const newSubjects = values.subjects.includes(subject)
      ? values.subjects.filter(s => s !== subject)
      : [...values.subjects, subject];

    const newDifficulty = { ...values.difficultyLevel };
    if (!newSubjects.includes(subject)) {
      delete newDifficulty[subject];
    } else if (!newDifficulty[subject]) {
      newDifficulty[subject] = 'medium';
    }

    onChange({ subjects: newSubjects, difficultyLevel: newDifficulty });
  };

  const setDifficulty = (subject: string, level: 'easy' | 'medium' | 'hard') => {
    onChange({ difficultyLevel: { ...values.difficultyLevel, [subject]: level } });
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-gray-800">需要補習的科目</h2>
      <p className="text-sm text-gray-500">請選擇需要家教輔導的科目，並評估目前程度。</p>

      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSubject(s)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              values.subjects.includes(s)
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {values.subjects.length > 0 && (
        <div className="space-y-3 mt-4">
          <p className="text-sm font-medium text-gray-700">評估各科目目前程度：</p>
          {values.subjects.map(subject => (
            <div key={subject} className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-800 w-28 shrink-0">{subject}</span>
              <div className="flex gap-1">
                {(['easy', 'medium', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(subject, level)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      values.difficultyLevel[subject] === level
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {DIFFICULTY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
