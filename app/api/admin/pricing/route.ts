import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import resolveDataFile from '@/lib/localData';
import {
  PLAN_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_PRICES,
  PLAN_FEATURES,
  PLAN_TARGETS,
  PlanId,
} from '@/lib/mockAuth';

// Default values for new fields
// Use shared PLAN_TARGETS from mockAuth as the source of truth for '適合對象'
const PLAN_TARGET_AUDIENCE = PLAN_TARGETS;

const PLAN_INCLUDED_FEATURES: Record<PlanId, string> = {
  viewer: '課程瀏覽、師資查詢',
  basic: '可預約老師、一般畫質視訊、App 基本功能',
  pro: '高畫質視訊、內建線上白板、課後雲端錄影回放',
  elite: '高速視訊、支援並行串流、完整錄影、高端師資',
};

const PLAN_PRICE_HINT: Record<PlanId, string> = {
  viewer: 'NT$0 / 僅查詢',
  basic: '最低入門價（可到時再定價）',
  pro: '主力方案，建議訂為 Basic 的 2–3 倍',
  elite: '高客單價、可採合約制或專案報價',
};

const PLAN_BADGE: Record<PlanId, string | undefined> = {
  viewer: '預設',
  basic: undefined,
  pro: '推薦',
  elite: undefined,
};

type PricingSettings = {
  pageTitle: string;
  pageDescription: string;
  plans: {
    id: string;
    label: string;
    priceHint?: string;
    badge?: string | undefined;
    targetAudience: string;
    includedFeatures: string;
    features: string[];
    isActive: boolean;
    order: number;
  }[];
};

const SETTINGS_FILE = 'pricing_settings.json';

async function readPricingSettings(): Promise<PricingSettings> {
  try {
    const filePath = await resolveDataFile(SETTINGS_FILE);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // Return default settings from mockAuth
    const planIds: PlanId[] = ['viewer', 'basic', 'pro', 'elite'];
    return {
      pageTitle: '方案與價格',
      pageDescription: '選擇最適合您的會員方案',
      plans: planIds.map((id, index) => ({
        id,
        label: PLAN_LABELS[id],
        priceHint: PLAN_PRICE_HINT[id],
        badge: PLAN_BADGE[id],
        targetAudience: PLAN_TARGET_AUDIENCE[id],
        includedFeatures: PLAN_INCLUDED_FEATURES[id],
        features: PLAN_FEATURES[id],
        isActive: true,
        order: index,
      })),
    };
  }
}

async function writePricingSettings(settings: PricingSettings): Promise<void> {
  try {
    const filePath = await resolveDataFile(SETTINGS_FILE);
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save pricing settings:', err);
    throw new Error('Failed to save settings');
  }
}

export async function GET() {
  try {
    const settings = await readPricingSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('Failed to read pricing settings:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to read settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { settings } = body;

    if (!settings || !settings.plans || !settings.pageTitle || !settings.pageDescription) {
      return NextResponse.json({ ok: false, error: 'Invalid settings data' }, { status: 400 });
    }

    // Validate the settings structure
    const isValid = settings.plans.every((plan: any) =>
      typeof plan.id === 'string' &&
      typeof plan.label === 'string' &&
      (typeof plan.priceHint === 'string' || typeof plan.priceHint === 'undefined') &&
      (typeof plan.badge === 'string' || typeof plan.badge === 'undefined') &&
      typeof plan.targetAudience === 'string' &&
      typeof plan.includedFeatures === 'string' &&
      Array.isArray(plan.features) &&
      typeof plan.isActive === 'boolean' &&
      typeof plan.order === 'number'
    );

    if (!isValid) {
      return NextResponse.json({ ok: false, error: 'Invalid plan data structure' }, { status: 400 });
    }

    await writePricingSettings(settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('Failed to save pricing settings:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to save settings' }, { status: 500 });
  }
}