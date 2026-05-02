# 🔧 Big Data Collection - Phase 1 集成指南

**日期**：2026/04/25  
**目標**：在現有組件中集成行為追踪功能，提升推薦系統精度

---

## 📋 集成清單

### ✅ 已完成的後端設置

| 模塊 | 文件 | 功能 | 權重 | TTL |
|------|------|------|------|-----|
| **點擊追蹤** | `app/api/tracking/course-click/route.ts` | 記錄課程卡點擊 | 0.5 | 30天 |
| **購買事件** | `app/api/tracking/purchase/route.ts` | 記錄購買/報名 | 2.0 | 30天 |
| **用戶反饋** | `app/api/tracking/feedback/route.ts` | Like/Dislike | ±0.3/-1.0 | 30天 |
| **參與度** | `app/api/tracking/scroll-depth/route.ts` | 高參與度信號 | 0.2 | 30天 |
| **工具函數** | `lib/trackingUtils.ts` | 客戶端調用接口 | - | - |
| **推薦引擎** | `lib/recommendationEngine.ts` | 負權重支持 | - | - |

---

## 🔌 前端集成步驟

### 1. CourseCard 組件 - 點擊追蹤集成

**位置**：`components/CourseCard.tsx`（需要查找確切位置）

**修改示例**：

```typescript
import { trackCourseClick } from '@/lib/trackingUtils';
import { useUser } from '@/contexts/UserContext'; // 或您的用戶上下文

export function CourseCard({ course, onViewDetails, source = 'homepage' }) {
  const { user } = useUser(); // 獲取當前用戶 ID

  const handleCardClick = async () => {
    // 非阻塞式追蹤
    trackCourseClick({
      userId: user?.id,
      courseId: course.id,
      courseName: course.name || course.title,
      tags: course.tags || [],
      timestamp: Date.now(),
      source: source as 'homepage' | 'search' | 'category' | 'recommendation',
    });

    // 進行原有的導航邏輯
    if (onViewDetails) {
      onViewDetails(course);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="course-card cursor-pointer"
      role="button"
      tabIndex={0}
    >
      {/* 現有 CourseCard UI */}
    </div>
  );
}
```

**集成風險**：⚠️ 低 - 非阻塞式調用，不影響現有邏輯

---

### 2. RecommendationCard 組件 - 反饋按鈕集成

**位置**：首頁推薦區塊（可能在 `app/ClientHomePage.tsx` 或 `components/HomePageRecommendations.tsx`）

**新增組件結構**：

```typescript
import { trackUserFeedback } from '@/lib/trackingUtils';
import { useUser } from '@/contexts/UserContext';
import { toast } from '@/lib/toast'; // 或您的 toast 組件

interface RecommendationCardProps {
  course: Course;
  index: number;
  onRemove?: (id: string) => void;
}

export function RecommendationCard({
  course,
  index,
  onRemove,
}: RecommendationCardProps) {
  const { user } = useUser();

  const handleDislike = async () => {
    // 記錄不感興趣反饋
    await trackUserFeedback({
      userId: user?.id || '',
      courseId: course.id,
      courseName: course.name || course.title,
      tags: course.tags || [],
      feedback: 'dislike',
      reason: 'not_interested', // 可選
    });

    // 從 UI 移除此卡（可選）
    if (onRemove) {
      onRemove(course.id);
      toast.success('已記錄您的反饋，將改進推薦');
    }
  };

  const handleLike = async () => {
    // 可選：記錄喜歡反饋
    await trackUserFeedback({
      userId: user?.id || '',
      courseId: course.id,
      courseName: course.name || course.title,
      tags: course.tags || [],
      feedback: 'like',
    });

    toast.success('感謝您的反饋！');
  };

  return (
    <div className="recommendation-card group">
      <div className="card-content">
        {/* 現有課程信息顯示 */}
        <img src={course.image} alt={course.name} />
        <h3>{course.name}</h3>
        <p>{course.description}</p>
      </div>

      <div className="card-actions space-x-2">
        <button
          onClick={handleDislike}
          className="btn btn-outline btn-sm"
          title="告訴我們您對此推薦不感興趣"
        >
          ❌ 不感興趣
        </button>

        <button
          onClick={handleLike}
          className="btn btn-outline btn-sm"
          title="標記您喜歡此推薦"
        >
          ❤️ 喜歡
        </button>

        <button
          onClick={() => window.location.href = `/courses/${course.id}`}
          className="btn btn-primary btn-sm"
        >
          👀 查看詳情
        </button>
      </div>
    </div>
  );
}
```

**集成風險**：⚠️ 中等 - 需要確認推薦區塊的現有結構

