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
  tags: string[];
  mode: 'online' | 'onsite';
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
    tags: ['英檢中級', '聽力閱讀', '寫作口說'],
    mode: 'online',
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
    tags: ['會考', '歷屆試題', '觀念統整'],
    mode: 'online',
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
    tags: ['商用英文', '簡報', '會議'],
    mode: 'online',
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
    tags: ['旅遊', '日常會話'],
    mode: 'online',
  },
];

