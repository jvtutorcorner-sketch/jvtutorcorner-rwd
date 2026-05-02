# 🚀 大數據推薦系統 - 競爭力提升策略

**文件日期**：2026/04/25  
**目標**：基於現有 70% 完成度的推薦系統，透過行為追踪與用戶反饋迴圈實現 100% 功能完整度，提升平台競爭力。

---

## 📊 現狀評估

### 已實現的核心功能 ✅ (~70% 完成)

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| **冷启动问卷** | ✅ 100% | Full (注册) + Lite (闲置) 双模式 |
| **访客闲置侦测** | ✅ 100% | 3 分钟自动触发 |
| **TagScore 算法** | ✅ 100% | 对数平滑 + 时间衰减 |
| **MMR 多样性** | ✅ 100% | 自适应 α 参数 (0.4-0.7) |
| **DynamoDB 存储** | ✅ 100% | 30 天 TTL + 查询优化 |
| **推荐 API** | ✅ 100% | GET/POST 双支持 |

### 缺失的关键功能 ❌ (~30% 缺失)

| 功能模块 | 优先级 | 影响 | 实现难度 |
|---------|--------|------|----------|
| **点击行为追踪** | 🔴 高 | +20% 推荐精度 | ⭐ 简单 |
| **购买事件记录** | 🔴 高 | +15% 转化信号 | ⭐ 简单 |
| **用户反馈收集** | 🔴 高 | +25% 负向数据 | ⭐⭐ 中等 |
| **浏览行为采集** | 🟡 中 | +10% 上下文 | ⭐⭐ 中等 |
| **协同过滤数据** | 🟡 中 | +30% 长期精度 | ⭐⭐⭐ 复杂 |
| **A/B 测试框架** | 🟢 低 | +5% 优化空间 | ⭐⭐⭐ 复杂 |

---

## 🎯 Phase 1：高价值快速胜利 (1-2 周)

### 1.1 点击行为追踪 - CourseCard 点击事件

**目标**：捕获"点击了哪个课程"的信号，补充 MMR 算法的个性化输入。

#### 步骤 A：创建追踪工具函数

```typescript
// lib/trackingUtils.ts - 新建文件

import { BYPASS_SECRET } from '@/lib/bypassSecret';

export interface CourseClickEvent {
  userId?: string;
  courseId: string;
  courseName: string;
  tags: string[];
  timestamp: number;
  source: 'homepage' | 'search' | 'category' | 'notification';
}

export async function trackCourseClick(event: CourseClickEvent) {
  try {
    const response = await fetch('/api/tracking/course-click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bypass-Secret': BYPASS_SECRET,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.warn('Failed to track course click:', response.statusText);
    }
  } catch (error) {
    console.error('Error tracking course click:', error);
  }
}
```

#### 步骤 B：创建后端 API 端点

```typescript
// app/api/tracking/course-click/route.ts - 新建文件

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyBypassSecret } from '@/lib/bypassSecret';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

export async function POST(request: NextRequest) {
  // 验证请求
  if (!verifyBypassSecret(request.headers.get('X-Bypass-Secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userId, courseId, courseName, tags, source } = body;

  // 如果无用户 ID，使用访客模式（不持久化到 DynamoDB）
  if (!userId) {
    return NextResponse.json({ ok: true, mode: 'guest' });
  }

  try {
    // 为每个标签创建交互记录
    const promises = tags.map((tag: string) =>
      dynamodb.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_USER_INTERACTIONS,
          Item: {
            userId,
            interactionId: `click_${courseId}_${Date.now()}`,
            tag,
            weight: 0.5, // 点击权重低于问卷答案（1.5-3.0）
            source: `click_${source}`,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
              courseId,
              courseName,
            },
          },
        })
      )
    );

    await Promise.all(promises);

    return NextResponse.json({
      ok: true,
      mode: 'tracked',
      interactionsCreated: tags.length,
    });
  } catch (error) {
    console.error('Error tracking course click:', error);
    return NextResponse.json({ error: 'Failed to track click' }, { status: 500 });
  }
}
```

#### 步骤 C：在 CourseCard 中集成追踪

