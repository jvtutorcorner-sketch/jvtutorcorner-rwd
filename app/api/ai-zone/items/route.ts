import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';
import {
  createAiZoneItem,
  deleteAiZoneItem,
  listAllAiZoneItems,
  listPublishedAiZoneItems,
  toPublicAiZoneItem,
  updateAiZoneItem,
  type AiZoneItemInput,
} from '@/lib/aiZoneContentService';
import { deleteAiZoneMedia } from '@/lib/aiZoneMedia';

export const dynamic = 'force-dynamic';

// 首頁與 /ai-zone 都是 ISR（revalidate 300），不主動失效的話後台改動最多要 5 分鐘才看得到。
function revalidateAiZonePages() {
  revalidatePath('/');
  revalidatePath('/ai-zone');
}

function pickInput(body: Record<string, unknown>): AiZoneItemInput {
  const input: AiZoneItemInput = {};
  for (const key of ['order', 'label', 'title', 'subtitle', 'note', 'videoKey', 'posterKey', 'durationSec', 'published'] as const) {
    if (body[key] !== undefined) (input as Record<string, unknown>)[key] = body[key];
  }
  return input;
}

// 後台清單：含未發布的資料與原始 key。
const adminList = withAdmin(async () => {
  try {
    const records = await listAllAiZoneItems();
    return NextResponse.json({
      ok: true,
      items: records.map((r) => ({ ...r, ...toPublicAiZoneItem(r) })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('all') === '1') return adminList(request);
  return NextResponse.json({ ok: true, items: await listPublishedAiZoneItems() });
}

export const POST = withAdmin(async (request: AuthedRequest) => {
  try {
    const result = await createAiZoneItem(pickInput(await request.json()));
    if (typeof result === 'string') return NextResponse.json({ ok: false, error: result }, { status: 400 });
    revalidateAiZonePages();
    return NextResponse.json({ ok: true, item: result });
  } catch (err) {
    console.error('[ai-zone] POST failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});

export const PATCH = withAdmin(async (request: AuthedRequest) => {
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || !body.id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    }
    const result = await updateAiZoneItem(body.id, pickInput(body));
    if (result === null) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    if (typeof result === 'string') return NextResponse.json({ ok: false, error: result }, { status: 400 });
    await deleteAiZoneMedia(result.replaced);
    revalidateAiZonePages();
    return NextResponse.json({ ok: true, item: result.record });
  } catch (err) {
    console.error('[ai-zone] PATCH failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});

export const DELETE = withAdmin(async (request: AuthedRequest) => {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    const removed = await deleteAiZoneItem(id);
    if (!removed) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    await deleteAiZoneMedia([removed.videoKey, removed.posterKey]);
    revalidateAiZonePages();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ai-zone] DELETE failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
