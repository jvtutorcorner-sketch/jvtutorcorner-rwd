// Types for the AI class-summary feature. Kept dependency-free so the pure logic in
// summaryLogic.ts stays offline-testable (scripts/verify-class-summary.mjs).

export type SummaryStatus =
  | 'RECORDING' // class in progress, audio segments arriving
  | 'PENDING' // class ended, waiting to be processed
  | 'PROCESSING' // a worker claimed it (STT + LLM running)
  | 'READY' // summary produced
  | 'FAILED' // gave up after max attempts
  | 'SKIPPED'; // recording consent not granted by both sides

export type ClassroomRole = 'teacher' | 'student' | 'assistant' | 'observer';

export interface ConsentRecord {
  role: ClassroomRole;
  userId: string;
  agreed: boolean;
  /** epoch ms */
  at: number;
  /** terms version the participant agreed to */
  version: string;
}

/** One transcribed span, tagged with which participant's mic it came from. */
export interface TranscriptSegment {
  role: ClassroomRole;
  /** ms since class start (each mic is recorded independently and interleaved by this). */
  startMs: number;
  text: string;
}

/** The strict-JSON shape the LLM must return (see buildSummaryPrompt). */
export interface SummaryJson {
  summary: string;
  keyConcepts: string[];
  teacherHighlights: string[];
  studentDifficulties: string[];
  homework: string[];
  nextLessonSuggestions: string[];
  vocabulary: Array<{ term: string; meaning: string }>;
  confidence: 'high' | 'medium' | 'low';
  /** true when the transcript was too thin to summarize responsibly. */
  insufficient?: boolean;
}

export interface ClassSummaryRow {
  summaryId: string;
  courseId: string;
  orderId: string;
  teacherId: string;
  studentId?: string;
  status: SummaryStatus;
  consent: ConsentRecord[];
  /** false if recording was disabled for the course or declined. */
  recordingEnabled: boolean;
  audioKeys: string[]; // S3 keys, one per uploaded segment
  boardKeys: string[]; // S3 keys, whiteboard page PNGs
  pdfKey?: string;
  transcriptKey?: string;
  summary?: SummaryJson;
  attempts: number;
  model?: string;
  costTokens?: number;
  /** ISO 8601 — also the byStatus GSI range key (lexicographically sortable). */
  createdAt: string;
  /** epoch ms */
  updatedAt: number;
}
