// lib/pricingService.ts
import { ddbDocClient } from './dynamo';
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const PRICING_TABLE = process.env.DYNAMODB_TABLE_PRICING || 'jvtutorcorner-pricing';
const PRICING_CONFIG_ID = 'pricing-config';

export type PlanConfig = {
  id: string;
  label: string;
  priceHint?: string;
  badge?: string;
  targetAudience: string;
  includedFeatures: string;
  features: string[];
  isActive: boolean;
  order: number;
};

export type PointPackage = {
  id: string;
  name: string;
  points: number;
  price: number;
  bonus?: number;
  description?: string;
  badge?: string;
  isActive: boolean;
  order: number;
};

export type PricingSettings = {
  pageTitle: string;
  pageDescription: string;
  mode: 'subscription' | 'points';
  plans: PlanConfig[];
  pointPackages: PointPackage[];
};

/**
 * Get pricing settings from DynamoDB
 */
export async function getPricingSettings(): Promise<PricingSettings | null> {
  if (!PRICING_TABLE) {
    console.warn('[pricingService] DYNAMODB_TABLE_PRICING not configured');
    return null;
  }

  try {
    const command = new GetCommand({
      TableName: PRICING_TABLE,
      Key: { id: PRICING_CONFIG_ID },
    });

    const response = await ddbDocClient.send(command);
    
    if (!response.Item) {
      console.log('[pricingService] No pricing config found in DynamoDB');
      return null;
    }

    return response.Item as PricingSettings;
  } catch (error) {
    console.error('[pricingService] Failed to get pricing settings:', error);
    throw error;
  }
}

/**
 * Save pricing settings to DynamoDB
 */
export async function savePricingSettings(settings: PricingSettings): Promise<void> {
  if (!PRICING_TABLE) {
    throw new Error('DYNAMODB_TABLE_PRICING not configured');
  }

  try {
    const command = new PutCommand({
      TableName: PRICING_TABLE,
      Item: {
        id: PRICING_CONFIG_ID,
        ...settings,
        updatedAt: new Date().toISOString(),
      },
    });

    await ddbDocClient.send(command);
    console.log('[pricingService] Pricing settings saved successfully');
  } catch (error) {
    console.error('[pricingService] Failed to save pricing settings:', error);
    throw error;
  }
}

/**
 * Get all plans from the pricing configuration
 */
export async function getPlans(): Promise<PlanConfig[]> {
  const settings = await getPricingSettings();
  return settings?.plans || [];
}

/**
 * Get all point packages from the pricing configuration
 */
export async function getPointPackages(): Promise<PointPackage[]> {
  const settings = await getPricingSettings();
  return settings?.pointPackages || [];
}