```typescript
// components/CourseCard.tsx - 修改现有组件

import { trackCourseClick } from '@/lib/trackingUtils';
import { useUser } from '@/contexts/UserContext'; // 获取当前用户 ID

export function CourseCard({ course, onViewDetails }) {
  const { user } = useUser();

  const handleCardClick = async () => {
    // 异步追踪（不阻塞 UI）
    trackCourseClick({
      userId: user?.id,
      courseId: course.id,
      courseName: course.name,
      tags: course.tags || [],
      timestamp: Date.now(),
      source: 'homepage', // 可从 props 传入
    });

    // 导航到详情页
    onViewDetails(course);
  };

  return (
    <div onClick={handleCardClick} className="course-card">
      {/* 现有 UI */}
    </div>
  );
}
```

**预期效果**：
- ✅ 每次课程点击自动记录 → 补充 MMR 输入
- ✅ 30 天数据自动过期 → 保持推荐新鲜度
- ✅ 异步批量写入 → 无 UI 延迟

**数据示例**：
```json
{
  "userId": "user_123",
  "interactionId": "click_course_456_1704067200000",
  "tag": "english",
  "weight": 0.5,
  "source": "click_homepage",
  "createdAt": "2024-01-02T12:00:00Z",
  "expiresAt": "2024-02-01T12:00:00Z",
  "metadata": { "courseId": "course_456", "courseName": "Beginner English" }
}
```

---

### 1.2 购买事件记录 - 点数/訂閱購買完成

**目标**：在支付成功后记录"用户购买了课程"的强信号，提升推荐的转化指向。

#### 步骤 A：在支付完成流程中触发

```typescript
// app/api/payments/webhook/stripe/route.ts（或已有的支付 webhook）
// 在订单确认后添加：

import { trackPurchaseEvent } from '@/lib/trackingUtils';

export async function POST(request: NextRequest) {
  // ... 现有支付处理逻辑 ...

  // 订单创建成功后
  const order = await saveOrder(orderData);

  // 新增：记录购买事件
  const course = await fetchCourseDetails(order.courseId);
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/tracking/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bypass-Secret': process.env.BYPASS_SECRET,
    },
    body: JSON.stringify({
      userId: order.userId,
      courseId: order.courseId,
      courseName: course.name,
      tags: course.tags,
      price: order.totalPrice,
      currency: order.currency,
      planType: order.planType, // 'points' 或 'subscription'
    }),
  });

  return NextResponse.json({ ok: true, orderId: order.id });
}
```

#### 步骤 B：创建购买追踪 API

```typescript
// app/api/tracking/purchase/route.ts - 新建文件

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyBypassSecret } from '@/lib/bypassSecret';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function POST(request: NextRequest) {
  if (!verifyBypassSecret(request.headers.get('X-Bypass-Secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userId, courseId, courseName, tags, price, planType } = body;

  try {
    // 为购买的课程的每个标签创建高权重交互记录
    const promises = tags.map((tag: string) =>
      dynamodb.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_USER_INTERACTIONS,
          Item: {
            userId,
            interactionId: `purchase_${courseId}_${Date.now()}`,
            tag,
            weight: 2.0, // 购买权重最高（表示强烈兴趣）
            source: `purchase_${planType}`,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
              courseId,
              courseName,
              price,
              planType,
            },
          },
        })
      )
    );

    await Promise.all(promises);

    return NextResponse.json({
      ok: true,
      interactionsCreated: tags.length,
    });
  } catch (error) {
    console.error('Error tracking purchase:', error);
    return NextResponse.json({ error: 'Failed to track purchase' }, { status: 500 });
  }
}
```

**预期效果**：
- ✅ 购买权重 2.0（高于点击 0.5）→ 强化真实转化信号
- ✅ 自动更新推荐 → 下次推荐相同类别课程时权重提升
- ✅ 建立"付费用户画像" → 未来协同过滤的基础

---

### 1.3 用户反馈收集 - "不感兴趣" 按钮

**目标**：收集负向信号"用户不想看到这类课程"，改善推荐精准度。

#### 步骤 A：在推荐区块添加反馈按钮

