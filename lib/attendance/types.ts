// lib/attendance/types.ts
// Shape of items in the jvtutorcorner-attendance DynamoDB table (schemaless — this is documentation, not enforcement).

export type AttendanceStatus = 'PRESENT';

export interface AttendanceRecord {
  id: string;
  orderId: string;
  courseId: string;

  /**
   * The course session (梯次/場次) this check-in belongs to, or null.
   *
   * Without it a course that meets more than once produces check-ins that know
   * WHO and WHICH COURSE but not WHICH MEETING, so per-occurrence attendance
   * cannot be reported. Populated from the enrollment's courseSessionId; stays
   * null for enrollments created before the session entity existed.
   */
  courseSessionId?: string | null;

  studentId: string;
  studentName: string;
  studentEmail?: string;
  scannedAt: string; // ISO timestamp
  status: AttendanceStatus;
  scannedByUserId: string;
  scannedByName?: string;
  createdAt: string;
}

export const ATTENDANCE_TABLE = process.env.DYNAMODB_TABLE_ATTENDANCE || 'jvtutorcorner-attendance';
