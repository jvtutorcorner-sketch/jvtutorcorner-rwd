// data/students.ts
export type Student = {
  id: string;
  name: string;
  level: string;
  goals: string[];
  preferredSubjects: string[];
};

export const STUDENTS: Student[] = [
  {
    id: 's1',
    name: '小明',
    level: '國三',
    goals: ['會考英文 B 級以上', '建立閱讀習慣'],
    preferredSubjects: ['英文', '國文'],
  },
  {
    id: 's2',
    name: '小美',
    level: '高一',
    goals: ['學測數學 12 級分', '改善解題速度'],
    preferredSubjects: ['數學'],
  },
  {
    id: 's3',
    name: 'Eric',
    level: '上班族',
    goals: ['英檢中級', '提升會議英文表達'],
    preferredSubjects: ['英文'],
  },
];

