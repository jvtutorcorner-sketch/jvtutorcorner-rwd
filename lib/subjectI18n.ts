import { SUBJECTS } from '@/types/questionnaire';

/**
 * 科目的「值」是資料層的一部分：它會進到 query string，也直接拿去比對
 * DynamoDB 裡老師的 subjects 欄位（存的是繁體中文）。所以值不能翻譯，
 * 只能翻譯顯示用的標籤——這份對照表就是值到翻譯 key 的橋樑。
 */
const SUBJECT_KEYS: Record<string, string> = {
  數學: 'subject_math',
  英文: 'subject_english',
  '國文/語文': 'subject_chinese',
  自然科學: 'subject_natural_science',
  物理: 'subject_physics',
  化學: 'subject_chemistry',
  生物: 'subject_biology',
  地球科學: 'subject_earth_science',
  歷史: 'subject_history',
  地理: 'subject_geography',
  公民: 'subject_civics',
  社會: 'subject_social_studies',
  '資訊/程式設計': 'subject_computing',
  音樂: 'subject_music',
  美術: 'subject_art',
  體育: 'subject_pe',
  日文: 'subject_japanese',
  法文: 'subject_french',
  西班牙文: 'subject_spanish',
  其他: 'subject_other',
};

/**
 * 取得科目的翻譯 key。沒有對照的科目（例如老師自填的）會回傳原字串，
 * t() 查不到就會原樣輸出，不會在畫面上印出識別字。
 */
export function subjectKey(subject: string): string {
  return SUBJECT_KEYS[subject] ?? subject;
}

/** SUBJECTS 目前是否每一項都有對照，供測試使用。 */
export function untranslatedSubjects(): string[] {
  return SUBJECTS.filter((s) => !(s in SUBJECT_KEYS));
}
