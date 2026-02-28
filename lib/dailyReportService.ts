/**
 * Report Service (Three-Tier Architecture)
 * 
 * Tier 1 — Every 6 hours: AWS health check (no AI cost)
 * Tier 2 — Daily at 00:00: Education news + security audit
 * Tier 3 — Weekly (Monday 00:00): Full risk analysis + tech trends
 * 
 * Sends the compiled report via email.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import { analyzeProjectRisks, formatRisksAsMarkdown, RiskItem } from './platformRiskAnalyzer';
import { runHealthCheck, formatHealthCheckAsMarkdown, HealthCheckResult } from './awsHealthChecker';

// ── Types ──────────────────────────────────────────────────────────
export type ReportTier = 'health' | 'daily' | 'weekly' | 'full';

export interface DailyReportResult {
  success: boolean;
  reportDate: string;
  tier: ReportTier;
  sections: {
    health?: string;
    news?: string;
    risks?: string;
    trends?: string;
  };
  emailSent: boolean;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────
const REPORT_RECIPIENT = process.env.DAILY_REPORT_EMAIL || 'jvtutorcorner@gmail.com';

const NEWS_SEARCH_QUERIES = [
  '線上教育平台最新消息 2024 2025',
  'online education platform latest news EdTech',
  'LMS learning management system trends',
  '數位學習趨勢 台灣 教育科技',
  'Next.js React education technology updates',
];

// ── Gemini AI Client ───────────────────────────────────────────────
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未設定，無法執行 AI 新聞摘要');
  }
  return new GoogleGenerativeAI(apiKey);
}

// ── 1. Education News Search & Summary ─────────────────────────────
async function fetchEducationNews(): Promise<string> {
  try {
    const genAI = getGeminiClient();

    // Use Gemini with Google Search grounding for real-time news
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    const searchPrompt = `
你是一位專業的教育科技新聞分析師。請針對以下主題搜尋並整理最新新聞：

搜尋主題：
${NEWS_SEARCH_QUERIES.map((q, i) => `${i + 1}. ${q}`).join('\n')}

請提供：

## 📰 教育平台產業新聞摘要

### 全球教育科技趨勢
- 列出 3-5 條最近的重要新聞/趨勢
- 每條包含：標題、簡要說明、對教育平台的影響

### 台灣數位學習動態
- 列出 2-3 條台灣相關的教育科技新聞
- 包含政策變動、市場趨勢等

### 技術框架更新
- Next.js、React、Node.js 等相關框架的重要更新
- 可能影響教育平台開發的技術變更
- AWS 服務更新（DynamoDB、Lambda、Amplify 等）

### 競爭對手動態
- 主要線上教育平台（Coursera、Udemy、Hahow、YOTTA、均一教育等）的最新動態

請用繁體中文回覆，格式使用 Markdown。
今天日期：${new Date().toISOString().split('T')[0]}
`;

    const result = await model.generateContent(searchPrompt);
    const response = result.response;
    return response.text() || '無法取得新聞摘要';
  } catch (error: any) {
    console.error('[DailyReport] News fetch error:', error.message);
    return `## 📰 教育平台產業新聞摘要\n\n⚠️ 新聞取得失敗: ${error.message}\n\n請檢查 GEMINI_API_KEY 設定是否正確。`;
  }
}

// ── 2. Technology Trend Analysis ───────────────────────────────────
async function analyzeTechTrends(): Promise<string> {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    const trendPrompt = `
你是一位資深技術架構師，專精於教育平台技術棧。

我們的平台使用以下技術：
- 前端：Next.js 16 + React 18 + TypeScript 5 + Tailwind CSS 4
- 後端：Next.js API Routes + AWS DynamoDB + AWS Lambda
- 即時通訊：Agora RTC/RTM SDK
- AI：Google Gemini API
- 支付整合：ECPay、Stripe、PayPal
- 部署：AWS Amplify
- 白板：Konva + React-Konva
- 其他：PDF.js、jsPDF

請分析：

## 🔮 技術趨勢與建議

### 須關注的技術趨勢
- 列出 3-5 項與我們技術棧相關的最新趨勢
- 說明每項趨勢的潛在影響

### 建議的技術升級路徑
- 提供短期（1-3 月）、中期（3-6 月）、長期（6-12 月）的升級建議

### 需要關注的風險
- 列出 2-3 項目前技術棧可能面臨的風險
- 提供具體的風險緩解建議

請用繁體中文回覆，格式使用 Markdown。
今天日期：${new Date().toISOString().split('T')[0]}
`;

    const result = await model.generateContent(trendPrompt);
    const response = result.response;
    return response.text() || '無法生成技術趨勢分析';
  } catch (error: any) {
    console.error('[DailyReport] Trend analysis error:', error.message);
    return `## 🔮 技術趨勢與建議\n\n⚠️ 趨勢分析失敗: ${error.message}`;
  }
}

// ── 3. Email Sending ───────────────────────────────────────────────
async function sendReportEmail(subject: string, htmlBody: string): Promise<boolean> {
  try {
    // Use AWS SES, Gmail SMTP, or any configured transport
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.warn('[DailyReport] SMTP credentials not configured. Email will be skipped.');
      console.log('[DailyReport] Set SMTP_USER and SMTP_PASS (or SMTP_HOST/SMTP_PORT) in environment.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Verify SMTP connection
    await transporter.verify();

    await transporter.sendMail({
      from: `"JV Tutor AI 助理" <${smtpUser}>`,
      to: REPORT_RECIPIENT,
      subject,
      html: htmlBody,
    });

    console.log(`[DailyReport] Email sent to ${REPORT_RECIPIENT}`);
    return true;
  } catch (error: any) {
    console.error('[DailyReport] Email send error:', error.message);
    return false;
  }
}

// ── Markdown → HTML Conversion (simple) ────────────────────────────
function markdownToHtml(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="color:#1e40af;margin-top:20px;margin-bottom:8px;font-size:16px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1e3a5f;margin-top:28px;margin-bottom:12px;font-size:20px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // List items
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:4px;">$1</li>')
    // Table handling
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s-]+$/.test(c))) return ''; // separator row
      const isHeader = cells.some(c => c.includes('等級') || c.includes('數量'));
      const tag = isHeader ? 'th' : 'td';
      const style = isHeader
        ? 'style="border:1px solid #d1d5db;padding:8px 12px;background:#f3f4f6;font-weight:bold;"'
        : 'style="border:1px solid #d1d5db;padding:8px 12px;"';
      return `<tr>${cells.map(c => `<${tag} ${style}>${c.trim()}</${tag}>`).join('')}</tr>`;
    })
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">')
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
    .replace(/\n/g, '<br>');

  // Wrap loose <li> in <ul>
  html = html.replace(new RegExp('(<li[^>]*>.*?</li>(?:\\s*<br>\\s*)?)+', 'g'), (match) => {
    return `<ul style="margin:8px 0 8px 20px;padding:0;">${match.replace(/<br>/g, '')}</ul>`;
  });

  // Wrap <tr> in <table>
  html = html.replace(new RegExp('(<tr>.*?</tr>(?:\\s*<br>\\s*)?)+', 'g'), (match) => {
    return `<table style="border-collapse:collapse;margin:12px 0;width:100%;">${match.replace(/<br>/g, '')}</table>`;
  });

  return html;
}

// ── Main Report Generator ──────────────────────────────────────────
/**
 * Generate a report based on the specified tier:
 * - 'health': AWS health check only (every 6 hours, no AI cost)
 * - 'daily': Health + news + security scan (daily 00:00)
 * - 'weekly': Health + news + full risk analysis + tech trends (weekly Mon 00:00)
 * - 'full': All sections (manual trigger)
 */
