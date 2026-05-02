# ⚡ Big Data Collection - 快速参考指南

**用途**：快速查阅追踪 API 的基本用法  
**目标用户**：前端工程师、产品工程师

---

## 📌 一页纸速查表

### 1️⃣ 点击追踪

**场景**：用户点击了课程卡

**代码**：
```typescript
import { trackCourseClick } from '@/lib/trackingUtils';

// 在 onClick handler 中调用
trackCourseClick({
  userId: user?.id,
  courseId: course.id,
  courseName: course.name,
  tags: course.tags || [],
  source: 'homepage', // or 'search', 'category', 'recommendation'
});
```

**权重**：0.5  
**TTL**：30 天  
**影响**：下次推荐时，相同标签的课程排名提升

---

### 2️⃣ 购买追踪

**场景**：用户成功购买/报名课程

**代码**：
```typescript
import { trackPurchaseEvent } from '@/lib/trackingUtils';

// 在支付成功后调用
await trackPurchaseEvent({
  userId: order.userId,
  courseId: order.courseId,
  courseName: course.name,
  tags: course.tags || [],
  price: order.totalPrice,
  currency: 'TWD',
  planType: 'points', // or 'subscription', 'combo'
});
```

**权重**：2.0（最高）  
**TTL**：30 天  
**影响**：自动提升推荐精度，下次推荐相同类别课程时权重翻倍

---

### 3️⃣ 反馈收集

**场景**：用户点击"不感兴趣"或"喜欢"按钮

**代码**：
```typescript
import { trackUserFeedback } from '@/lib/trackingUtils';

// 用户不感兴趣
await trackUserFeedback({
  userId: user?.id,
  courseId: course.id,
  courseName: course.name,
  tags: course.tags || [],
  feedback: 'dislike', // or 'like'
  reason: 'not_interested', // optional
});

// 效果：下次推荐会自动避免相同标签的课程
```

**权重**：
- Like：+0.3（温和正信号）
- Dislike：-1.0（强负信号，抑制推荐）

**TTL**：30 天  
**影响**：立即生效，下次推荐自动排除不感兴趣的标签

---

### 4️⃣ 参与度追踪

**场景**：用户滚动推荐列表（自动追踪）

**代码**：
```typescript
import { useScrollDepthTracking } from '@/hooks/useScrollDepthTracking';

export function RecommendationsSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 自动追踪
  useScrollDepthTracking({ containerRef, enabled: true });

  return <div ref={containerRef}>{/* 推荐内容 */}</div>;
}
```

**权重**：0.2（仅在 70% 深度时记录）  
**TTL**：30 天  
**影响**：次要信号，增加用户参与度的基础得分

---

## 🎯 三步集成清单

### 第 1 步：在组件中导入

```typescript
import { trackCourseClick, trackUserFeedback } from '@/lib/trackingUtils';
import { useUser } from '@/contexts/UserContext';
```

### 第 2 步：获取必要信息

```typescript
const { user } = useUser(); // 获取 userId
const { courseId, name, tags } = course; // 获取课程信息
```

### 第 3 步：在事件处理中调用

```typescript
const handleClick = () => {
  trackCourseClick({ userId: user?.id, courseId, ... });
  // 继续执行原有逻辑
};
```

---

## 🔍 数据验证

### 检查追踪是否成功

打开浏览器开发者工具 → Network 标签 → 搜索 "tracking"

**成功的请求**：
```
Status: 200
Response: { "ok": true, "interactionsCreated": 2 }
```

### 查看 DynamoDB 中的数据

```bash
# 使用 AWS CLI 查询
aws dynamodb query \
  --table-name jvtutorcorner-user-interactions \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values "{\":uid\":{\"S\":\"user_123\"}}"
```

---

## ⚠️ 常见问题

### Q1：会影响性能吗？
**A**：否。所有追踪调用都是异步的，不会阻塞 UI。

### Q2：访客用户会被追踪吗？
**A**：点击会被记录，但不会持久化到 DynamoDB。购买需要 userId。

### Q3：数据多久过期？
**A**：所有数据都有 30 天的 TTL，之后自动删除。

### Q4：能否修改权重？
**A**：权重在 API 端点中硬编码（点击 0.5，购买 2.0，不感兴趣 -1.0）。需要修改文件以改变权重。

### Q5：推荐何时更新？
**A**：立即生效。下一次调用 GET /api/recommendations 时，新的权重会自动应用。

---

## 📊 权重对比表

| 行为 | 权重 | 相对值 | 用途 |
|------|------|--------|------|
| 购买 | 2.0 | 4x 点击 | 强确认信号 |
| 点击 | 0.5 | 基准 | 中等兴趣 |
| 参与度 | 0.2 | 0.4x 点击 | 辅助信号 |
| 喜欢 | 0.3 | 0.6x 点击 | 温和认可 |
| 不感兴趣 | -1.0 | 负值 | 排斥信号 |

---

## 🚀 集成示例

### 示例 1：CourseCard

```typescript
export function CourseCard({ course, onViewDetails }) {
  const { user } = useUser();

  const handleClick = () => {
    // 追踪
    trackCourseClick({
      userId: user?.id,
      courseId: course.id,
      courseName: course.name,
      tags: course.tags || [],
      source: 'homepage',
    });

    // 导航
    if (onViewDetails) onViewDetails(course);
  };

  return <div onClick={handleClick}>{/* UI */}</div>;
}
```

### 示例 2：推荐卡片反馈

```typescript
export function RecommendationCard({ course, onRemove }) {
  const { user } = useUser();

  const handleDislike = async () => {
    await trackUserFeedback({
      userId: user?.id,
      courseId: course.id,
      courseName: course.name,
      tags: course.tags || [],
      feedback: 'dislike',
    });
    onRemove?.(course.id);
  };

  return (
    <div>
      <button onClick={handleDislike}>❌ 不感兴趣</button>
      {/* 其他 UI */}
    </div>
  );
}
```

### 示例 3：支付成功回调

```typescript
async function onPaymentSuccess(order, course) {
  // 保存订单
  await saveOrder(order);

  // 追踪购买
  await trackPurchaseEvent({
    userId: order.userId,
    courseId: order.courseId,
    courseName: course.name,
    tags: course.tags || [],
    price: order.price,
    currency: 'TWD',
    planType: 'points',
  });

  // 重新加载推荐
  await refetchRecommendations();
}
```

---

## 🔗 文档链接

| 文档 | 用途 | 阅读时间 |
|------|------|----------|
| [完整策略](BIG_DATA_COLLECTION_COMPETITIVE_STRATEGY.md) | 了解整个项目 | 15 min |
| [集成指南](BIG_DATA_COLLECTION_INTEGRATION_GUIDE.md) | 详细实现步骤 | 20 min |
| [API 注册表](docs/api_registry.md) | API 参考 | 5 min |
| [本文档](#) | 快速查阅 | 3 min |

---

## 📞 支持

**问题**？检查以下资源：
1. [集成指南的故障排查部分](BIG_DATA_COLLECTION_INTEGRATION_GUIDE.md#故障排查)
2. 浏览器控制台的网络标签
3. CloudWatch 日志

---

**版本**：1.0  
**最后更新**：2026/04/25
