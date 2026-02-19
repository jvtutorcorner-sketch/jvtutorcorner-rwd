import Stripe from 'stripe';

// Initialize Stripe. Check for key at runtime in usage points if strictly needed, 
// or let it fail with a clear error from Stripe if key is invalid.
// To prevent build-time crashes, we fallback to a placeholder if missing.
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

export const stripe = new Stripe(stripeKey, {
    // apiVersion removed to use library default
    appInfo: {
        name: 'JVTutorCorner',
        version: '0.1.0',
    },
    typescript: true,
});
