// data/courses.ts
export type Course = {
  id: string;
  title: string;
  subject: string;
  level: string;
  language: string;
  teacherName: string;
  pricePerSession: number;
  durationMinutes: number;
  // optional: classroom session countdown default (minutes)
  sessionDurationMinutes?: number;
  tags: string[];
  mode: 'online' | 'onsite';
  description?: string;
  nextStartDate?: string;
  totalSessions?: number;
  seatsLeft?: number;
  currency?: string;
};

export const COURSES: Course[] = [
  {
    id: 'c1',
    title: '英檢中級衝刺班（12 週）',
    subject: '英文',
    level: '國高中',
    language: '中文＋英文',
    teacherName: '林老師',
    pricePerSession: 900,
    durationMinutes: 90,
    // sessionDurationMinutes controls the classroom countdown default (minutes)
    sessionDurationMinutes: 50,
    tags: ['英檢中級', '聽力閱讀', '寫作口說'],
    mode: 'online',
    description:
      '針對英檢中級設計的完整衝刺課程，每週 2 堂，涵蓋聽、說、讀、寫四大範疇，課堂中會演練歷屆試題並教你掌握得分關鍵。',
    nextStartDate: '2025-12-10',
    totalSessions: 24,
    seatsLeft: 5,
    currency: 'TWD',
  },
  {
    id: 'c2',
    title: '國三會考總復習：數學重點題型',
    subject: '數學',
    level: '國中',
    language: '中文',
    teacherName: '陳老師',
    pricePerSession: 750,
    durationMinutes: 90,
    sessionDurationMinutes: 50,
    tags: ['會考', '歷屆試題', '觀念統整'],
    mode: 'online',
    description:
      '針對國三會考數學設計，重點整理＋歷屆試題分析，用系統化方式幫助學生建立解題架構，而不是死背公式。',
    nextStartDate: '2025-12-05',
    totalSessions: 16,
    seatsLeft: 8,
    currency: 'TWD',
  },
  {
    id: 'c3',
    title: '商用英語會議表達技巧',
    subject: '英文',
    level: '大專 / 社會人士',
    language: '英文',
    teacherName: '王老師',
    pricePerSession: 1200,
    durationMinutes: 60,
    sessionDurationMinutes: 50,
    tags: ['商用英文', '簡報', '會議'],
    mode: 'online',
    description:
      '針對需要參與英文會議的職場人士設計，實際演練會議開場、意見表達、反對與折衷、結論收斂等情境。',
    nextStartDate: '2025-12-15',
    totalSessions: 10,
    seatsLeft: 3,
    currency: 'TWD',
  },
  {
    id: 'c4',
    title: '旅遊日文：跟團自助都好用',
    subject: '日文',
    level: '入門',
    language: '日文＋中文',
    teacherName: '佐藤先生',
    pricePerSession: 850,
    durationMinutes: 60,
    sessionDurationMinutes: 50,
    tags: ['旅遊', '日常會話'],
    mode: 'online',
    description:
      '從零開始學習旅遊常用句型，包含交通、購物、用餐、問路等實用情境，讓你去日本不再只會說「すみません」。',
    nextStartDate: '2025-12-20',
    totalSessions: 8,
    seatsLeft: 10,
    currency: 'TWD',
  },
];
