import crypto from 'crypto';
import { getMakeConfig } from './makeRuntimeConfig';
import type { QuestionnaireSubmission } from '@/types/questionnaire';

export interface MakeEventPayload {
  eventType: string;
  eventId: string;
  timestamp: string;
  sourceSystem: string;
  data: Record<string, unknown>;
}

export async function triggerMakeComEvent(
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const config = await getMakeConfig();
  if (!config.configured || !config.webhookUrl) {
    console.warn('[makeComConfig] Make.com webhook not configured — skipping event', eventType);
    return;
  }

  const payload: MakeEventPayload = {
    eventType,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sourceSystem: 'jvtutorcorner',
    data,
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (config.webhookSecret) {
    const sig = crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
    headers['x-make-signature'] = sig;
  }

  const res = await fetch(config.webhookUrl, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`Make.com webhook responded ${res.status}: ${await res.text()}`);
  }
}

export function buildQuestionnairePayload(submission: QuestionnaireSubmission): Record<string, unknown> {
  const d = submission.data;
  return {
    submissionId: submission.id,
    userId: submission.userId,
    lineUserId: submission.lineUid || null,
    displayName: submission.displayName || null,
    mode: submission.mode,
    submittedAt: submission.submittedAt,
    role: d.role,
    gradeLevel: d.gradeLevel || null,
    studentAge: d.studentAge || null,
    subjects: d.subjects,
    difficultyLevel: d.difficultyLevel,
    learningStyle: d.learningStyle,
    goals: d.goals,
    targetExam: d.targetExam || null,
    urgencyLevel: d.urgencyLevel || null,
    schedule: {
      weeklyFrequency: d.weeklyFrequency || null,
      sessionLength: d.sessionLength || null,
      preferredDays: d.preferredDays,
      preferredTimeSlots: d.preferredTimeSlots,
    },
    preferences: {
      budgetRange: d.budgetRange || null,
      tutorGenderPref: d.tutorGenderPref || null,
      teachingStylePref: d.teachingStylePref,
      onlineOrInPerson: d.onlineOrInPerson || null,
      specialRequirements: d.specialRequirements || null,
    },
  };
}
