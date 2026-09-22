// lib/interactionsStore.ts
//
// Server-only helper for the recommendation behavioural-signal store
// (`jvtutorcorner-user-interactions`, key = (userId HASH, interactionId RANGE)).
//
// One row per (interaction, tag). The interactionId MUST embed the tag, otherwise
// every tag written in the same batch shares `${kind}_${courseId}_${ts}` and the
// BatchWrite is rejected wholesale for duplicate keys (a real bug in the old
// tracking routes). Mirrors the `survey_${tag}_${ts}` shape in
// app/api/survey/seeds/route.ts.
//
// `buildInteractionItems` is a pure function (offline-testable, no AWS).
// `putInteractions` does the chunked BatchWrite (25/request, DynamoDB limit).

import { ddbDocClient } from '@/lib/dynamo';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const INTERACTIONS_TABLE =
  process.env.DYNAMODB_TABLE_USER_INTERACTIONS ||
  process.env.USER_INTERACTIONS_TABLE ||
  'jvtutorcorner-user-interactions';

const SEED_TTL_DAYS = 30;

export type InteractionKind = 'click' | 'purchase' | 'feedback' | 'engagement';

export interface InteractionItem {
  userId: string;
  interactionId: string;
  tag: string;
  weight: number;
  source: string;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
}

export interface BuildInteractionInput {
  userId: string;
  kind: InteractionKind;
  /** Key part; for engagement signals pass a stable token like `scroll`. */
  courseId: string;
  courseName?: string;
  tags: unknown;
  weight: number;
  /** Free-form source label, e.g. `click_homepage`, `purchase_points`. */
  source: string;
  metadata?: Record<string, unknown>;
  /** Injectable for tests; defaults to Date.now(). */
  now?: number;
}

/**
 * Build one interaction row per (deduped) tag with a collision-free interactionId.
 * Returns [] when there are no usable tags.
 */
export function buildInteractionItems(input: BuildInteractionInput): InteractionItem[] {
  const { userId, kind, courseId, courseName, weight, source, metadata } = input;
  if (!userId || !courseId) return [];

  const ts = input.now ?? Date.now();
  const tagsArray = Array.isArray(input.tags)
    ? Array.from(new Set(input.tags.filter((t): t is string => typeof t === 'string' && t.length > 0)))
    : [];
  if (tagsArray.length === 0) return [];

  const createdAt = new Date(ts).toISOString();
  const expiresAt = new Date(ts + SEED_TTL_DAYS * 86_400_000).toISOString();

  return tagsArray.map((tag) => ({
    userId,
    // Tag is part of the sort key → no duplicate keys within one batch.
    interactionId: `${kind}_${courseId}_${ts}_${tag}`,
    tag,
    weight,
    source,
    createdAt,
    expiresAt,
    ...(courseName || metadata
      ? { metadata: { ...(courseName ? { courseName } : {}), courseId, ...(metadata ?? {}) } }
      : {}),
  }));
}

/** Split into 25-item chunks (DynamoDB BatchWrite limit) and write. */
export async function putInteractions(items: InteractionItem[]): Promise<number> {
  if (!items.length) return 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddbDocClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [INTERACTIONS_TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })),
        },
      })
    );
  }
  return items.length;
}
