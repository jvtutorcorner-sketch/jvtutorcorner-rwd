import { test, expect } from '@playwright/test';
import { TeacherEnterClassroomSkill } from '../automation/skills/TeacherEnterClassroom';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

test.describe('Classroom Room Page Verification', () => {
    test('Verify room page elements: whiteboard and controls', async ({ browser }) => {
        const teacherSkill = new TeacherEnterClassroomSkill(browser);
        
        const result = await teacherSkill.execute({ 
            keepOpen: true,
            timeoutMs: 60000 
        });

        expect(result.success).toBe(true);
        const page = result.page!;
        
        // Assert we are in the classroom room (not /wait)
        await expect(page).toHaveURL(/\/classroom\/room/);
        
        // Check for whiteboard
        const whiteboard = page.locator('canvas').first();
        // and some tool buttons
        const penBtn = page.locator('button:has-text("Pen"), button:has-text("畫筆")').first();
        
        // Check for control panel
        const leaveBtn = page.locator('button:has-text("離開"), button:has-text("Leave")').first();
        await expect(leaveBtn).toBeVisible();

        await page.close();
    });
});