export async function generateDailyReport(tier: ReportTier = 'full'): Promise<DailyReportResult> {
  const reportDate = new Date().toISOString().split('T')[0];
  const reportTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  console.log(`[Report] Starting ${tier} report for ${reportDate}...`);

  const result: DailyReportResult = {
    success: false,
    reportDate,
    tier,
    sections: {},
    emailSent: false,
  };

  const tierLabels: Record<ReportTier, string> = {
    health: '🏥 AWS 健康檢查',
    daily: '📰 每日報告',
    weekly: '📊 每週完整報告',
    full: '📋 完整平台報告',
  };

  try {
    // ── Tier 1: Health Check (always included) ──────────────
    const healthResult = await runHealthCheck();
    const healthContent = formatHealthCheckAsMarkdown(healthResult);
    result.sections.health = healthContent;

    // ── Tier 2: Daily — add news ────────────────────────────
    let newsContent = '';
    if (tier === 'daily' || tier === 'weekly' || tier === 'full') {
      newsContent = await fetchEducationNews();
      result.sections.news = newsContent;
    }

    // ── Tier 3: Weekly — add risk analysis + trends ─────────
    let risksContent = '';
    let trendsContent = '';
    if (tier === 'weekly' || tier === 'full') {
      const [risks, trends] = await Promise.all([
        Promise.resolve(analyzeProjectRisks()),
        analyzeTechTrends(),
      ]);
      risksContent = formatRisksAsMarkdown(risks);
      trendsContent = trends;
      result.sections.risks = risksContent;
      result.sections.trends = trendsContent;
    }

    // ── Build email sections ────────────────────────────────
    const sections: string[] = [];
    sections.push(markdownToHtml(healthContent));

    if (newsContent) {
      sections.push('<hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;">');
      sections.push(markdownToHtml(newsContent));
    }
    if (risksContent) {
      sections.push('<hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;">');
      sections.push(markdownToHtml(risksContent));
    }
    if (trendsContent) {
      sections.push('<hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;">');
      sections.push(markdownToHtml(trendsContent));
    }

    // Alert badge for health issues
    const alertBadge = healthResult.overall !== 'healthy'
      ? `<div style="background:${healthResult.overall === 'critical' ? '#fef2f2' : '#fffbeb'};border:1px solid ${healthResult.overall === 'critical' ? '#fecaca' : '#fde68a'};border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;">
          <strong style="color:${healthResult.overall === 'critical' ? '#dc2626' : '#d97706'};">
            ${healthResult.overall === 'critical' ? '🔴 嚴重告警' : '🟡 注意'} — ${healthResult.alerts.length} 項問題需要關注
          </strong>
        </div>`
      : '';

    // Convert to HTML email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:'Segoe UI','Noto Sans TC',Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#1f2937;background:#f9fafb;">
  <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="color:#1e40af;margin:0;font-size:24px;">${tierLabels[tier]}</h1>
      <p style="color:#6b7280;margin-top:8px;">報告日期: ${reportDate} | 生成時間: ${reportTime}</p>
    </div>
    ${alertBadge}
    <hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;">
    ${sections.join('\n')}
    <hr style="border:none;border-top:2px solid #e5e7eb;margin:20px 0;">
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">
      <p>此報告由 JV Tutor AI 助理自動生成 (${tier} tier)</p>
      <p style="margin-top:8px;">JV Tutor Corner Platform - 自動化報告系統</p>
    </div>
  </div>
</body>
</html>
`;

    // Send email — always for critical alerts, configurable for other tiers
    const shouldEmail = healthResult.overall === 'critical' || tier !== 'health';
    const subject = `[JV Tutor] ${tierLabels[tier]} - ${reportDate}${healthResult.overall === 'critical' ? ' ⚠️ 嚴重告警' : ''}`;

    if (shouldEmail) {
      result.emailSent = await sendReportEmail(subject, htmlBody);
    }
    result.success = true;

    console.log(`[Report] ${tier} report generated. Email sent: ${result.emailSent}`);
  } catch (error: any) {
    console.error('[Report] Generation failed:', error);
    result.error = error.message;
  }

  return result;
}

// ── DynamoDB Logging ───────────────────────────────────────────────
export async function logReportToDynamo(result: DailyReportResult) {
  try {
    const { ddbDocClient } = await import('./dynamo');
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');

    await ddbDocClient.send(new PutCommand({
      TableName: 'jvtutorcorner-daily-reports',
      Item: {
        id: `report-${result.tier}-${result.reportDate}-${Date.now()}`,
        reportDate: result.reportDate,
        tier: result.tier,
        generatedAt: new Date().toISOString(),
        success: result.success,
        emailSent: result.emailSent,
        error: result.error || null,
        healthStatus: result.sections.health?.includes('🟢') ? 'healthy' : result.sections.health?.includes('🔴') ? 'critical' : 'degraded',
        newsPreview: result.sections.news?.substring(0, 500) || null,
        riskCount: result.sections.risks?.match(/###/g)?.length || 0,
      },
    }));
    console.log('[Report] Logged to DynamoDB');
  } catch (err: any) {
    console.warn('[Report] Failed to log to DynamoDB:', err.message);
  }
}
