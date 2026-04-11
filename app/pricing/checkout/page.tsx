"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useT } from '@/components/IntlProvider';
import {
    getStoredUser,
    setStoredUser,
    StoredUser,
    PlanId,
    PLAN_LABELS,
    PLAN_PRICES,
    PLAN_FEATURES
} from '@/lib/mockAuth';
import { SubscriptionConfig } from '@/lib/subscriptionsService';
import Link from 'next/link';

function CheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const t = useT();

    const [user, setUser] = useState<StoredUser | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activePaymentMethods, setActivePaymentMethods] = useState<string[]>([]);
    const [loadingPayments, setLoadingPayments] = useState(true);

    // Extract from query params
    const planId = searchParams.get('plan');
    const isMockPlan = planId ? Boolean((PLAN_LABELS as Record<string, string>)[planId]) : false;
    const [itemData, setItemData] = useState<{
        type: 'PLAN' | 'POINTS';
        label: string;
        price: number;
        features: string[];
        description?: string;
        points?: number;
        appPlanIds?: string[];
        prePurchasePointsCost?: number;
    } | null>(null);
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        setMounted(true);
        const currentUser = getStoredUser();
        setUser(currentUser);

        if (!currentUser) {
            router.push('/login');
            return;
        }

        if (!planId || planId === 'viewer') {
            router.push('/pricing');
            return;
        }

        // Fetch enabled payment methods
        const fetchPaymentMethods = async () => {
            try {
                const res = await fetch('/api/app-integrations');
                const data = await res.json();
                if (data.ok && Array.isArray(data.data)) {
                    const activeTypes = data.data
                        .filter((app: any) => app.status === 'ACTIVE')
                        .map((app: any) => app.type);
                    setActivePaymentMethods(activeTypes);
                }
            } catch (err) {
                console.error('Failed to fetch payment methods', err);
            } finally {
                setLoadingPayments(false);
            }
        };
        fetchPaymentMethods();

        if (!isMockPlan) {
            setLoadingData(true);
            const fetchData = async () => {
                try {
                    // 1. We prioritize the new pricing source of truth (now consolidated in /api/admin/pricing)
                    const pricingRes = await fetch('/api/admin/pricing');
                    const pricingData = await pricingRes.json();

                    if (pricingRes.ok && pricingData.ok && pricingData.settings) {
                        const { plans, extensions, pointPackages, appPlans } = pricingData.settings;
                        
                        // Check plans and extensions first (new unified structure)
                        const allSubs = [
                            ...(plans || []).map((p: any) => ({ ...p, type: 'PLAN' as const })),
                            ...(extensions || []).map((e: any) => ({ ...e, type: 'EXTENSION' as const }))
                        ];
                        
                        const sub = allSubs.find((s: any) => s.id === planId);
                        if (sub) {
                            setItemData({
                                type: sub.type as 'PLAN', // Cast for simplicity unless it's explicitly extension
                                label: sub.label,
                                price: sub.price || 0,
                                features: sub.features || [],
                                description: sub.includedFeatures,
                                appPlanIds: sub.appPlanIds || [],
                            });
                            setLoadingData(false);
                            return;
                        }

                        // Check point packages
                        const pkg = pointPackages?.find((p: any) => p.id === planId);
                        if (pkg) {
                            setItemData({
                                type: 'POINTS',
                                label: pkg.name,
                                price: pkg.price,
                                features: [`${pkg.points} 點`, pkg.description].filter(Boolean) as string[],
                                description: pkg.description,
                                points: pkg.points,
                                appPlanIds: pkg.appPlanIds || [],
                                prePurchasePointsCost: pkg.prePurchasePointsCost || 0,
                            });
                            setLoadingData(false);
                            return;
                        }
                    }

                    // 2. ONLY if not found in the new unified pricing, we fallback to the legacy table
                    const subsRes = await fetch(`/api/admin/subscriptions?id=${planId}`);
                    const subsData = await subsRes.json();

                    if (subsRes.ok && subsData.ok && subsData.subscription) {
                        const sub = subsData.subscription;
                        setItemData({
                            type: 'PLAN',
                            label: sub.label,
                            price: sub.price || 0,
                            features: sub.features || [],
                            description: sub.includedFeatures,
                        });
                        setLoadingData(false);
                        return;
                    }

                    // If neither found, go back
                    router.push('/pricing');
                } catch (err) {
                    console.error('Failed to load item info', err);
                    router.push('/pricing');
                } finally {
                    setLoadingData(false);
                }
            };
            fetchData();
        }
    }, [planId, isMockPlan, router]);

    if (!mounted || !user || !planId || (isMockPlan && !PLAN_LABELS[planId as PlanId]) || (!isMockPlan && loadingData) || (!isMockPlan && !itemData)) {
        return <div className="page section"><p>{t('loading')}</p></div>;
    }

    let price = 0;
    let itemName = '';
    let planLabel = '';
    let planFeatures: string[] = [];
    let points = 0;
    let appPlanIds: string[] = [];

    if (isMockPlan) {
        const id = planId as PlanId;
        const priceString = PLAN_PRICES[id];
        const priceMatch = priceString.match(/(\d+,?\d*)/);
        price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, ''), 10) : 0;
        itemName = `Plan Upgrade: ${PLAN_LABELS[id]}`;
        planLabel = PLAN_LABELS[id];
        planFeatures = PLAN_FEATURES[id];

        // For legacy mock plans starting with points_
        if (id.startsWith('points_')) {
            const pointsMatch = id.match(/\d+/);
            points = pointsMatch ? parseInt(pointsMatch[0], 10) : 0;
        }
    } else if (itemData) {
        price = itemData.price;
        itemName = `${itemData.type === 'PLAN' ? 'Plan Upgrade' : 'Points Purchase'}: ${itemData.label}`;
        planLabel = itemData.label;
        planFeatures = itemData.features;
        points = itemData.points || 0;
        appPlanIds = itemData.appPlanIds || [];
    }

    const itemType: 'PLAN' | 'POINTS' = (!isMockPlan && itemData) ? itemData.type : 'PLAN';

    const handleCreateOrder = async (method: string) => {
        try {
            const res = await fetch('/api/plan-upgrades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.email || user.roid_id || user.id,
                    planId: planId,
                    amount: price,
                    currency: 'TWD',
                    itemType,
                    planLabel,
                    points: itemType === 'POINTS' ? Math.max(0, points - (itemData?.prePurchasePointsCost || 0)) : points,
                    appPlanIds: appPlanIds,
                }),
            });

            if (!res.ok) throw new Error('Upgrade creation failed');
            const data = await res.json();
            return data.upgrade;
        } catch (err) {
            console.error(err);
            alert(t('create_order_error') || 'Order creation error');
            return null;
        }
    };

    const syncPlanLocally = () => {
        // This is a naive client-side only upgrade simulation
        // In production, the webhook or /api/orders PATCH handles backend truth,
        // and /student_courses sync handles frontend state upon returning.
        // For immediate UI feedback, we update localStorage if simulated directly.
        if (planId?.startsWith('points_')) {
            // we will grant points via api instead of updating localStorage
            return;
        }

        const updatedUser = { ...user, plan: planId as any };
        setStoredUser(updatedUser);
        setUser(updatedUser);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('tutor:auth-changed'));
        }
    };

    const handlePaymentEcpay = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('ecpay');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/ecpay/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: price,
                    itemName: itemName,
                    orderId: upgrade.upgradeId,
                }),
            });
            const data = await res.json();
            if (data.html) {
                document.body.insertAdjacentHTML('beforeend', data.html);
            } else {
                alert('ECPay integration error');
            }
        } catch (err) {
            alert('ECPay error');
        }
    };

    const handlePaymentStripe = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('stripe');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: price,
                    currency: 'TWD',
                    itemName: itemName,
                    orderId: upgrade.upgradeId,
                    userId: user.email || user.roid_id || user.id,
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            alert('Stripe error');
        }
    };

    const handlePaymentPaypal = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('paypal');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/paypal/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: price,
                    currency: 'TWD',
                    itemName: itemName,
                    orderId: upgrade.upgradeId,
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert('PayPal initiation error');
            }
        } catch (err) {
            alert('PayPal error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentLinePay = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('linepay');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/linepay/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: price,
                    currency: 'TWD',
                    itemName: itemName,
                    orderId: upgrade.upgradeId,
                    userId: user.roid_id || user.id || user.email,
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert('Line Pay initiation error');
            }
        } catch (err) {
            alert('Line Pay error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentSimulated = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('simulated');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            // Simulate backend updating the upgrade status to PAID
            const patchRes = await fetch(`/api/plan-upgrades/${encodeURIComponent(upgrade.upgradeId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PAID' }),
            });
            
            const data = await patchRes.json();
            
            if (!patchRes.ok) {
                throw new Error(data.error || 'Failed to update payment status');
            }
            
            // If it's a plan upgrade (not points), sync locally for immediate UI feedback
            if (itemType === 'PLAN') {
                syncPlanLocally();
            }

            // Small delay to ensure DB updates and analytics are processed
            setTimeout(() => {
                router.push('/plans');
            }, 500);
        } catch (err: any) {
            alert(`Simulation error: ${err.message || err}`);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="page">
            <header className="page-header">
                <h1>{t('confirm_payment') || '升級方案結帳'}</h1>
            </header>

            <section className="section" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="card" style={{ padding: '24px' }}>
                    <h2>{planLabel}</h2>
                    <p style={{ margin: '16px 0', fontSize: '24px', fontWeight: 'bold', color: '#0070ba' }}>
                        NT$ {price}
                    </p>

                    <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <p><strong>帳號：</strong> {user.email}</p>
                        <p><strong>目前方案：</strong> {(PLAN_LABELS as Record<string, string>)[user.plan] || user.plan}</p>
                    </div>

                    <h3>方案包含：</h3>
                    <ul style={{ paddingLeft: '20px', marginBottom: '32px' }}>
                        {planFeatures.map((f, i) => (
                            <li key={i} style={{ marginBottom: '8px' }}>{f}</li>
                        ))}
                    </ul>

                    <h3>選擇付款方式</h3>
                    <div className="payment-options" style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                        {loadingPayments ? (
                            <p className="text-sm text-gray-500">{t('loading') || '載入中...'}</p>
                        ) : (
                            <>
                                {activePaymentMethods.includes('ECPAY') && (
                                    <button
                                        type="button"
                                        className="modal-button primary"
                                        onClick={handlePaymentEcpay}
                                        disabled={isSubmitting}
                                        style={{ background: '#40b070' }}
                                    >
                                        {t('payment_method_ecpay')}
                                    </button>
                                )}
                                {activePaymentMethods.includes('STRIPE') && (
                                    <button
                                        type="button"
                                        className="modal-button primary"
                                        onClick={handlePaymentStripe}
                                        disabled={isSubmitting}
                                        style={{ background: '#635bff' }}
                                    >
                                        {t('payment_method_stripe')}
                                    </button>
                                )}
                                {activePaymentMethods.includes('PAYPAL') && (
                                    <button
                                        type="button"
                                        className="modal-button primary"
                                        onClick={handlePaymentPaypal}
                                        disabled={isSubmitting}
                                        style={{ background: '#0070ba' }}
                                    >
                                        {t('payment_method_paypal')}
                                    </button>
                                )}
                                {activePaymentMethods.includes('LINEPAY') && (
                                    <button
                                        type="button"
                                        className="modal-button primary"
                                        onClick={handlePaymentLinePay}
                                        disabled={isSubmitting}
                                        style={{ background: '#00C300' }}
                                    >
                                        LINE Pay
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="modal-button primary"
                                    onClick={handlePaymentSimulated}
                                    disabled={isSubmitting}
                                    style={{ background: '#ffa000' }}
                                >
                                    {t('payment_method_simulated')}
                                </button>
                            </>
                        )}

                        <Link
                            href="/pricing"
                            className="modal-button secondary"
                            style={{ display: 'block', textAlign: 'center', marginTop: '12px' }}
                        >
                            {t('cancel')}
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default function CheckoutPage() {
    return (
        <Suspense fallback={<div className="page section">Loading...</div>}>
            <CheckoutContent />
        </Suspense>
    );
}
