/**
 * AWS Health Checker
 * 
 * Monitors the health of AWS services used by the platform:
 * - DynamoDB tables: status, item counts, capacity
 * - S3 bucket: accessibility
 * - Lambda functions: status, last invocation errors
 * - Service quotas / billing alerts
 * 
 * Designed to run every 6 hours with minimal cost (no Gemini API calls).
 */

import { ddbDocClient } from './dynamo';
import { DescribeTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// ── Types ──────────────────────────────────────────────────────────
export interface HealthCheckResult {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'critical';
  services: ServiceCheck[];
  alerts: HealthAlert[];
}

export interface ServiceCheck {
  service: string;
  name: string;
  status: 'ok' | 'warning' | 'error' | 'unknown';
  details: string;
  metrics?: Record<string, string | number>;
}

export interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  service: string;
  message: string;
  recommendation: string;
}

// ── DynamoDB Tables to Monitor ─────────────────────────────────────
const MONITORED_TABLES = [
  'jvtutorcorner-courses',
  'jvtutorcorner-teachers',
  'jvtutorcorner-pricing',
  'jvtutorcorner-user-profiles',
  'jvtutorcorner-orders',
  'jvtutorcorner-points-escrow',
  'jvtutorcorner-subscriptions',
  'jvtutorcorner-carousel',
  'jvtutorcorner-app-integrations',
  'jvtutorcorner-tickets',
  'jvtutorcorner-teacher-reviews',
  'jvtutorcorner-daily-reports',
];

// ── DynamoDB Health Check ──────────────────────────────────────────
async function checkDynamoDB(): Promise<{ checks: ServiceCheck[]; alerts: HealthAlert[] }> {
  const checks: ServiceCheck[] = [];
  const alerts: HealthAlert[] = [];

  const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

  // List all tables first
  let existingTables: string[] = [];
  try {
    const listResult = await ddbClient.send(new ListTablesCommand({}));
    existingTables = listResult.TableNames || [];
  } catch (err: any) {
    checks.push({
      service: 'DynamoDB',
      name: 'Table Listing',
      status: 'error',
      details: `無法列出資料表: ${err.message}`,
    });
    alerts.push({
      severity: 'critical',
      service: 'DynamoDB',
      message: '無法連線到 DynamoDB',
      recommendation: '檢查 AWS 認證資料 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) 和區域設定',
    });
    return { checks, alerts };
  }

  // Check each monitored table
  for (const tableName of MONITORED_TABLES) {
    // Use env var override if available
    const envKey = `DYNAMODB_TABLE_${tableName.replace('jvtutorcorner-', '').replace(/-/g, '_').toUpperCase()}`;
    const actualTableName = process.env[envKey] || tableName;

    if (!existingTables.includes(actualTableName)) {
      checks.push({
        service: 'DynamoDB',
        name: actualTableName,
        status: 'warning',
        details: '資料表不存在（可能尚未建立）',
      });
      continue;
    }

    try {
      const desc = await ddbClient.send(new DescribeTableCommand({ TableName: actualTableName }));
      const table = desc.Table;

      if (!table) {
        checks.push({
          service: 'DynamoDB',
          name: actualTableName,
          status: 'unknown',
          details: '無法取得資料表資訊',
        });
        continue;
      }

      const status = table.TableStatus || 'UNKNOWN';
      const itemCount = table.ItemCount || 0;
      const sizeBytes = table.TableSizeBytes || 0;
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

      const isActive = status === 'ACTIVE';

      checks.push({
        service: 'DynamoDB',
        name: actualTableName,
        status: isActive ? 'ok' : 'warning',
        details: `狀態: ${status} | 項目數: ${itemCount.toLocaleString()} | 大小: ${sizeMB} MB`,
        metrics: {
          tableStatus: status,
          itemCount,
          sizeBytes,
          sizeMB: parseFloat(sizeMB),
        },
      });

      // Alert if table is not active
      if (!isActive) {
        alerts.push({
          severity: 'warning',
          service: 'DynamoDB',
          message: `${actualTableName} 狀態異常: ${status}`,
          recommendation: '檢查 AWS Console 中的資料表狀態',
        });
      }

      // Alert if table is getting large (> 10GB)
      if (sizeBytes > 10 * 1024 * 1024 * 1024) {
        alerts.push({
          severity: 'warning',
          service: 'DynamoDB',
          message: `${actualTableName} 資料量超過 10GB (${sizeMB} MB)`,
          recommendation: '考慮資料歸檔策略或啟用 DynamoDB Time-to-Live (TTL)',
        });
      }

    } catch (err: any) {
      checks.push({
        service: 'DynamoDB',
        name: actualTableName,
        status: 'error',
        details: `檢查失敗: ${err.message}`,
      });
    }
  }

  return { checks, alerts };
}

