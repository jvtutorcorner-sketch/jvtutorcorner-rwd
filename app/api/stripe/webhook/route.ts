import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import profilesService from '@/lib/profilesService';
import Stripe from 'stripe';

// Next.js App Router requests are streams by default, so we don't need to disable body parser.
// We can just read the stream directly in getRawBody.

// Helper to get raw body
async function getRawBody(request: NextRequest): Promise<Buffer> {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];

    if (!reader) throw new Error('No body stream');

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET is missing');
        return NextResponse.json({ error: 'Webhook secret missing' }, { status: 500 });
    }

    const sig = req.headers.get('stripe-signature');
    if (!sig) {
        return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        const rawBody = await getRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // Handle specific events
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutSessionCompleted(session);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await handleInvoicePaymentSucceeded(invoice);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdated(subscription);
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error: any) {
        console.error(`Error handling event ${event.type}:`, error);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

// ------------------------------------------------------------------
// Event Handlers
// ------------------------------------------------------------------

/**
 * Handle checkout.session.completed
 * Triggered when a subscription is successfully created via Stripe Checkout.
 * Logic:
 * 1. Retrieve user ID from metadata.
 * 2. Update user profile with subscription ID, status, and price ID.
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const subscriptionId = session.subscription as string;
    const customerId = session.customer as string;
    const orderId = session.metadata?.orderId;

    if (!userId) {
        console.warn('Missing userId in session metadata');
        return;
    }

    console.log(`[Stripe Webhook] Checkout completed for user ${userId}, matching Order ${orderId}`);

    // Update DB Order Status
    if (orderId) {
        try {
            const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PAID' }),
            });
            if (!res.ok) {
                console.error('[Stripe Webhook] Failed to update order status via API', res.status);
            } else {
                console.log(`[Stripe Webhook] Successfully updated order ${orderId} to PAID via API`);
            }
        } catch (e) {
            console.error('[Stripe Webhook] Error updating order status:', e);
        }
    }

    // Retrieve subscription details to get status and period end
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Fix: Handle usage of subscription object where it might be typed as Response<Subscription>
    const subData: any = subscription;

    await profilesService.putProfile({
        id: userId,
        stripeCustomerId: customerId,
        subscriptionId: subData.id,
        subscriptionStatus: subData.status,
        priceId: subData.items.data[0].price.id,
        currentPeriodEnd: new Date(subData.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subData.cancel_at_period_end,
    });
}

/**
 * Handle invoice.payment_succeeded
 * Triggered for recurring payments.
 * Logic:
 * 1. Update subscription status (ensure it remains active) and period end.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    // Fix: Property 'subscription' access on Invoice type
    const inv: any = invoice;
    const subscriptionId = inv.subscription as string;
    const customerId = inv.customer as string;

    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subData: any = subscription; // Cast to avoid TS errors with Response<T>

    const user = await profilesService.findProfileByStripeCustomerId(customerId);

    if (user) {
        console.log(`[Stripe Webhook] Invoice paid for user ${user.id}`);

        const existingProfile = await profilesService.getProfileById(user.id);
        if (existingProfile) {
            await profilesService.putProfile({
                ...existingProfile,
                subscriptionStatus: subData.status,
                currentPeriodEnd: new Date(subData.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subData.cancel_at_period_end,
            });
        }
    }
}

/**
 * Handle customer.subscription.deleted
 * Triggered when a subscription is cancelled or expires.
 * Logic:
 * 1. Mark subscription status as canceled or remove subscription fields.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const subData: any = subscription;
    const customerId = subData.customer as string;
    const user = await profilesService.findProfileByStripeCustomerId(customerId);

    if (user) {
        console.log(`[Stripe Webhook] Subscription deleted for user ${user.id}`);

        const existingProfile = await profilesService.getProfileById(user.id);
        if (existingProfile) {
            await profilesService.putProfile({
                ...existingProfile,
                subscriptionStatus: subData.status, // likely 'canceled'
                cancelAtPeriodEnd: false,
            });
        }
    }
}

/**
 * Handle customer.subscription.updated
 * Triggered for any changes (upgrade, downgrade, cancellation scheduled).
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const subData: any = subscription;
    const customerId = subData.customer as string;
    const user = await profilesService.findProfileByStripeCustomerId(customerId);

    if (user) {
        console.log(`[Stripe Webhook] Subscription updated for user ${user.id}`);

        const existingProfile = await profilesService.getProfileById(user.id);
        if (existingProfile) {
            await profilesService.putProfile({
                ...existingProfile,
                subscriptionStatus: subData.status,
                currentPeriodEnd: new Date(subData.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: subData.cancel_at_period_end,
                priceId: subData.items.data[0].price.id,
            });
        }
    }
}
