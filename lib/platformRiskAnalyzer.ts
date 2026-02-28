/**
 * Platform Risk Analyzer
 * 
 * Analyzes the project's dependencies, architecture patterns, and technology stack
 * to identify potential risks such as:
 * - Outdated or deprecated packages
 * - End-of-life frameworks
 * - Security vulnerabilities
 * - Technology migration risks
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface RiskItem {
  category: 'dependency' | 'architecture' | 'security' | 'compatibility' | 'deprecation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Known deprecated / end-of-life packages and their replacements
const DEPRECATED_PACKAGES: Record<string, { reason: string; replacement?: string; severity: RiskItem['severity'] }> = {
  'request': { reason: '已於 2020 年停止維護', replacement: 'axios 或 node-fetch', severity: 'high' },
  'moment': { reason: '已進入維護模式，不再新增功能', replacement: 'date-fns 或 dayjs', severity: 'medium' },
  'tslint': { reason: '已停止維護', replacement: 'eslint + @typescript-eslint', severity: 'high' },
  'node-sass': { reason: '已停止維護', replacement: 'sass (Dart Sass)', severity: 'high' },
  'react-scripts': { reason: 'Create React App 已不推薦使用', replacement: 'Vite 或 Next.js', severity: 'medium' },
  'querystring': { reason: 'Node.js 內建 URLSearchParams 已取代', replacement: 'URLSearchParams', severity: 'low' },
  'uuid': { reason: 'Node.js 19+ / crypto.randomUUID() 已原生支援', severity: 'low' },
  'core-js': { reason: '隨著瀏覽器支援改善，polyfill 需求日減', severity: 'low' },
  '@babel/polyfill': { reason: '已停止維護', replacement: 'core-js/stable + regenerator-runtime', severity: 'medium' },
  'enzyme': { reason: 'React 18+ 不再支援', replacement: '@testing-library/react', severity: 'high' },
  'react-router-dom': { reason: 'Next.js 已內建路由系統', severity: 'low' },
};

// Major version thresholds that might indicate outdated versions
const VERSION_CONCERNS: Record<string, { minRecommended: number; latestMajor: number; note: string }> = {
  'next': { minRecommended: 14, latestMajor: 16, note: 'Next.js 版本更新快速，建議保持最新穩定版' },
  'react': { minRecommended: 18, latestMajor: 19, note: 'React 19 已發布，帶來重要新功能' },
  'react-dom': { minRecommended: 18, latestMajor: 19, note: '需與 React 版本保持一致' },
  'typescript': { minRecommended: 5, latestMajor: 5, note: 'TypeScript 5.x 帶來效能改善' },
  'tailwindcss': { minRecommended: 3, latestMajor: 4, note: 'Tailwind CSS v4 已可用，帶來重大改進' },
};

// Architecture patterns to check
const ARCHITECTURE_RISKS = [
  {
    check: (deps: string[]) => deps.includes('aws-amplify') && !deps.includes('@aws-sdk/client-dynamodb'),
    risk: {
      category: 'architecture' as const,
      severity: 'medium' as const,
      title: 'AWS Amplify 直接依賴',
      description: 'Amplify 客戶端 SDK 版本更新頻繁，API 變動大',
      recommendation: '考慮抽象化 AWS 服務層，降低 Amplify SDK 耦合度',
    }
  },
  {
    check: (deps: string[]) => deps.includes('agora-rtc-sdk-ng'),
    risk: {
      category: 'architecture' as const,
      severity: 'medium' as const,
      title: 'Agora SDK 依賴',
      description: 'Agora SDK 更新頻繁，WebRTC 標準持續演進，未來可能需遷移',
      recommendation: '維持抽象化的視訊通話介面層，以便未來切換至其他 WebRTC 服務（如 LiveKit、Twilio）',
    }
  },
  {
    check: (deps: string[]) => deps.includes('konva') && deps.includes('react-konva'),
    risk: {
      category: 'compatibility' as const,
      severity: 'low' as const,
      title: 'Canvas 白板相容性',
      description: 'Konva canvas 在某些行動裝置上效能有限',
      recommendation: '監控 Excalidraw、tldraw 等現代白板方案的發展',
    }
  },
  {
    check: (deps: string[]) => deps.includes('pdfjs-dist'),
    risk: {
      category: 'compatibility' as const,
      severity: 'low' as const,
      title: 'PDF.js 版本相容性',
      description: 'pdfjs-dist 大版本更新時 API 常有破壞性變更',
      recommendation: '鎖定穩定版本，並建立 PDF 操作的抽象層',
    }
  },
  {
    check: (deps: string[]) => deps.includes('@google/generative-ai'),
    risk: {
      category: 'architecture' as const,
      severity: 'medium' as const,
      title: 'AI 模型 API 依賴',
      description: 'Gemini API 仍在快速迭代中，模型版本可能被淘汰',
      recommendation: '建立統一的 AI 服務抽象層，支援多模型備援切換（OpenAI、Claude 等）',
    }
  },
];

function parseVersion(versionStr: string): number {
  const cleaned = versionStr.replace(/[\^~>=<]/g, '');
  const major = parseInt(cleaned.split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}

export function analyzeProjectRisks(): RiskItem[] {
  const risks: RiskItem[] = [];

  // Read package.json
  const pkgPath = join(process.cwd(), 'package.json');
  if (!existsSync(pkgPath)) {
    risks.push({
      category: 'architecture',
      severity: 'critical',
      title: '找不到 package.json',
      description: '無法分析專案依賴',
      recommendation: '確認專案根目錄包含 package.json',
    });
    return risks;
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    risks.push({
      category: 'architecture',
      severity: 'critical',
      title: 'package.json 解析失敗',
      description: 'package.json 格式不正確',
      recommendation: '檢查 package.json 文件格式',
    });
    return risks;
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depNames = Object.keys(allDeps);

  // 1. Check for deprecated packages
  for (const [name, info] of Object.entries(DEPRECATED_PACKAGES)) {
    if (allDeps[name]) {
      risks.push({
        category: 'deprecation',
        severity: info.severity,
        title: `${name} 已過時或停止維護`,
        description: info.reason,
        recommendation: info.replacement
          ? `建議遷移至 ${info.replacement}`
          : '評估是否需要替代方案',
      });
    }
  }

  // 2. Check version concerns
  for (const [name, concern] of Object.entries(VERSION_CONCERNS)) {
    if (allDeps[name]) {
      const currentMajor = parseVersion(allDeps[name]);
      if (currentMajor > 0 && currentMajor < concern.minRecommended) {
        risks.push({
          category: 'dependency',
          severity: 'high',
          title: `${name} 版本過舊 (v${currentMajor})`,
          description: `目前版本 ${allDeps[name]}，建議至少 v${concern.minRecommended}+。${concern.note}`,
          recommendation: `升級至 ${name}@${concern.latestMajor} 以獲得最新安全修補和功能`,
        });
      } else if (currentMajor > 0 && currentMajor < concern.latestMajor) {
        risks.push({
          category: 'dependency',
          severity: 'low',
          title: `${name} 有新的主要版本 (v${concern.latestMajor})`,
          description: `目前版本 ${allDeps[name]}，最新主要版本為 v${concern.latestMajor}。${concern.note}`,
          recommendation: `評估升級至 v${concern.latestMajor} 的可行性`,
        });
      }
    }
  }

  // 3. Architecture pattern risks
  for (const check of ARCHITECTURE_RISKS) {
    if (check.check(depNames)) {
      risks.push(check.risk);
    }
  }

  // 4. Check total dependency count
  const totalDeps = Object.keys(pkg.dependencies || {}).length;
  if (totalDeps > 30) {
    risks.push({
      category: 'architecture',
      severity: 'medium',
      title: `生產依賴過多 (${totalDeps} 個)`,
      description: '過多的生產依賴增加了供應鏈攻擊風險和打包體積',
      recommendation: '定期審查依賴，移除不必要的套件，考慮使用 bundlephobia 分析打包大小',
    });
  }

  // 5. Security: Check for known problematic patterns
  if (allDeps['protobufjs']) {
    risks.push({
      category: 'security',
      severity: 'medium',
      title: 'protobufjs 安全性關注',
      description: 'protobufjs 歷史上有原型污染漏洞，需保持最新版本',
      recommendation: '定期執行 npm audit 並保持 protobufjs 為最新版本',
    });
  }

  // 6. Next.js specific checks
  if (allDeps['next']) {
    const nextMajor = parseVersion(allDeps['next']);
    if (nextMajor >= 13) {
      // Check if still using pages/ directory (legacy)
      const pagesDir = join(process.cwd(), 'pages');
      if (existsSync(pagesDir)) {
        risks.push({
          category: 'architecture',
          severity: 'medium',
          title: 'Next.js Pages 與 App Router 混用',
          description: '同時使用 pages/ 和 app/ 目錄可能造成路由衝突',
          recommendation: '逐步將 pages/ 路由遷移至 app/ 目錄',
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return risks;
}

export function formatRisksAsMarkdown(risks: RiskItem[]): string {
  if (risks.length === 0) {
    return '## 🎉 平台風險分析\n\n目前未檢測到顯著風險，平台架構狀態良好！\n';
  }

  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };

  const severityLabel: Record<string, string> = {
    critical: '嚴重',
    high: '高',
    medium: '中',
    low: '低',
  };

  const categoryLabel: Record<string, string> = {
    dependency: '依賴套件',
    architecture: '架構設計',
    security: '安全性',
    compatibility: '相容性',
    deprecation: '已過時',
  };

  let md = '## ⚠️ 平台架構風險分析\n\n';
  md += `共檢測到 **${risks.length}** 項潛在風險\n\n`;

  // Summary table
  const critCount = risks.filter(r => r.severity === 'critical').length;
  const highCount = risks.filter(r => r.severity === 'high').length;
  const medCount = risks.filter(r => r.severity === 'medium').length;
  const lowCount = risks.filter(r => r.severity === 'low').length;

  md += '| 等級 | 數量 |\n|------|------|\n';
  if (critCount) md += `| 🔴 嚴重 | ${critCount} |\n`;
  if (highCount) md += `| 🟠 高 | ${highCount} |\n`;
  if (medCount) md += `| 🟡 中 | ${medCount} |\n`;
  if (lowCount) md += `| 🟢 低 | ${lowCount} |\n`;
  md += '\n---\n\n';

  // Detail items
  for (const risk of risks) {
    md += `### ${severityEmoji[risk.severity]} [${severityLabel[risk.severity]}] ${risk.title}\n`;
    md += `- **分類**: ${categoryLabel[risk.category]}\n`;
    md += `- **說明**: ${risk.description}\n`;
    md += `- **建議**: ${risk.recommendation}\n\n`;
  }

  return md;
}
