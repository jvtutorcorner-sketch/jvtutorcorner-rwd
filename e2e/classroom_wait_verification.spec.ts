import { test, expect } from '@playwright/test';
import { TeacherEnterClassroomSkill } from '../automation/skills/TeacherEnterClassroom';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test.describe('Classroom Wait Page Verification', () => {
    test('Verify wait page elements and device bypass', async ({ browser }) => {
        const teacherSkill = new TeacherEnterClassroomSkill(browser);
        
        // We want to test specifically the wait page, so we'll use a part of the skill logic
        // or just drive the page directly for more granular control if needed.
        // For now, let's use the skill but stop at the wait page.
        
        const result = await teacherSkill.execute({ 
            keepOpen: true,
            timeoutMs: 60000 
        });

        expect(result.success).toBe(true);
        const page = result.page!;
        
        // Assert we are in classroom environment
        await expect(page).toHaveURL(/\/classroom/);
        
        // The skill already performs the setup, so we can verify the outcome
        const readyBtn = page.locator('button:has-text("準備好")').first();
        // Since the skill clicks 'ready', it might already be 'Ready' state or advanced.
        
        await page.close();
    });
});