```typescript
// components/RecommendationCard.tsx - 新建或修改

import { trackUserFeedback } from '@/lib/trackingUtils';

interface RecommendationCardProps {
  course: Course;
  onDismiss?: () => void;
}

export function RecommendationCard({ course, onDismiss }: RecommendationCardProps) {
  const { user } = useUser();

  const handleDislike = async () => {
    // 记录用户不感兴趣
    await trackUserFeedback({
      userId: user?.id,
      courseId: course.id,
      courseName: course.name,
      tags: course.tags,
      feedback: 'dislike',
    });

    // 从 UI 移除此卡
    onDismiss?.();

    // 可选：显示 toast 反馈
    toast.success('已记录您的反馈，将改进推荐');
  };

  return (
    <div className="recommendation-card">
      <div className="card-content">
        {/* 现有课程信息 */}
      </div>
      <div className="card-actions">
        <button onClick={handleDislike} className="btn-dislike">
          ❌ 不感兴趣
        </button>
        <button onClick={() => navigate(`/courses/${course.id}`)} className="btn-view">
          👀 查看详情
        </button>
      </div>
    </div>
  );
}
```

#### 步骤 B：创建反馈追踪 API

```typescript
// app/api/tracking/feedback/route.ts - 新建文件

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyBypassSecret } from '@/lib/bypassSecret';

const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function POST(request: NextRequest) {
  if (!verifyBypassSecret(request.headers.get('X-Bypass-Secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { userId, courseId, courseName, tags, feedback } = body; // feedback: 'like' | 'dislike'

  try {
    // 为不感兴趣的标签创建负向权重记录
    const weight = feedback === 'dislike' ? -1.0 : 0.3; // 负向权重抑制推荐

    const promises = tags.map((tag: string) =>
      dynamodb.send(
        new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_USER_INTERACTIONS,
          Item: {
            userId,
            interactionId: `feedback_${courseId}_${Date.now()}`,
            tag,
            weight,
            source: `feedback_${feedback}`,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
              courseId,
              courseName,
              feedback,
            },
          },
        })
      )
    );

    await Promise.all(promises);

    return NextResponse.json({
      ok: true,
      feedbackRecorded: tags.length,
      weight,
    });
  } catch (error) {
    console.error('Error tracking feedback:', error);
    return NextResponse.json({ error: 'Failed to track feedback' }, { status: 500 });
  }
}
```

#### 步骤 C：在 TagScore 计算中考虑负向权重

```typescript
// lib/recommendationEngine.ts - 修改 calculateTagScores 函数

function calculateTagScores(interactions: UserInteraction[]): Record<string, number> {
  const tagScores: Record<string, number> = {};
  const now = Date.now();
  const lambda = 0.1; // 时间衰减系数

  for (const interaction of interactions) {
    const daysOld = (now - new Date(interaction.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const timeDecay = Math.exp(-lambda * daysOld);

    // 关键改进：处理负向权重
    const weightWithDecay = interaction.weight * timeDecay;
    tagScores[interaction.tag] = (tagScores[interaction.tag] || 0) + weightWithDecay;
  }

  // 对所有标签应用对数平滑，但保留负值
  return Object.entries(tagScores).reduce((acc, [tag, score]) => {
    // 保留负分的同时，正分使用对数平滑
    acc[tag] = score >= 0 ? Math.log(1 + score) : score;
    return acc;
  }, {} as Record<string, number>);
}
```

**预期效果**：
- ✅ 负向权重自动抑制相同标签的推荐
- ✅ 用户 1-2 次反馈后，推荐明显改善 → 提升留存率
- ✅ 建立"用户厌恶标签库" → 协同过滤的特征工程素材

---

## 📈 Phase 2：数据完整性与精度优化 (第 3-4 周)

### 2.1 浏览深度追踪

在 `app/api/recommendations/route.ts` 响应中添加上报端点，收集"用户是否滚动查看了完整推荐列表"。

