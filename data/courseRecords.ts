// data/courseRecords.ts
import { Course } from './courses';
import { Student } from './students';
import { COURSES } from './courses';
import { STUDENTS } from './students';

export type CourseRecord = {
  id: string;
  date: string; // Using string for mock data simplicity
  notes: string;
  status: 'attended' | 'missed' | 'pending';
  courseId: string;
  studentId: string;
};

type CourseRecordWithNames = CourseRecord & { courseName: string; studentName: string };

// Base records data (without enrichment)
const BASE_COURSE_RECORDS: CourseRecord[] = [
  {
    id: 'cr1',
    date: '2025-12-10',
    notes: '學生在課堂上表現良好，積極參與討論。',
    status: 'attended',
    courseId: 'c1',
    studentId: 's1',
  },
  {
    id: 'cr2',
    date: '2025-12-12',
    notes: '學生因病缺席。',
    status: 'missed',
    courseId: 'c1',
    studentId: 's1',
  },
  {
    id: 'cr3',
    date: '2025-12-05',
    notes: '學生對二次函數的理解有待加強。',
    status: 'attended',
    courseId: 'c2',
    studentId: 's2',
  },
  {
    id: 'cr4',
    date: '2025-12-17',
    notes: '課程即將開始。',
    status: 'pending',
    courseId: 'c1',
    studentId: 's1',
  },
];

// Function to enrich records with course and student names
function enrichRecords(records: CourseRecord[]): CourseRecordWithNames[] {
  return records.map(record => ({
    ...record,
    courseName: COURSES.find(c => c.id === record.courseId)?.title || '',
    studentName: STUDENTS.find(s => s.id === record.studentId)?.name || '',
  }));
}

export const COURSE_RECORDS: CourseRecordWithNames[] = enrichRecords(BASE_COURSE_RECORDS);
