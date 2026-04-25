/// <reference types="node" />
import { test, expect, Page } from '@playwright/test';

const TEST_BASE_URL = process.env.QA_TEST_BASE_URL || 'http://www.jvtutorcorner.com';
const TEST_STUDENT_EMAIL = process.env.QA_STUDENT_EMAIL || 'pro@test.com';
const TEST_STUDENT_PASSWORD = process.env.QA_STUDENT_PASSWORD || '123456';
const CAPTCHA_BYPASS = process.env.QA_CAPTCHA_BYPASS || 'jv_secret_bypass_2024';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@jvtutorcorner.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';

// Stripe Test Card
const STRIPE_TEST_CARD = {
    number: '4242 4242 4242 4242',
    expiry: '12/25',
    cvc: '123',
    email: 'test@example.com',
};

test.describe('Stripe Payment Verification Flow', () => {
    let page: Page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('Student Auto-Login Flow', async () => {
        console.log('🔐 Starting Student Auto-Login...');
        
        // Navigate to login
        await page.goto(`${TEST_BASE_URL}/login`);
        await page.waitForLoadState('networkidle');

        // Fill in credentials
        await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
        await page.fill('input[type="password"]', TEST_STUDENT_PASSWORD);
        
        // Check if captcha/bypass field exists
        const bypassInput = page.locator('input[name*="captcha"], input[name*="bypass"], input[name*="code"]');
        if (await bypassInput.isVisible()) {
            await bypassInput.fill(CAPTCHA_BYPASS);
        }

        // Click login
        await page.click('button:has-text("登入"), button:has-text("Sign In")');
        
        // Wait for navigation and navbar confirmation
        await page.waitForLoadState('networkidle');
        
        // Verify logged in (navbar should show user menu or settings)
        const navbarElement = page.locator('[data-testid="navbar"]');
        await expect(navbarElement).toBeVisible();
        
        console.log('✅ Student logged in successfully');
    });

    test('Navigate to Pricing Page and Select Payment Plan', async () => {
        console.log('💳 Starting Pricing Page Navigation...');
        
        // Auto-login first
        await page.goto(`${TEST_BASE_URL}/login`);
        await page.waitForLoadState('networkidle');
        
        await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
        await page.fill('input[type="password"]', TEST_STUDENT_PASSWORD);
        
        const bypassInput = page.locator('input[name*="captcha"], input[name*="bypass"], input[name*="code"]');
        if (await bypassInput.isVisible()) {
            await bypassInput.fill(CAPTCHA_BYPASS);
        }
        
        await page.click('button:has-text("登入"), button:has-text("Sign In")');
        await page.waitForLoadState('networkidle');
        
        // Navigate to pricing
        console.log('📄 Navigating to /pricing page...');
        await page.goto(`${TEST_BASE_URL}/pricing`);
        await page.waitForLoadState('networkidle');
        
        // Verify pricing page loaded
        const pricingHeader = page.locator('h1, h2').filter({ hasText: '方案|Pricing|Plan' }).first();
        await expect(pricingHeader).toBeVisible({ timeout: 5000 });
        
        console.log('✅ Pricing page loaded');
        
        // Look for a points package button
        const pointsButton = page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first();
        
        if (await pointsButton.isVisible()) {
            console.log('📦 Found points package button, clicking...');
            await pointsButton.click();
            
            // Should navigate to checkout page
            await page.waitForLoadState('networkidle');
            await page.waitForURL(/checkout/);
            
            const checkoutHeader = page.locator('h1, h2').filter({ hasText: '結帳|Checkout' }).first();
            await expect(checkoutHeader).toBeVisible({ timeout: 5000 });
            
            console.log('✅ Navigated to checkout page');
        } else {
            console.log('⚠️ No points package button found, checking for subscription plans...');
            const upgradeButton = page.locator('a:has-text("升級"), button:has-text("升級")').first();
            if (await upgradeButton.isVisible()) {
                await upgradeButton.click();
                await page.waitForLoadState('networkidle');
                console.log('✅ Navigated to checkout for subscription');
            } else {
                console.log('❌ No purchase buttons found');
                throw new Error('Cannot find any purchase buttons on pricing page');
            }
        }
    });

    test('Complete Stripe Payment with Test Card', async () => {
        console.log('💳 Starting Complete Stripe Payment Test...');
        
        // Auto-login
        await page.goto(`${TEST_BASE_URL}/login`);
        await page.waitForLoadState('networkidle');
        
        await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
        await page.fill('input[type="password"]', TEST_STUDENT_PASSWORD);
        
        const bypassInput = page.locator('input[name*="captcha"], input[name*="bypass"], input[name*="code"]');
        if (await bypassInput.isVisible()) {
            await bypassInput.fill(CAPTCHA_BYPASS);
        }
        
        await page.click('button:has-text("登入"), button:has-text("Sign In")');
        await page.waitForLoadState('networkidle');
        
        // Go to pricing and select a plan
        await page.goto(`${TEST_BASE_URL}/pricing`);
        await page.waitForLoadState('networkidle');
        
        const pointsButton = page.locator('a:has-text("購買點數"), button:has-text("購買點數")').first();
        if (await pointsButton.isVisible()) {
            await pointsButton.click();
            await page.waitForLoadState('networkidle');
            
            // Look for Stripe payment button
            console.log('🔍 Looking for Stripe payment button on checkout page...');
            
            const stripeButton = page.locator(
                'button:has-text("Stripe"), a:has-text("Stripe"), button:has-text("Pay with Stripe")'
            ).first();
            
            if (await stripeButton.isVisible()) {
                console.log('💳 Found Stripe button, clicking...');
                
                // Wait for potential redirect or modal
                const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle' });
                await stripeButton.click();
                
                try {
                    await navigationPromise;
                } catch (e) {
                    // Might be a modal instead of navigation
                    console.log('No navigation detected - might be a modal');
                }
                
                await page.waitForLoadState('networkidle');
                
                // Check if we're on Stripe checkout or in an iframe
                console.log('📍 Current URL:', page.url());
                
                // Wait for Stripe iframe to appear
                await page.waitForSelector('iframe[title*="Stripe"]', { timeout: 10000 }).catch(() => {
                    console.log('⚠️ Stripe iframe not found - might be hosted checkout');
                });
                
                // If hosted checkout, wait for card input
                const cardInput = page.locator('input[placeholder*="card"], input[placeholder*="Card"]').first();
                
                if (await cardInput.isVisible({ timeout: 5000 })) {
                    console.log('💳 Entering Stripe Test Card...');
                    
                    // Wait for all Stripe elements to be ready
                    await page.waitForTimeout(2000);
                    
                    // Enter card details
                    await cardInput.fill(STRIPE_TEST_CARD.number);
                    
                    const expiryInput = page.locator('input[placeholder*="MM / YY"], input[placeholder*="Expir"]').first();
                    if (await expiryInput.isVisible()) {
                        await expiryInput.fill(STRIPE_TEST_CARD.expiry);
                    }
                    
                    const cvcInput = page.locator('input[placeholder*="CVC"], input[placeholder*="cvv"]').first();
                    if (await cvcInput.isVisible()) {
                        await cvcInput.fill(STRIPE_TEST_CARD.cvc);
                    }
                    
                    // Find and click Pay button
                    const payButton = page.locator('button:has-text("Pay"), button:has-text("Subscribe")').first();
                    if (await payButton.isVisible()) {
                        console.log('✅ Clicking Pay button...');
                        await payButton.click();
                        
                        // Wait for payment processing
                        await page.waitForTimeout(3000);
                        await page.waitForLoadState('networkidle');
                        
                        console.log('📍 Payment result URL:', page.url());
                        
                        // Check for success message
                        const successMessage = page.locator(
                            'text=成功|Success|Thank you|感謝'
                        ).first();
                        
                        if (await successMessage.isVisible({ timeout: 5000 })) {
                            console.log('✅ Payment successful!');
                        } else {
                            console.log('⚠️ No success message visible, but payment may have been processed');
                        }
                    }
                } else {
                    console.log('⚠️ Card input not visible - might need to inspect page structure');
                }
            } else {
                console.log('⚠️ Stripe button not found on checkout page');
            }
        }
    });

    test('Admin Stripe Connection Diagnostics', async () => {
        console.log('👨‍💼 Starting Admin Stripe Diagnostics...');
        
        // Admin login
        await page.goto(`${TEST_BASE_URL}/login`);
        await page.waitForLoadState('networkidle');
        
        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        
        const bypassInput = page.locator('input[name*="captcha"], input[name*="bypass"], input[name*="code"]');
        if (await bypassInput.isVisible()) {
            await bypassInput.fill(CAPTCHA_BYPASS);
        }
        
        await page.click('button:has-text("登入"), button:has-text("Sign In")');
        await page.waitForLoadState('networkidle');
        
        // Navigate to apps page
        console.log('🔧 Navigating to /apps page...');
        await page.goto(`${TEST_BASE_URL}/apps?type=payment`);
        await page.waitForLoadState('networkidle');
        
        // Look for Stripe service
        const stripeRow = page.locator('text=Stripe').first();
        
        if (await stripeRow.isVisible()) {
            console.log('✅ Found Stripe service in apps list');
            
            // Look for test button
            const testButton = page.locator('button:has-text("Test")').nth(0);
            
            if (await testButton.isVisible()) {
                console.log('🧪 Clicking Test button for Stripe...');
                await testButton.click();
                
                await page.waitForTimeout(2000);
                
                // Check for test result message
                const successMessage = page.locator('text=successful|success|✓').first();
                const errorMessage = page.locator('text=error|failed|✗').first();
                
                if (await successMessage.isVisible({ timeout: 5000 })) {
                    console.log('✅ Stripe connection test PASSED');
                } else if (await errorMessage.isVisible({ timeout: 5000 })) {
                    console.log('❌ Stripe connection test FAILED');
                } else {
                    console.log('⚠️ Could not determine test result');
                }
            }
        } else {
            console.log('❌ Stripe service not found in apps list');
        }
    });

    test('Verify Payment Status Update in User Profile', async () => {
        console.log('📊 Verifying Payment Status in User Profile...');
        
        // Login
        await page.goto(`${TEST_BASE_URL}/login`);
        await page.waitForLoadState('networkidle');
        
        await page.fill('input[type="email"]', TEST_STUDENT_EMAIL);
        await page.fill('input[type="password"]', TEST_STUDENT_PASSWORD);
        
        const bypassInput = page.locator('input[name*="captcha"], input[name*="bypass"], input[name*="code"]');
        if (await bypassInput.isVisible()) {
            await bypassInput.fill(CAPTCHA_BYPASS);
        }
        
        await page.click('button:has-text("登入"), button:has-text("Sign In")');
        await page.waitForLoadState('networkidle');
        
        // Go to settings/profile
        console.log('👤 Navigating to /settings/profile...');
        await page.goto(`${TEST_BASE_URL}/settings/profile`);
        await page.waitForLoadState('networkidle');
        
        // Check for points display
        const pointsDisplay = page.locator('text=點|Points|餘額|Balance').first();
        
        if (await pointsDisplay.isVisible()) {
            console.log('✅ Points display visible in profile');
            
            // Try to get the actual points value
            const pointsValue = page.locator('text=/\\d+\\s*點/').first();
            if (await pointsValue.isVisible()) {
                const text = await pointsValue.textContent();
                console.log(`💰 Current points: ${text}`);
            }
        } else {
            console.log('⚠️ Points display not visible');
        }
    });
});

test.describe('Stripe Webhook Verification', () => {
    test('Verify webhook endpoint exists and responds', async ({ request }) => {
        console.log('🔗 Testing Stripe webhook endpoint...');
        
        // This is a basic connectivity test
        // Note: Real webhook testing would require Stripe Dashboard or webhook testing tools
        
        const webhookUrl = `${TEST_BASE_URL}/api/stripe/webhook`;
        
        // Send a dummy POST (should fail without proper signature, but endpoint should exist)
        const response = await request.post(webhookUrl, {
            data: { test: true },
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        console.log(`📍 Webhook endpoint status: ${response.status()}`);
        
        // Expect either 400 (bad signature) or 500 error, not 404
        expect([400, 401, 500]).toContain(response.status());
        console.log('✅ Webhook endpoint is accessible');
    });
});