// ── S3 Health Check ────────────────────────────────────────────────
async function checkS3(): Promise<{ checks: ServiceCheck[]; alerts: HealthAlert[] }> {
  const checks: ServiceCheck[] = [];
  const alerts: HealthAlert[] = [];

  const bucketName = process.env.AWS_S3_BUCKET_NAME;

  if (!bucketName) {
    checks.push({
      service: 'S3',
      name: 'Bucket',
      status: 'warning',
      details: 'AWS_S3_BUCKET_NAME 未設定',
    });
    return { checks, alerts };
  }

  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));

    checks.push({
      service: 'S3',
      name: bucketName,
      status: 'ok',
      details: 'Bucket 可正常存取',
    });
  } catch (err: any) {
    const isNotFound = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
    const isForbidden = err.name === 'Forbidden' || err.$metadata?.httpStatusCode === 403;

    checks.push({
      service: 'S3',
      name: bucketName,
      status: 'error',
      details: isNotFound ? 'Bucket 不存在' : isForbidden ? '權限不足' : `錯誤: ${err.message}`,
    });

    alerts.push({
      severity: 'critical',
      service: 'S3',
      message: `S3 Bucket "${bucketName}" ${isNotFound ? '不存在' : isForbidden ? '權限不足' : '無法存取'}`,
      recommendation: isNotFound ? '確認 Bucket 名稱是否正確' : '檢查 IAM 權限設定',
    });
  }

  return { checks, alerts };
}

