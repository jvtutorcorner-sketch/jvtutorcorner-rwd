// lib/ai/budget.ts
//
// AI spend budget enforcement (Phase 6). The pure verdict is unit-tested; the
// store-backed checkTenantBudget reads the GLOBAL + TENANT budget caps and the
// month's AI cost-rollup and decides whether a call may proceed. Wired into the
// gateway's runModel so every metered call is tenant-budget-aware. Resilient: any
// lookup failure allows the call (a budget check must never break AI).

import { getBudget } from './budgetStore';
import { getRollup } from './gateway/ledger';

export interface BudgetVerdict {
  allowed: boolean;
  over: boolean; // projected spend exceeds the cap (may still be allowed if soft)
  reason?: string;
  spentMusd: number;
  capMusd?: number;
  remainingMusd?: number;
}

/** Pure decision: does spent + est fit under the cap? hardStop denies; soft allows+flags. */
export function budgetVerdict(args: { spentMusd: number; capMusd?: number; estMusd: number; hardStop?: boolean }): BudgetVerdict {
  const spentMusd = Math.max(0, args.spentMusd || 0);
  const capMusd = args.capMusd;
  if (capMusd == null || capMusd <= 0) return { allowed: true, over: false, spentMusd };
  const projected = spentMusd + Math.max(0, args.estMusd || 0);
  const over = projected > capMusd;
  const remainingMusd = Math.max(0, capMusd - spentMusd);
  if (over && args.hardStop) return { allowed: false, over: true, reason: 'budget_exceeded', spentMusd, capMusd, remainingMusd };
  return { allowed: true, over, spentMusd, capMusd, remainingMusd };
}

export function currentYyyymm(d = new Date()): string {
  return d.toISOString().slice(0, 7).replace('-', '');
}

export interface TenantBudgetCheck {
  allowed: boolean;
  reason?: string;
  global?: BudgetVerdict;
  tenant?: BudgetVerdict;
}

/**
 * Enforce GLOBAL + TENANT monthly AI budgets. Only scopes with a configured
 * monthlyCapMusd are checked; no budget → allow (backward compatible).
 */
export async function checkTenantBudget(orgId: string | undefined, estMusd: number): Promise<TenantBudgetCheck> {
  try {
    const month = currentYyyymm();
    const evalScope = async (scopeKey: string, rollupKey: string): Promise<BudgetVerdict | null> => {
      const cfg = await getBudget(scopeKey);
      if (!cfg || cfg.monthlyCapMusd == null) return null;
      const roll = await getRollup(rollupKey);
      const spent = Number(roll?.ai_musd) || 0;
      return budgetVerdict({ spentMusd: spent, capMusd: cfg.monthlyCapMusd, estMusd, hardStop: cfg.hardStop });
    };

    const globalV = await evalScope('GLOBAL', `GLOBAL#${month}`);
    const tenantV = orgId ? await evalScope(`TENANT#${orgId}`, `TENANT#${orgId}#${month}`) : null;
    const denied = [globalV, tenantV].find((v) => v && !v.allowed) || null;
    if (denied) {
      return { allowed: false, reason: denied.reason, global: globalV ?? undefined, tenant: tenantV ?? undefined };
    }
    return { allowed: true, global: globalV ?? undefined, tenant: tenantV ?? undefined };
  } catch (e) {
    console.warn('[budget] checkTenantBudget failed, allowing', e);
    return { allowed: true };
  }
}
