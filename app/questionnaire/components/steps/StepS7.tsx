"use client";

import Link from 'next/link';
import { LearningQuestionnaireValues } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  submissionId?: string;
  submitting: boolean;
}

const ROLE_LABELS = {
  student: '學生',
  parent: '家長（代子女）',
  teacher_applicant: '老師申請',
};

const URGENCY_LABELS = {
  immediate: '馬上開始',
  within_month: '一個月內',
  within_3months: '三個月內',
  flexible: '時間彈性',
};

export default function StepS7({ values, submissionId, submitting }: Props) {
  if (submitting) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-4xl animate-spin inline-block">⏳</div>
        <p className="text-gray-600">正在送出您的需求，請稍候...</p>
      </div>
    );
  }

  if (!submissionId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">準備產生媒合結果...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-semibold text-gray-800">問卷填寫完成！</h2>
        <p className="text-sm text-gray-500">
          我們已收到您的學習需求，將為您媒合最合適的老師。
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
        <h3 className="font-medium text-gray-700">您的需求摘要</h3>
        <div className="grid grid-cols-2 gap-2 text-gray-600">
          <span className="text-gray-500">身分</span>
          <span>{ROLE_LABELS[values.role]}</span>
          {values.gradeLevel && (
            <>
              <span className="text-gray-500">年級</span>
              <span>{values.gradeLevel}</span>
            </>
          )}
          {values.subjects.length > 0 && (
            <>
              <span className="text-gray-500">科目</span>
              <span>{values.subjects.join('、')}</span>
            </>
          )}
          {values.goals.length > 0 && (
            <>
              <span className="text-gray-500">目標</span>
              <span>{values.goals[0]}{values.goals.length > 1 ? ` 等 ${values.goals.length} 項` : ''}</span>
            </>
          )}
          {values.weeklyFrequency && (
            <>
              <span className="text-gray-500">頻率</span>
              <span>每週 {values.weeklyFrequency} 次</span>
            </>
          )}
          {values.budgetRange && (
            <>
              <span className="text-gray-500">預算</span>
              <span>{values.budgetRange}</span>
            </>
          )}
          {values.urgencyLevel && (
            <>
              <span className="text-gray-500">開始時間</span>
              <span>{URGENCY_LABELS[values.urgencyLevel]}</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">接下來...</p>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>我們的系統已收到您的需求並通知相關老師</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>您可以立即瀏覽平台上的老師資料</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">→</span>
            <span>老師將在 24 小時內透過 LINE 或平台訊息與您聯繫</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/teachers"
          className="block text-center bg-green-500 hover:bg-green-600 text-white font-medium px-4 py-3 rounded-xl transition-colors"
        >
          瀏覽老師列表
        </Link>
        <Link
          href="/"
          className="block text-center border border-gray-300 text-gray-700 font-medium px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
        >
          回到首頁
        </Link>
      </div>

      {submissionId && (
        <p className="text-xs text-gray-400 text-center">問卷編號：{submissionId}</p>
      )}
    </div>
  );
}