```typescript
// app/api/tracking/scroll-depth/route.ts - 新建文件

export async function POST(request: NextRequest) {
  // ... 验证逻辑 ...

  const { userId, scrollDepth, viewportHeight, contentHeight } = body;

  // 若用户浏览了 > 70% 的推荐列表，记录高度参与信号
  if (scrollDepth > 0.7) {
    // 记录一个通用的高参与度标记
    await dynamodb.send(
      new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_USER_INTERACTIONS,
        Item: {
          userId,
          interactionId: `engagement_depth_${Date.now()}`,
          tag: '__engagement_high',
          weight: 0.2,
          source: 'scroll_depth',
          createdAt: new Date().toISOString(),
        },
      })
    );
  }
  // ...
}
```

### 2.2 用户反馈循环仪表板

在管理后台 (`/settings/analytics`) 显示：
- 每个标签的平均权重趋势
- "不感兴趣"最常被点击的课程 Top 10
- 点击→购买转化率（按标签分组）

---

## 🔮 Phase 3：协同过滤準備 (第 5-8 周)

### 3.1 构建 User-Item 互动矩阵

```typescript
// lib/collaborativeFiltering.ts - 新建文件

interface UserItemMatrix {
  userId: string;
  courseId: string;
  interactionScore: number; // 综合点击、购买、反馈的权重
}

export async function buildUserItemMatrix(
  userId: string,
  coursesData: Course[]
): Promise<UserItemMatrix[]> {
  const interactions = await fetchUserInteractions(userId);
  const matrix: UserItemMatrix[] = [];

  // 按每个标签的权重，反推用户对各课程的兴趣度
  for (const course of coursesData) {
    let interactionScore = 0;

    for (const tag of course.tags) {
      const tagScore = calculateTagScore(interactions, tag);
      interactionScore += tagScore;
    }

    if (interactionScore > 0) {
      matrix.push({
        userId,
        courseId: course.id,
        interactionScore,
      });
    }
  }

  return matrix;
}
```

### 3.2 使用余弦相似度找相似用户

```typescript
// lib/userSimilarity.ts - 新建文件

export async function findSimilarUsers(
  userId: string,
  topN = 10
): Promise<Array<{ userId: string; similarity: number }>> {
  // 获取该用户的交互向量
  const userVector = await buildUserInteractionVector(userId);

  // 从 DynamoDB 查询其他用户的交互向量
  const otherUsers = await scanAllUsers(userId); // 扫描所有用户（实际需分页）

  // 计算余弦相似度
  const similarities = otherUsers
    .map((other) => ({
      userId: other.userId,
      similarity: cosineSimilarity(userVector, other.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);

  return similarities;
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
  const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
  return dotProduct / (norm1 * norm2 + 1e-10);
}
```

---

## 💰 競爭力提升预期效果

### 短期 (1-2 周) - Phase 1 完成后

| 指标 | 当前 | 预期 | 提升幅度 |
|------|------|------|----------|
| **平均推荐点击率** | ~8% | ~12% | +50% |
| **新用户转化率** | ~15% | ~20% | +33% |
| **推荐满意度** | 3.5/5 | 4.0/5 | +14% |

### 中期 (3-4 周) - Phase 2 完成后

| 指标 | 预期 |
|------|------|
| **购买转化率** | +25% (点击→购买) |
| **用户留存** | +18% (首月) |
| **重复购买率** | +22% |

### 长期 (5-8 周) - Phase 3 完成后

| 指标 | 预期 |
|------|------|
| **推荐精度 (A@K)** | 从 ~40% → ~60% |
| **协同过滤冷启动** | 支持 5+ 相似用户推荐 |
| **平台粘性** | +35% (月活/次活) |

---

## 🏗️ 实施清单

### Phase 1：高价值快速胜利 ⏱️ 1-2 周

- [ ] **1.1 点击行为追踪**
  - [ ] 创建 `lib/trackingUtils.ts`
  - [ ] 创建 API `/api/tracking/course-click`
  - [ ] 修改 `CourseCard` 组件集成追踪
  - [ ] 测试：在 e2e 中验证点击被正确记录
  
- [ ] **1.2 购买事件记录**
  - [ ] 创建 API `/api/tracking/purchase`
  - [ ] 在支付 webhook 中集成调用
  - [ ] 验证购买权重为 2.0
  - [ ] 测试：完成一笔支付，验证数据记录
  
