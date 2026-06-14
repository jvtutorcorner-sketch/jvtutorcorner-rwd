import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

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
          discountPlans: [],
          extensions: [],
          appPlans: [],
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

    if (!settings || !settings.plans || settings.pageTitle === undefined || settings.pageDescription === undefined || !settings.mode) {
      return NextResponse.json({ ok: false, error: 'Invalid settings data' }, { status: 400 });
    }

    // Validate the settings structure
    const isValid = settings.plans.every((plan: any) =>
      typeof plan.id === 'string' &&
      typeof plan.label === 'string' &&
      (typeof plan.priceHint === 'string' || typeof plan.priceHint === 'undefined') &&
      (typeof plan.price === 'number' || typeof plan.price === 'undefined') &&
      (typeof plan.currency === 'string' || typeof plan.currency === 'undefined') &&
      (typeof plan.interval === 'string' || typeof plan.interval === 'undefined') &&
      (typeof plan.badge === 'string' || typeof plan.badge === 'undefined') &&
      (typeof plan.targetAudience === 'string' || typeof plan.targetAudience === 'undefined') &&
      (typeof plan.includedFeatures === 'string' || typeof plan.includedFeatures === 'undefined') &&
      (Array.isArray(plan.features) || typeof plan.features === 'undefined') &&
      (typeof plan.isActive === 'boolean' || typeof plan.isActive === 'undefined') &&
      typeof plan.order === 'number' &&
      (typeof plan.discountPlanId === 'string' || typeof plan.discountPlanId === 'undefined' || plan.discountPlanId === null) &&
      (Array.isArray(plan.appPlanIds) || typeof plan.appPlanIds === 'undefined')
    );

    if (!isValid) {
      console.warn('[Pricing API] Invalid plan data detected in payload');
      return NextResponse.json({ ok: false, error: 'Invalid plan data structure' }, { status: 400 });
    }

    // Validate point packages if present
    if (settings.pointPackages && !Array.isArray(settings.pointPackages)) {
      return NextResponse.json({ ok: false, error: 'Invalid pointPackages structure' }, { status: 400 });
    }

    if (settings.pointPackages) {
      const isValidPointPackages = settings.pointPackages.every((pkg: any) => {
        const check = 
          typeof pkg.id === 'string' &&
          typeof pkg.name === 'string' &&
          (typeof pkg.points === 'number' || typeof pkg.points === 'undefined') &&
          (typeof pkg.price === 'number' || typeof pkg.price === 'undefined') &&
          (typeof pkg.unitPrice === 'number' || typeof pkg.unitPrice === 'undefined') &&
          (typeof pkg.manualDiscount === 'number' || typeof pkg.manualDiscount === 'undefined') &&
          (typeof pkg.discountPlanId === 'string' || typeof pkg.discountPlanId === 'undefined' || pkg.discountPlanId === null) &&
          (typeof pkg.description === 'string' || typeof pkg.description === 'undefined') &&
          (typeof pkg.badge === 'string' || typeof pkg.badge === 'undefined') &&
          (typeof pkg.isActive === 'boolean' || typeof pkg.isActive === 'undefined') &&
          (typeof pkg.order === 'number' || typeof pkg.order === 'undefined') &&
          (Array.isArray(pkg.appPlanIds) || typeof pkg.appPlanIds === 'undefined') &&
          (typeof pkg.prePurchasePointsCost === 'number' || typeof pkg.prePurchasePointsCost === 'undefined');
        
        if (!check) {
          console.warn('[Pricing API] Validation failed for point package:', {
            id: pkg.id,
            name: pkg.name,
            points: typeof pkg.points,
            price: typeof pkg.price,
            unitPrice: typeof pkg.unitPrice,
            order: typeof pkg.order,
            isActive: typeof pkg.isActive
          });
        }
        return check;
      });

      if (!isValidPointPackages) {
        console.warn('[Pricing API] Invalid point package data detected in payload');
        return NextResponse.json({ ok: false, error: 'Invalid point package data structure' }, { status: 400 });
      }
    }

    // Validate discount plans if present
    if (settings.discountPlans && !Array.isArray(settings.discountPlans)) {
      return NextResponse.json({ ok: false, error: 'Invalid discountPlans structure' }, { status: 400 });
    }

    if (settings.discountPlans) {
      const isValidDiscountPlans = settings.discountPlans.every((plan: any) => {
        const check = 
          typeof plan.id === 'string' &&
          typeof plan.name === 'string' &&
          (plan.type === 'percentage' || plan.type === 'fixed' || typeof plan.type === 'undefined') &&
          (typeof plan.value === 'number' || typeof plan.value === 'undefined') &&
          (typeof plan.isActive === 'boolean' || typeof plan.isActive === 'undefined') &&
          (typeof plan.order === 'number' || typeof plan.order === 'undefined');

        if (!check) {
          console.warn('[Pricing API] Invalid discount plan data:', plan);
        }
        return check;
      });

      if (!isValidDiscountPlans) {
        console.warn('[Pricing API] Invalid discount plan data detected in payload');
        return NextResponse.json({ ok: false, error: 'Invalid discount plan data structure' }, { status: 400 });
      }
    }

    // Validate extensions if present
    if (settings.extensions && !Array.isArray(settings.extensions)) {
      return NextResponse.json({ ok: false, error: 'Invalid extensions structure' }, { status: 400 });
    }

    // Validate appPlans if present
    if (settings.appPlans && !Array.isArray(settings.appPlans)) {
      return NextResponse.json({ ok: false, error: 'Invalid appPlans structure' }, { status: 400 });
    }

    if (settings.appPlans) {
      const isValidAppPlans = settings.appPlans.every((plan: any) => {
        const check = 
          typeof plan.id === 'string' &&
          typeof plan.name === 'string' &&
          (typeof plan.description === 'string' || typeof plan.description === 'undefined') &&
          (typeof plan.appId === 'string' || typeof plan.appId === 'undefined') &&
          (typeof plan.appName === 'string' || typeof plan.appName === 'undefined') &&
          (typeof plan.durationDays === 'number' || typeof plan.durationDays === 'undefined') &&
          (typeof plan.pointsCost === 'number' || typeof plan.pointsCost === 'undefined') &&
          (typeof plan.isActive === 'boolean' || typeof plan.isActive === 'undefined') &&
          (typeof plan.order === 'number' || typeof plan.order === 'undefined');

        if (!check) {
          console.warn('[Pricing API] Invalid app plan data:', plan);
        }
        return check;
      });

      if (!isValidAppPlans) {
        console.warn('[Pricing API] Invalid app plan data detected in payload');
        return NextResponse.json({ ok: false, error: 'Invalid app plan data structure' }, { status: 400 });
      }

      // Validate referential integrity - app plans referenced in plans and pointPackages must exist in appPlans
      const validAppPlanIds = new Set(settings.appPlans.map((ap: any) => ap.id));
      
      const plansWithBadRefs = (settings.plans || []).filter((p: any) =>
        (p.appPlanIds || []).some((id: string) => !validAppPlanIds.has(id))
      );
      
      const pkgsWithBadRefs = (settings.pointPackages || []).filter((pkg: any) =>
        (pkg.appPlanIds || []).some((id: string) => !validAppPlanIds.has(id))
      );

      if (plansWithBadRefs.length > 0) {
        console.warn('[Pricing API] Plans with invalid app plan references:', plansWithBadRefs.map((p: any) => p.id));
        return NextResponse.json({ 
          ok: false, 
          error: `Subscription plans reference non-existent app plans: ${plansWithBadRefs.map((p: any) => p.id).join(', ')}`
        }, { status: 400 });
      }
      
      if (pkgsWithBadRefs.length > 0) {
        console.warn('[Pricing API] Point packages with invalid app plan references:', pkgsWithBadRefs.map((p: any) => p.id));
        return NextResponse.json({ 
          ok: false, 
          error: `Point packages reference non-existent app plans: ${pkgsWithBadRefs.map((p: any) => p.id).join(', ')}`
        }, { status: 400 });
      }
    }

    await savePricingSettings(settings);
    
    // Log data relationships for validation
    console.log('[Pricing API] Data saved successfully:');
    console.log(`  - Plans: ${settings.plans?.length || 0} items`);
    console.log(`  - Extensions: ${settings.extensions?.length || 0} items`);
    console.log(`  - Point Packages: ${settings.pointPackages?.length || 0} items`);
    console.log(`  - Discount Plans: ${settings.discountPlans?.length || 0} items`);
    console.log(`  - App Plans: ${settings.appPlans?.length || 0} items`);
    
    // Log app plan bindings
    const plansWithAppBindings = (settings.plans || []).filter((p: any) => (p.appPlanIds || []).length > 0);
    const pkgsWithAppBindings = (settings.pointPackages || []).filter((pkg: any) => (pkg.appPlanIds || []).length > 0);
    
    if (plansWithAppBindings.length > 0) {
      console.log(`  - Subscription plans with app bindings: ${plansWithAppBindings.length}`);
      plansWithAppBindings.forEach((p: any) => {
        console.log(`    - Plan "${p.label}" (${p.id}): bound to ${p.appPlanIds.length} app plans`);
      });
    }
    
    if (pkgsWithAppBindings.length > 0) {
      console.log(`  - Point packages with app bindings: ${pkgsWithAppBindings.length}`);
      pkgsWithAppBindings.forEach((pkg: any) => {
        console.log(`    - Package "${pkg.name}" (${pkg.id}): bound to ${pkg.appPlanIds.length} app plans`);
      });
    }
    
    // Log time-related data
    const appPlansWithDuration = (settings.appPlans || []).filter((ap: any) => ap.durationDays);
    if (appPlansWithDuration.length > 0) {
      console.log(`  - App plans with duration: ${appPlansWithDuration.length}`);
      appPlansWithDuration.forEach((ap: any) => {
        console.log(`    - "${ap.name}" (${ap.id}): ${ap.durationDays} days`);
      });
    }
    
    // Log points-related data
    const appPlansWithPointsCost = (settings.appPlans || []).filter((ap: any) => ap.pointsCost && ap.pointsCost > 0);
    if (appPlansWithPointsCost.length > 0) {
      console.log(`  - App plans with points cost: ${appPlansWithPointsCost.length}`);
      appPlansWithPointsCost.forEach((ap: any) => {
        console.log(`    - "${ap.name}" (${ap.id}): ${ap.pointsCost} points`);
      });
    }
    
    const pkgsWithPointsCost = (settings.pointPackages || []).filter((pkg: any) => pkg.prePurchasePointsCost && pkg.prePurchasePointsCost > 0);
    if (pkgsWithPointsCost.length > 0) {
      console.log(`  - Point packages with points cost: ${pkgsWithPointsCost.length}`);
      pkgsWithPointsCost.forEach((pkg: any) => {
        const pointsAfter = (pkg.points || 0) - (pkg.prePurchasePointsCost || 0);
        console.log(`    - "${pkg.name}" (${pkg.id}): ${pkg.prePurchasePointsCost} points before + ${pkg.points} points = ${pointsAfter} points after`);
      });
    }
    
    return NextResponse.json({ ok: true, settings });
  } catch (err: any) {
    console.error('[Pricing API] Failed to save pricing settings:', err);
    return NextResponse.json({
      ok: false,
      error: err?.message || 'Failed to save settings'
    }, { status: 500 });
  }
}