# Whiteboard ACK Timeout Fix Summary

## Problem
用户报告白板在绘制时出现大量错误：
- `[WB ERR] Canvas sync not confirmed for stroke`
- `[WB ACK] ✗ Timeout after N attempts`

ACK 超时次数范围从 15 到 127 次，表明同步机制存在严重问题。

## Root Causes Identified

1. **ACK 超时太短**：原始设置为 `maxAttempts=15, intervalMs=80ms` = 1.2 秒总超时
2. **后端持久化延迟**：DynamoDB 写入可能存在延迟，导致 ACK 检查找不到 stroke
3. **同步检测逻辑错误**：日志显示"Client behind server by -1 strokes"（负数），表明对比逻辑有误
4. **过于激进的轮询**：固定 80ms 间隔可能导致频繁网络请求堆积

## Solutions Implemented

### 1. 增加 ACK 超时（EnhancedWhiteboard.tsx）
```typescript
// Before: maxAttempts=15, intervalMs=80 → 1.2秒
// After: maxAttempts=80, intervalMs=100-200 → 12-14秒
```

### 2. 实现自适应退避策略
- **前 50 次尝试**：100ms 间隔（快速响应 ✓）
- **后 30 次尝试**：200ms 间隔（减少服务器负载）
- **总超时**：约 12-14 秒

```typescript
// 在第 50 次尝试后自动切换到较慢的检查频率
if (attempts === 50) {
  // switch from 100ms to 200ms intervals
}
```

### 3. 修复同步检测逻辑
```typescript
// Before: 显示误导性的负数信息
console.warn('[WB POLL] ⚠ Client behind server by', remoteCount - localCount, 'strokes');

// After: 准确区分超前/落后
const strokeDiff = remoteCount - localCount;
const diffMsg = strokeDiff > 0 
  ? `Client behind server by ${strokeDiff} strokes`
  : `Client ahead of server by ${Math.abs(strokeDiff)} strokes`;
```

### 4. 改进错误处理
- 只在 verbose 模式或多次超时时报告错误
- 添加详细的诊断信息（尝试次数、总等待时间）
- 更好的 stroke ID 验证

### 5. 增加性能诊断日志
在 `whiteboardService.ts` 中添加：
- DynamoDB 读写性能计时
- 详细的操作日志（操作类型、数据量、耗时）

```typescript
// 现在会记录每个操作的耗时
console.log('[WhiteboardService] Saved state successfully:', { 
  uuid, 
  strokeCount, 
  duration: '125ms' 
});
```

## Expected Improvements

✅ **更可靠的 ACK 确认**：12-14 秒的超时时间应该足以覆盖大多数网络/DynamoDB 延迟  
✅ **减少错误日志噪音**：只在真正的问题时才报告错误  
✅ **更好的诊断信息**：新增性能日志有助于定位后端瓶颈  
✅ **自适应策略**：根据操作阶段调整检查频率，平衡响应速度和服务器负载  

## Testing Recommendations

1. **快速绘制测试**：快速连续绘制多条线，观察是否仍有 ACK 超时
2. **网络延迟模拟**：使用浏览器开发工具限制网速，验证超时不会太频繁
3. **DynamoDB 监控**：检查 CloudWatch 中的 DynamoDB 写入延迟
4. **多用户场景**：多个用户同时绘制，验证同步一致性

## Related Files Modified

- `components/EnhancedWhiteboard.tsx`：增加 ACK 超时和自适应退避
- `lib/whiteboardService.ts`：添加性能诊断日志

## Commits

- `3a7e4d1`：Optimize ACK timeout: increase from 1.2s to 5s
- `381d30e`：Implement adaptive ACK backoff
- `cb6f9d9`：Add detailed DynamoDB performance logging

## Next Steps

如果 ACK 超时仍然频繁发生：
1. 检查 CloudWatch 日志中的 DynamoDB 写入延迟
2. 考虑使用批量 ACK（累积多个 stroke 后一起确认）
3. 检查 AppSync 订阅是否正常工作
4. 考虑使用 WebSocket 而不是轮询（更高效）
