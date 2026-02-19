import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getStoredUser } from '@/lib/mockAuth'; // Replace with real auth in prod
import profilesService from '@/lib/profilesService';

export async function POST(req: NextRequest) {
    try {
        // 1. Get current user
        // TODO: Replace with real session check
        // const session = await getServerSession(authOptions);
        // const userId = session?.user?.id;

        // For now, we simulate getting user ID from request or mock auth
        // In a real app, use the session
        const body = await req.json();
        const { priceId, successUrl, cancelUrl, userId } = body;

        if (!userId || !priceId) {
            return NextResponse.json({ error: 'Missing userId or priceId' }, { status: 400 });
        }

        // 2. Get user profile to check for existing Stripe Customer ID
        const user = await profilesService.getProfileById(userId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let customerId = user.stripeCustomerId;

        // 3. Create Stripe Customer if not exists
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                metadata: {
                    userId: userId,
                },
            });
            customerId = customer.id;

            // Update user with new customer ID
            await profilesService.putProfile({
                ...user,
                stripeCustomerId: customerId,
            });
        }

        // 4. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing?success=true`,
            cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing?canceled=true`,
            metadata: {
                userId: userId,
            },
        });

        return NextResponse.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
        console.error('[Stripe Checkout] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
