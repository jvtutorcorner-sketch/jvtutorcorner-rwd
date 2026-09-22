// lambda/smoke/handler.ts
//
// Smoke worker for the Phase 2.8 Lambda toolchain. It has no business logic — it
// exists to prove the build/deploy pipeline end to end (esbuild bundle → zip →
// CloudFormation → trigger), and to show the two event shapes Phase 3's async
// analysis Lambdas consume:
//   - S3 ObjectCreated  (L1: a class-audio segment lands in S3)
//   - DynamoDB Streams  (L2/L4: a lesson-segment / summary row changes)
//
// Replace this with the real ai-l1-detector / ai-segment handlers in Phase 3.

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LambdaResult {
  ok: boolean;
  source: 's3' | 'dynamodb' | 'unknown';
  records: number;
  sample: string[];
}

export async function handler(event: any): Promise<LambdaResult> {
  const records: any[] = event?.Records ?? [];
  const first = records[0];
  const source: LambdaResult['source'] = first?.s3
    ? 's3'
    : first?.eventSource === 'aws:dynamodb' || first?.dynamodb
      ? 'dynamodb'
      : 'unknown';

  const sample = records.slice(0, 3).map((r) => {
    if (r?.s3) return `s3://${r.s3.bucket?.name}/${r.s3.object?.key}`;
    if (r?.dynamodb) return `ddb:${r.eventName}:${JSON.stringify(r.dynamodb.Keys ?? {})}`;
    return 'unknown-record';
  });

  console.log(`[smoke-lambda] source=${source} records=${records.length}`, sample);
  return { ok: true, source, records: records.length, sample };
}
