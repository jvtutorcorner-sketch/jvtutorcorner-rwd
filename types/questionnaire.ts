export type QuestionnaireRole = 'student' | 'parent' | 'teacher_applicant';

export const GRADE_LEVELS = [
  '幼稚園', '小學1-2年級', '小學3-4年級', '小學5-6年級',
  '國中1年級', '國中2年級', '國中3年級',
  '高中1年級', '高中2年級', '高中3年級',
  '大學', '研究所', '成人進修',
];

export const SUBJECTS = [
  '數學', '英文', '國文/語文', '自然科學', '物理', '化學', '生物',
  '地球科學', '歷史', '地理', '公民', '社會', '資訊/程式設計',
  '音樂', '美術', '體育', '日文', '法文', '西班牙文', '其他',
];

export const LEARNING_GOALS = [
  '升學考試（基測/學測/指考）', '補救教學', '預習/超前學習',
  '作業/功課輔導', '興趣培養', '競賽/奧林匹亞', '語言檢定（TOEIC/IELTS等）',
  '職場技能提升', '其他',
];

export const LEARNING_STYLES = [
  '需要大量練習題', '喜歡老師詳細講解', '偏好互動式教學',
  '需要結構化課程大綱', '喜歡邊做邊學', '喜歡視覺化圖表',
];

export const PREFERRED_DAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export const PREFERRED_TIME_SLOTS = [
  '早上 8:00-12:00', '下午 12:00-17:00', '晚上 17:00-21:00', '晚上 21:00 以後',
];

export const BUDGET_RANGES = [
  '每小時 500 元以下', '每小時 500-800 元', '每小時 800-1200 元',
  '每小時 1200-2000 元', '每小時 2000 元以上', '不限',
];

export const TEACHING_STYLES = [
  '耐心、循序漸進', '嚴格、要求高', '活潑、互動多',
  '重視解題技巧', '重視觀念理解', '彈性調整',
];

export interface LearningQuestionnaireValues {
  // S0
  agreedToTerms: boolean;
  // S1
  role: QuestionnaireRole;
  // S2
  studentAge?: number;
  gradeLevel?: string;
  learningStyle: string[];
  // S3
  subjects: string[];
  difficultyLevel: Record<string, 'easy' | 'medium' | 'hard'>;
  // S4
  goals: string[];
  targetExam?: string;
  urgencyLevel?: 'immediate' | 'within_month' | 'within_3months' | 'flexible';
  // S5
  weeklyFrequency?: '1' | '2' | '3' | '4+';
  sessionLength?: '60' | '90' | '120';
  preferredDays: string[];
  preferredTimeSlots: string[];
  // S6
  budgetRange?: string;
  tutorGenderPref?: 'male' | 'female' | 'no_preference';
  teachingStylePref: string[];
  onlineOrInPerson?: 'online' | 'in_person' | 'both';
  specialRequirements?: string;
}

export const defaultValues: LearningQuestionnaireValues = {
  agreedToTerms: false,
  role: 'student',
  studentAge: undefined,
  gradeLevel: '',
  learningStyle: [],
  subjects: [],
  difficultyLevel: {},
  goals: [],
  targetExam: '',
  urgencyLevel: undefined,
  weeklyFrequency: undefined,
  sessionLength: undefined,
  preferredDays: [],
  preferredTimeSlots: [],
  budgetRange: '',
  tutorGenderPref: undefined,
  teachingStylePref: [],
  onlineOrInPerson: undefined,
  specialRequirements: '',
};

export const QUESTIONNAIRE_STEPS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const;

export const STEP_LABELS: Record<string, string> = {
  S0: '條款',
  S1: '角色',
  S2: '基本資料',
  S3: '科目需求',
  S4: '學習目標',
  S5: '時間安排',
  S6: '偏好設定',
  S7: '媒合結果',
};

export interface QuestionnaireSubmission {
  id: string;
  userId: string;
  lineUid?: string;
  displayName?: string;
  mode: string;
  data: LearningQuestionnaireValues;
  submittedAt: string;
  createdAt: string;
  makeComSent?: boolean;
}
