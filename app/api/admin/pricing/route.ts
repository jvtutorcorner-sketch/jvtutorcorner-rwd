import { NextResponse } from 'next/server';
import {
  getPricingSettings,
  savePricingSettings,
  PricingSettings,
} from '@/lib/pricingService';

export async function GET() {
  try {
    const settings = await getPricingSettings();
    
    if (!settings) {
      // Return empty structure if no data exists in DynamoDB
      return NextResponse.json({
        ok: true,
        settings: {
          pageTitle: '方案與價格',
          pageDescription: '選擇最適合您的會員方案',
          mode: 'subscription',
          plans: [],
          pointPackages: [],
        }
      });
    }

    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('[Pricing API] Failed to read pricing settings:', err);
    return NextResponse.json({ 
      ok: false, 
      error: err?.message || 'Failed to read settings' 
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { settings } = body;

    if (!settings || !settings.plans || !settings.pageTitle || !settings.pageDescription || !settings.mode) {
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

    // Validate point packages if present
    if (settings.pointPackages && !Array.isArray(settings.pointPackages)) {
      return NextResponse.json({ ok: false, error: 'Invalid pointPackages structure' }, { status: 400 });
    }

    if (settings.pointPackages) {
      const isValidPointPackages = settings.pointPackages.every((pkg: any) =>
        typeof pkg.id === 'string' &&
        typeof pkg.name === 'string' &&
        typeof pkg.points === 'number' &&
        typeof pkg.price === 'number' &&
        (typeof pkg.bonus === 'number' || typeof pkg.bonus === 'undefined') &&
        (typeof pkg.description === 'string' || typeof pkg.description === 'undefined') &&
        (typeof pkg.badge === 'string' || typeof pkg.badge === 'undefined') &&
        typeof pkg.isActive === 'boolean' &&
        typeof pkg.order === 'number'
      );

      if (!isValidPointPackages) {
        return NextResponse.json({ ok: false, error: 'Invalid point package data structure' }, { status: 400 });
      }
    }

    await savePricingSettings(settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('[Pricing API] Failed to save pricing settings:', err);
    return NextResponse.json({ 
      ok: false, 
      error: err?.message || 'Failed to save settings' 
    }, { status: 500 });
  }
}