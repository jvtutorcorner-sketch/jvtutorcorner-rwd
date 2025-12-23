// data/courseActivities.ts
import { Course } from './courses';
import { Student } from './students';
import { COURSES } from './courses';
import { STUDENTS } from './students';

export type CourseActivity = {
  id: string;
  timestamp: string; // Using string for mock data simplicity
  description: string;
  courseId: string;
  studentId: string;
};

type CourseActivityWithNames = CourseActivity & { courseName: string; studentName: string };

// Base activities data (without enrichment)
const BASE_COURSE_ACTIVITIES: CourseActivity[] = [
  {
    id: 'ca1',
    timestamp: '2025-12-10T19:00:00Z',
    description: '出席「英檢中級聽力技巧」單元',
    courseId: 'c1',
    studentId: 's1',
  },
  {
    id: 'ca2',
    timestamp: '2025-12-12T21:00:00Z',
    description: '完成第一週回家作業：模擬測驗一份',
    courseId: 'c1',
    studentId: 's1',
  },
  {
    id: 'ca3',
    timestamp: '2025-12-05T19:30:00Z',
    description: '出席「二次函數與圖形」單元',
    courseId: 'c2',
    studentId: 's2',
  },
  {
    id: 'ca4',
    timestamp: '2025-12-17T19:00:00Z',
    description: '出席「英檢中級閱讀速度訓練」單元',
    courseId: 'c1',
    studentId: 's1',
  },
];

// Function to enrich activities with course and student names
function enrichActivities(activities: CourseActivity[]): CourseActivityWithNames[] {
  return activities.map(activity => ({
    ...activity,
    courseName: COURSES.find(c => c.id === activity.courseId)?.title || '',
    studentName: STUDENTS.find(s => s.id === activity.studentId)?.name || '',
  }));
}

export const COURSE_ACTIVITIES: CourseActivityWithNames[] = enrichActivities(BASE_COURSE_ACTIVITIES);
