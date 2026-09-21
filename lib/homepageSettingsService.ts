// lib/homepageSettingsService.ts
//
// Admin-controlled toggles for homepage sections. Currently just the
// personalised-recommendations block (#tour-recommendation) — it used to
// always render, falling back to bundled demo courses when there were no
// real recommendations yet. This lets an admin turn that section off from
// /admin/settings instead of it being hardcoded on.
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const HOMEPAGE_SETTINGS_TABLE =
  process.env.DYNAMODB_TABLE_HOMEPAGE_SETTINGS || 'jvtutorcorner-homepage-settings';
const SETTINGS_ID = 'homepage';

export interface HomepageSettings {
  showRecommendations: boolean;
}

const DEFAULT_SETTINGS: HomepageSettings = {
  showRecommendations: false,
};

export async function getHomepageSettings(): Promise<HomepageSettings> {
  try {
    const res = await ddbDocClient.send(
      new GetCommand({ TableName: HOMEPAGE_SETTINGS_TABLE, Key: { id: SETTINGS_ID } })
    );
    if (!res.Item) return DEFAULT_SETTINGS;
    return {
      showRecommendations:
        typeof res.Item.showRecommendations === 'boolean'
          ? res.Item.showRecommendations
          : DEFAULT_SETTINGS.showRecommendations,
    };
  } catch (err) {
    console.warn('[homepageSettingsService] getHomepageSettings failed, using defaults:', (err as Error).message);
    return DEFAULT_SETTINGS;
  }
}

export async function saveHomepageSettings(settings: HomepageSettings): Promise<boolean> {
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: HOMEPAGE_SETTINGS_TABLE,
        Item: { id: SETTINGS_ID, ...settings, updatedAt: new Date().toISOString() },
      })
    );
    return true;
  } catch (err) {
    console.error('[homepageSettingsService] saveHomepageSettings failed:', (err as Error).message);
    return false;
  }
}
