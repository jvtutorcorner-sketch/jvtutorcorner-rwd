/**
 * Stripe Integration Types
 * 
 * Defines the structure for Stripe-related data stored in the user profile.
 */

import Stripe from 'stripe';

export interface StripeSubscriptionData {
    /** Stripe Customer ID */
    stripeCustomerId?: string;

    /** Active Subscription ID */
    subscriptionId?: string;

    /** Subscription Status */
    subscriptionStatus?: Stripe.Subscription.Status;

    /** Price ID of the subscribed plan */
    priceId?: string;

    /** Period end date (ISO 8601) */
    currentPeriodEnd?: string;

    /** Whether the subscription will cancel at period end */
    cancelAtPeriodEnd?: boolean;
}

// Re-export specific Stripe types if needed for frontend usage
export type SubscriptionStatus = Stripe.Subscription.Status;