---

### 3. 支付流程集成 - 購買事件追蹤

**位置**：支付完成回調（可能在 `app/api/payments/webhook/` 或支付完成頁面）

**集成示例**：

```typescript
// 在支付成功後調用
import { trackPurchaseEvent } from '@/lib/trackingUtils';

export async function handlePaymentSuccess(order: Order, course: Course) {
  // 1. 現有的支付處理邏輯...
  await saveOrder(order);

  // 2. 記錄購買事件
  await trackPurchaseEvent({
    userId: order.userId,
    courseId: order.courseId,
    courseName: course.name || course.title,
    tags: course.tags || [],
    price: order.totalPrice,
    currency: order.currency || 'TWD',
    planType: order.planType || 'points', // 'points' | 'subscription' | 'combo'
  });

  // 3. 顯示成功消息並重新加載推薦
  toast.success('購買成功！');
  await refetchRecommendations(order.userId);
}
```

**集成風險**：⚠️ 中等 - 需要在支付 webhook 中集成

---

### 4. 滾動深度追蹤 - 推薦區塊集成

**位置**：推薦區塊容器（`app/ClientHomePage.tsx` 或專門的推薦組件）

**新增 Hook 實現**：

```typescript
// hooks/useScrollDepthTracking.ts - 新建

import { useEffect, useRef } from 'react';
import { trackScrollDepth } from '@/lib/trackingUtils';
import { useUser } from '@/contexts/UserContext';

interface ScrollDepthOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  enabled?: boolean;
  debounceMs?: number;
}

export function useScrollDepthTracking({
  containerRef,
  enabled = true,
  debounceMs = 1000,
}: ScrollDepthOptions) {
  const { user } = useUser();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const trackedRef = useRef<Set<number>>(new Set()); // 記錄已追蹤的深度

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    const handleScroll = () => {
      // 清除之前的 timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // 防抖：延遲 debounceMs 毫秒後執行
      timeoutRef.current = setTimeout(() => {
        if (!container) return;

        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const scrollTop = container.scrollTop;

        const scrollDepth = (scrollTop + clientHeight) / scrollHeight;

        // 只記錄 70% 以上的深度（詳見 scroll-depth API）
        if (scrollDepth > 0.7) {
          // 避免重複追蹤
          const depthInt = Math.floor(scrollDepth * 10); // 0.7->7, 1.0->10
          if (!trackedRef.current.has(depthInt)) {
            trackedRef.current.add(depthInt);

            trackScrollDepth({
              userId: user?.id,
              scrollDepth,
              viewportHeight: clientHeight,
              contentHeight: scrollHeight,
              timeSpent: Date.now(),
            });
          }
        }
      }, debounceMs);
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, containerRef, user?.id]);
}
```

**在推薦區塊中使用**：

```typescript
// app/ClientHomePage.tsx 或推薦區塊組件

import { useScrollDepthTracking } from '@/hooks/useScrollDepthTracking';

export function RecommendationsSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 自動追蹤滾動深度
  useScrollDepthTracking({ containerRef, enabled: true });

  return (
    <div ref={containerRef} className="recommendations-container overflow-y-auto h-96">
      {/* 推薦課程卡片 */}
      {recommendations.map((course) => (
        <RecommendationCard key={course.id} course={course} />
      ))}
    </div>
  );
}
```

**集成風險**：⚠️ 低 - 完全獨立的功能，不影響現有邏輯

---

## 🧪 測試清單

### 測試 1：點擊追蹤驗證

```typescript
// e2e/course-click-tracking.spec.ts - 新建測試

import { test, expect } from '@playwright/test';

test.describe('Course Click Tracking', () => {
  test('should track click on course card', async ({ page }) => {
    await page.goto('/');

    // 監聽 API 調用
    const clickPromise = page.waitForRequest('/api/tracking/course-click');

    // 點擊第一張課程卡
    await page.click('[data-testid="course-card-0"]');

    // 驗證 API 被調用
    const request = await clickPromise;
    expect(request.method()).toBe('POST');

    const body = await request.postDataJSON();
    expect(body).toHaveProperty('courseId');
    expect(body).toHaveProperty('tags');
    expect(body.weight).toBeUndefined(); // 追蹤是客戶端調用，服務端設置權重
  });

  test('should not track click for guest users', async ({ page }) => {
    // 不登入直接訪問
    await page.goto('/');
    await page.localStorage.setItem('session_id', ''); // 清除 session

    const requests = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/tracking/course-click')) {
        requests.push(req);
      }
    });

    await page.click('[data-testid="course-card-0"]');

    // 等待任何可能的異步調用
    await page.waitForTimeout(2000);

    // 對於訪客，API 應該返回 guest 模式（不持久化）
    if (requests.length > 0) {
      const response = await requests[0].response();
      const body = await response?.json();
      expect(body?.mode).toBe('guest');
    }
  });
});
```