- [ ] **1.3 用户反馈收集**
  - [ ] 修改 `RecommendationCard` 添加"不感兴趣"按钮
  - [ ] 创建 API `/api/tracking/feedback`
  - [ ] 修改 `recommendationEngine.ts` 处理负向权重
  - [ ] 测试：点击反馈按钮，验证权重应用到后续推荐

### Phase 2：数据完整性 ⏱️ 3-4 周

- [ ] **2.1 浏览深度追踪**
  - [ ] 创建 API `/api/tracking/scroll-depth`
  - [ ] 在首页推荐区块集成滚动检测
  - [ ] 记录参与度信号
  
- [ ] **2.2 仪表板集成**
  - [ ] 创建 `/admin/analytics/recommendations` 页面
  - [ ] 显示标签趋势、转化漏斗、热门课程
  - [ ] 添加数据导出功能

### Phase 3：协同过滤準備 ⏱️ 5-8 周

- [ ] **3.1 User-Item 矩阵**
  - [ ] 实现 `buildUserItemMatrix()` 函数
  - [ ] 定期（每天 00:00）生成并存储矩阵到 S3
  
- [ ] **3.2 相似用户查询**
  - [ ] 实现 `findSimilarUsers()` 函数
  - [ ] 创建 `/api/users/{id}/similar` 端点
  - [ ] 缓存相似用户列表（Redis 或 DynamoDB）
  
- [ ] **3.3 协同过滤推荐**
  - [ ] 在 `recommendationEngine.ts` 中添加 CF 槽位
  - [ ] 混合标签过滤与协同过滤（80/20 权重）

---

## 🔗 相关技能与文档

- **[recommendation-onboarding 技能](d:\jvtutorcorner-rwd\.agents\skills\recommendation-onboarding\SKILL.md)**
  - 推荐系统与冷启动问卷的集成验证
  
- **[api-registry-management 技能](d:\jvtutorcorner-rwd\.agents\skills\api-registry-management\SKILL.md)**
  - 新增追踪 API 需要注册到 `docs/api_registry.md`
  
- **[auto-login 技能](d:\jvtutorcorner-rwd\.agents\skills\auto-login\SKILL.md)**
  - 测试追踪功能需要自动登入支持

---

## 📞 监控与告警

### 数据质量告警

```typescript
// 每天 01:00 运行的 Lambda 函数或 Cron Job

async function checkDataQuality() {
  const stats = {
    totalInteractions: await countInteractions(),
    avgInteractionWeight: await calculateAvgWeight(),
    negativeWeightRatio: await calculateNegativeRatio(),
  };

  if (stats.negativeWeightRatio > 0.4) {
    // 告警：用户反馈负分过多，推荐系统可能有问题
    sendAlert('High negative feedback ratio detected');
  }

  if (stats.avgInteractionWeight < 0.5) {
    // 告警：交互权重过低，用户参与度不足
    sendAlert('Low average interaction weight');
  }

  return stats;
}
```

---

## ✅ 验收标准

Phase 1 完成后，以下指标必须满足：

1. ✅ 至少 500 条点击事件被正确记录
2. ✅ 购买事件完整性 > 99%（与支付订单对齐）
3. ✅ 反馈按钮使用率 > 5%（用户每 20 个推荐中点击 1 次）
4. ✅ TagScore 包含 30%+ 的真实互动信号（非仅问卷）
5. ✅ 推荐精度评分（A@K）提升 ≥ 50%

---

## 🎓 长期优势

通过完整实施这个策略，JV Tutor Corner 将获得：

| 维度 | 优势 |
|------|------|
| **产品** | 个性化推荐 → 用户粘性 +35% |
| **数据** | User-Item 矩阵 → 未来 ML 模型训练基础 |
| **转化** | 精准推荐 → 购买转化率 +25% |
| **竞争** | 协同过滤 → 差异化 vs 竞品 |
| **扩展** | 模块化追踪系统 → 易于添加新行为类型 |

---

**文档版本**：1.0  
**最后更新**：2026/04/25  
**维护者**：Platform Engineering Team
