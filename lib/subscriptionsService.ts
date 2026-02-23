import { ddbDocClient } from './dynamo';
import {
    ScanCommand,
    GetCommand,
    PutCommand,
    DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_SUBSCRIPTIONS_TABLE || 'jvtutorcorner-subscriptions';

export type SubscriptionType = 'PLAN' | 'EXTENSION';

export interface SubscriptionFeature {
    id: string; // e.g., 'feature_1'
    text: string;
}

export interface SubscriptionConfig {
    id: string; // e.g., 'plan_viewer', 'ext_cloud_recording'
    type: SubscriptionType;
    label: string;
    priceHint?: string;
    badge?: string;
    targetAudience: string;
    includedFeatures: string;
    features: string[]; // List of strings for display
    isActive: boolean;
    order: number;
    durationMonths?: number; // Optional duration for extensions
    createdAt?: string;
    updatedAt?: string;
}

export async function getAllSubscriptions(): Promise<SubscriptionConfig[]> {
    try {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
        });
        const response = await ddbDocClient.send(command);
        return (response.Items as SubscriptionConfig[]) || [];
    } catch (error) {
        console.error('Error in getAllSubscriptions:', error);
        throw error;
    }
}

export async function getSubscriptionById(id: string): Promise<SubscriptionConfig | null> {
    try {
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: { id },
        });
        const response = await ddbDocClient.send(command);
        return (response.Item as SubscriptionConfig) || null;
    } catch (error) {
        console.error(`Error in getSubscriptionById (${id}):`, error);
        throw error;
    }
}

export async function upsertSubscription(subscription: SubscriptionConfig): Promise<SubscriptionConfig> {
    try {
        const now = new Date().toISOString();

        // Add timestamps if not present
        if (!subscription.createdAt) {
            subscription.createdAt = now;
        }
        subscription.updatedAt = now;

        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: subscription,
        });
        await ddbDocClient.send(command);
        return subscription;
    } catch (error) {
        console.error(`Error in upsertSubscription (${subscription.id}):`, error);
        throw error;
    }
}

export async function deleteSubscription(id: string): Promise<void> {
    try {
        const command = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id },
        });
        await ddbDocClient.send(command);
    } catch (error) {
        console.error(`Error in deleteSubscription (${id}):`, error);
        throw error;
    }
}