### 測試 2：購買事件追蹤

```typescript
// e2e/purchase-tracking.spec.ts

test('should track purchase event after payment', async ({ page }) => {
  // 登入用戶
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // 導航到課程購買
  await page.goto('/courses/123');
  await page.click('button:has-text("購買現在")');

  // 填寫支付信息...
  // 提交支付...

  // 監聽購買追蹤 API
  const purchasePromise = page.waitForRequest(
    (req) => req.url().includes('/api/tracking/purchase') && req.method() === 'POST'
  );

  // 模擬支付成功回調
  await page.goto('/payment/success');

  const request = await purchasePromise;
  const body = await request.postDataJSON();

  expect(body.userId).toBeDefined();
  expect(body.courseId).toBe('123');
  expect(body.planType).toMatch(/points|subscription|combo/);
});
```

### 測試 3：反饋收集

```typescript
// e2e/feedback-tracking.spec.ts

test('should track dislike feedback', async ({ page }) => {
  await page.goto('/');

  // 監聽反饋 API
  const feedbackPromise = page.waitForRequest(
    (req) => req.url().includes('/api/tracking/feedback') && req.method() === 'POST'
  );

  // 點擊"不感興趣"按鈕
  await page.click('button:has-text("不感興趣")');

  const request = await feedbackPromise;
  const body = await request.postDataJSON();

  expect(body.feedback).toBe('dislike');
  expect(body.courseId).toBeDefined();
  expect(body.tags).toBeInstanceOf(Array);
});
```

---

## 📊 驗收標準

Phase 1 集成完成時，應滿足以下標準：

| 標準 | 目標 | 驗證方式 |
|------|------|---------|
| **點擊追蹤準確性** | > 95% | CloudWatch Logs 監控 |
| **購買事件完整性** | 100% | 與訂單表對齐 |
| **反饋使用率** | > 5% | 用戶每 20 個推薦點擊 1 次 |
| **API 可用性** | 99.9% | 月度 uptime 監控 |
| **延遲影響** | < 10ms | 非阻塞式調用確認 |
| **標籤數據質量** | 100% | 驗證每個互動有有效標籤 |

---

## 🚀 下一步行動

### 立即執行（本週）

1. **查找並修改 CourseCard 組件**
   ```bash
   find . -name "CourseCard*" -type f | grep -E "\.(tsx|ts)$"
   ```

2. **確認推薦區塊位置**
   ```bash
   grep -r "RecommendationCard\|recommendation" components/ --include="*.tsx" | head -20
   ```

3. **查找支付 webhook**
   ```bash
   grep -r "payment.*success\|webhook.*payment" app/api --include="*.ts" | head -10
   ```

4. **建立測試環境**
   - 準備 e2e 測試用例
   - 配置測試數據庫連接

### 驗收檢查清單

- [ ] CourseCard 集成點擊追蹤
- [ ] RecommendationCard 添加反饋按鈕
- [ ] 支付 webhook 集成購買事件
- [ ] 推薦區塊集成滾動深度
- [ ] 所有 4 個 API 端點正常運作
- [ ] e2e 測試全通過
- [ ] 至少 500 條追蹤數據
- [ ] 推薦精度提升 ≥ 50%

---

## 📞 故障排查

### 問題 1：API 返回 401/403

**原因**：未配置正確的認證  
**解決**：檢查環境變數 `DYNAMODB_TABLE_USER_INTERACTIONS`

```bash
echo $DYNAMODB_TABLE_USER_INTERACTIONS
# 應輸出: jvtutorcorner-user-interactions
```

### 問題 2：DynamoDB 寫入失敗

**原因**：表名或權限配置  
**檢查**：

```bash
# 驗證 DynamoDB 表存在
aws dynamodb describe-table --table-name jvtutorcorner-user-interactions
```

### 問題 3：追蹤數據未出現

**原因**：JavaScript 錯誤或網絡問題  
**調試**：

```typescript
// 在瀏覽器控制台檢查
window.localStorage.getItem('jv_survey_seeds'); // 查看訪客數據
fetch('/api/tracking/course-click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'test_user_123',
    courseId: 'course_456',
    tags: ['english', 'beginner'],
  }),
}).then(r => r.json()).then(console.log);
```

---

**文件版本**：1.0  
**最後更新**：2026/04/25