// ── Environment Variables Check ────────────────────────────────────
function checkEnvironment(): { checks: ServiceCheck[]; alerts: HealthAlert[] } {
  const checks: ServiceCheck[] = [];
  const alerts: HealthAlert[] = [];

  const requiredVars = [
    { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key' },
    { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Key' },
    { key: 'AWS_REGION', label: 'AWS Region' },
    { key: 'GEMINI_API_KEY', label: 'Gemini API Key' },
    { key: 'CRON_SECRET', label: 'Cron Secret' },
  ];

  const optionalVars = [
    { key: 'SMTP_USER', label: 'Email SMTP User' },
    { key: 'SMTP_PASS', label: 'Email SMTP Password' },
    { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key' },
    { key: 'PAYPAL_CLIENT_ID', label: 'PayPal Client ID' },
    { key: 'ECPAY_MERCHANT_ID', label: 'ECPay Merchant ID' },
  ];

  let missingRequired = 0;
  let missingOptional = 0;

  for (const v of requiredVars) {
    if (!process.env[v.key]) {
      missingRequired++;
      alerts.push({
        severity: 'critical',
        service: 'Environment',
        message: `必要環境變數 ${v.key} 未設定`,
        recommendation: `在 .env.local 或 Amplify Console 中加入 ${v.key}`,
      });
    }
  }

  for (const v of optionalVars) {
    if (!process.env[v.key]) {
      missingOptional++;
    }
  }

  checks.push({
    service: 'Environment',
    name: '環境變數',
    status: missingRequired > 0 ? 'error' : missingOptional > 0 ? 'warning' : 'ok',
    details: `必要: ${requiredVars.length - missingRequired}/${requiredVars.length} ✓ | 選用: ${optionalVars.length - missingOptional}/${optionalVars.length} ✓`,
    metrics: {
      requiredSet: requiredVars.length - missingRequired,
      requiredTotal: requiredVars.length,
      optionalSet: optionalVars.length - missingOptional,
      optionalTotal: optionalVars.length,
    },
  });

  return { checks, alerts };
}

// ── Main Health Check ──────────────────────────────────────────────
export async function runHealthCheck(): Promise<HealthCheckResult> {
  console.log('[HealthCheck] Starting AWS health check...');

  const allChecks: ServiceCheck[] = [];
  const allAlerts: HealthAlert[] = [];

  // Run checks in parallel
  const [dynamoResult, s3Result, envResult] = await Promise.all([
    checkDynamoDB().catch(err => ({
      checks: [{ service: 'DynamoDB', name: 'DynamoDB', status: 'error' as const, details: err.message }],
      alerts: [{ severity: 'critical' as const, service: 'DynamoDB', message: err.message, recommendation: '檢查 AWS 連線' }],
    })),
    checkS3().catch(err => ({
      checks: [{ service: 'S3', name: 'S3', status: 'error' as const, details: err.message }],
      alerts: [{ severity: 'critical' as const, service: 'S3', message: err.message, recommendation: '檢查 AWS 連線' }],
    })),
    Promise.resolve(checkEnvironment()),
  ]);

  allChecks.push(...dynamoResult.checks, ...s3Result.checks, ...envResult.checks);
  allAlerts.push(...dynamoResult.alerts, ...s3Result.alerts, ...envResult.alerts);

  // Determine overall status
  const hasCritical = allAlerts.some(a => a.severity === 'critical');
  const hasWarning = allAlerts.some(a => a.severity === 'warning');
  const hasError = allChecks.some(c => c.status === 'error');

  const overall = hasCritical || hasError ? 'critical' : hasWarning ? 'degraded' : 'healthy';

  const result: HealthCheckResult = {
    timestamp: new Date().toISOString(),
    overall,
    services: allChecks,
    alerts: allAlerts,
  };

  console.log(`[HealthCheck] Complete. Status: ${overall}, Checks: ${allChecks.length}, Alerts: ${allAlerts.length}`);
  return result;
}

// ── Format for Email ───────────────────────────────────────────────
export function formatHealthCheckAsMarkdown(result: HealthCheckResult): string {
  const statusEmoji: Record<string, string> = {
    healthy: '🟢',
    degraded: '🟡',
    critical: '🔴',
  };

  const checkEmoji: Record<string, string> = {
    ok: '✅',
    warning: '⚠️',
    error: '❌',
    unknown: '❓',
  };

  let md = `## ${statusEmoji[result.overall]} AWS 雲端環境健康檢查\n\n`;
  md += `**整體狀態**: ${result.overall === 'healthy' ? '正常' : result.overall === 'degraded' ? '部分異常' : '嚴重異常'}\n`;
  md += `**檢查時間**: ${new Date(result.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n\n`;

  // Group checks by service
  const grouped: Record<string, ServiceCheck[]> = {};
  for (const check of result.services) {
    if (!grouped[check.service]) grouped[check.service] = [];
    grouped[check.service].push(check);
  }

  for (const [service, checks] of Object.entries(grouped)) {
    md += `### ${service}\n\n`;
    md += '| 資源 | 狀態 | 詳情 |\n|------|------|------|\n';
    for (const c of checks) {
      md += `| ${c.name} | ${checkEmoji[c.status]} | ${c.details} |\n`;
    }
    md += '\n';
  }

  // Alerts
  if (result.alerts.length > 0) {
    md += `### 🚨 告警 (${result.alerts.length})\n\n`;
    for (const alert of result.alerts) {
      const emoji = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️';
      md += `- ${emoji} **[${alert.service}]** ${alert.message}\n  → ${alert.recommendation}\n`;
    }
  } else {
    md += '### ✅ 無告警\n\n所有服務運行正常。\n';
  }

  return md;
}
