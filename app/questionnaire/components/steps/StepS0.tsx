"use client";

import { LearningQuestionnaireValues } from '@/types/questionnaire';

interface Props {
  values: LearningQuestionnaireValues;
  onChange: (patch: Partial<LearningQuestionnaireValues>) => void;
}

export default function StepS0({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">使用條款與隱私聲明</h2>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-3 max-h-64 overflow-y-auto">
        <p><strong>資料收集與使用</strong></p>
        <p>本問卷收集您的學習需求資訊，用於媒合適合的家教老師。您的個人資料將依照個人資料保護法規定妥善保管，不會出售或分享給第三方。</p>
        <p><strong>問卷資料用途</strong></p>
        <p>填寫的資料將用於：(1) 媒合適合您需求的老師；(2) 提供個人化課程建議；(3) 改善平台服務品質。</p>
        <p><strong>資料保存期限</strong></p>
        <p>問卷資料將保存至您主動要求刪除，或帳號停用後 90 天。</p>
        <p><strong>您的權利</strong></p>
        <p>您可隨時要求查閱、更正或刪除您的個人資料。如有疑問請聯繫客服。</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={values.agreedToTerms}
          onChange={e => onChange({ agreedToTerms: e.target.checked })}
          className="mt-1 w-4 h-4 accent-green-500"
        />
        <span className="text-sm text-gray-700">
          我已閱讀並同意上述使用條款與隱私聲明，同意平台收集並處理我的問卷資料。
        </span>
      </label>
    </div>
  );
}
