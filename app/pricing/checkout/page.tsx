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
import Link from 'next/link';

function CheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const t = useT();

    const [user, setUser] = useState<StoredUser | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Extract from query params
    const planId = searchParams.get('plan') as PlanId | null;

    useEffect(() => {
        setMounted(true);
        const currentUser = getStoredUser();
        setUser(currentUser);

        if (!currentUser) {
            router.push('/login');
        } else if (!planId || !PLAN_LABELS[planId] || planId === 'viewer') {
            router.push('/pricing');
        }
    }, [planId, router]);

    if (!mounted || !user || !planId || !PLAN_LABELS[planId] || planId === 'viewer') {
        return <div className="page section"><p>{t('loading')}</p></div>;
    }

    // Parse price number from PLAN_PRICES (e.g., "NT$499 / 月" -> 499)
    const priceString = PLAN_PRICES[planId];
    const priceMatch = priceString.match(/(\d+,?\d*)/);
    const price = priceMatch ? parseInt(priceMatch[0].replace(/,/g, ''), 10) : 0;
    const itemName = `Plan Upgrade: ${PLAN_LABELS[planId]}`;

    const handleCreateOrder = async (method: string) => {
        try {
            const res = await fetch('/api/plan-upgrades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.email,
                    planId: planId,
                    amount: price,
                    currency: 'TWD',
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
        const updatedUser = { ...user, plan: planId };
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

    const handlePaymentSimulated = async () => {
        setIsSubmitting(true);
        const upgrade = await handleCreateOrder('simulated');
        if (!upgrade) {
            setIsSubmitting(false);
            return;
        }

        try {
            // Simulate backend updating the upgrade status to PAID
            await fetch(`/api/plan-upgrades/${encodeURIComponent(upgrade.upgradeId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PAID' }),
            });
            alert(t('payment_simulated') || '付款成功 (Demo)');
            syncPlanLocally();
            router.push('/student_courses');
        } catch (err) {
            alert('Simulation error');
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
                    <h2>{PLAN_LABELS[planId]}</h2>
                    <p style={{ margin: '16px 0', fontSize: '24px', fontWeight: 'bold', color: '#0070ba' }}>
                        NT$ {price}
                    </p>

                    <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <p><strong>帳號：</strong> {user.email}</p>
                        <p><strong>目前方案：</strong> {PLAN_LABELS[user.plan]}</p>
                    </div>

                    <h3>方案包含：</h3>
                    <ul style={{ paddingLeft: '20px', marginBottom: '32px' }}>
                        {PLAN_FEATURES[planId].map((f, i) => (
                            <li key={i} style={{ marginBottom: '8px' }}>{f}</li>
                        ))}
                    </ul>

                    <h3>選擇付款方式</h3>
                    <div className="payment-options" style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                        <button
                            type="button"
                            className="modal-button primary"
                            onClick={handlePaymentEcpay}
                            disabled={isSubmitting}
                            style={{ background: '#40b070' }}
                        >
                            {t('payment_method_ecpay')}
                        </button>
                        <button
                            type="button"
                            className="modal-button primary"
                            onClick={handlePaymentStripe}
                            disabled={isSubmitting}
                            style={{ background: '#635bff' }}
                        >
                            {t('payment_method_stripe')}
                        </button>
                        <button
                            type="button"
                            className="modal-button primary"
                            onClick={handlePaymentPaypal}
                            disabled={isSubmitting}
                            style={{ background: '#0070ba' }}
                        >
                            {t('payment_method_paypal')}
                        </button>
                        <button
                            type="button"
                            className="modal-button primary"
                            onClick={handlePaymentSimulated}
                            disabled={isSubmitting}
                            style={{ background: '#ffa000' }}
                        >
                            {t('payment_method_simulated')}
                        </button>

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
