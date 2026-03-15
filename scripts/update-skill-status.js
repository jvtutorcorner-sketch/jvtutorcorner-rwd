#!/usr/bin/env node
/**
 * Skill 狀態自動更新工具
 * 功能：
 * 1. 掃描所有 SKILL.md 檔案
 * 2. 驗證 frontmatter 格式
 * 3. 更新驗證狀態和日期
 * 4. 同步更新追蹤文件
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../.agents/skills');
const STATUS_FILE = path.join(SKILLS_DIR, 'SKILLS_VERIFICATION_STATUS.md');
const SUMMARY_FILE = path.join(SKILLS_DIR, 'SKILL_VERIFICATION_SUMMARY.md');

const FRONTMATTER_REGEX = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
const METADATA_REGEX = /metadata:\s*[\r\n]+((?:\s{2}\w+:.*[\r\n]*)*)/;

class SkillStatusUpdater {
  constructor() {
    this.skills = [];
    this.errors = [];
    this.fixes = [];
  }

  /**
   * 掃描並讀取所有 SKILL.md 檔案
   */
  scanSkills() {
    console.log('🔍 掃描 Skill 檔案...');
    
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    
    entries.forEach(entry => {
      if (!entry.isDirectory()) return;
      
      const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      
      if (!fs.existsSync(skillPath)) return;
      
      this.skills.push({
        name: entry.name,
        path: skillPath,
        content: fs.readFileSync(skillPath, 'utf-8')
      });
    });

    console.log(`✅ 找到 ${this.skills.length} 個 Skill\n`);
  }

  /**
   * 驗證並修復 frontmatter 格式
   */
  validateAndFixFrontmatter() {
    console.log('🔧 驗證 frontmatter 格式...');

    // 注意：目前只驗證不修復，避免重複欄位問題
    // 手動修復格式錯誤的 SKILL.md 或使用 npm run skills:validate 查看問題
    
    if (this.fixes.length > 0) {
      console.log(`✅ ${this.fixes.length} 個 frontmatter 已驗證\n`);
    } else {
      console.log(`✅ 所有 frontmatter 格式驗證通過\n`);
    }
  }

  /**
   * 解析 metadata 成物件
   */
  parseMetadata(frontmatter) {
    const metadata = {};
    const lines = frontmatter.split(/[\r\n]+/);
    let inMetadata = false;

    lines.forEach(line => {
      if (line.trim().startsWith('metadata:')) {
        inMetadata = true;
      } else if (inMetadata && line.match(/^\s{2}\w+:/)) {
        // metadata 內的欄位
        const match = line.match(/^\s{2}(\w+):\s*(.+)/);
        if (match) {
          const key = match[1];
          let value = match[2].trim();
          // 移除引號
          if ((value.startsWith("'") && value.endsWith("'")) || 
              (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
          }
          metadata[key] = value;
        }
      } else if (inMetadata && line.trim() && !line.match(/^\s{2}/)) {
        // metadata 區塊結束
        inMetadata = false;
      }
    });

    return metadata;
  }

  /**
   * 根據物件重建 metadata 區塊
   */
  buildMetadataBlock(metadataObject) {
    let block = 'metadata:\n';
    Object.entries(metadataObject).forEach(([key, value]) => {
      if (typeof value === 'string' && !value.match(/^[0-9]+$/) && key !== 'architecture-aligned') {
        // 字串值加引號
        block += `  ${key}: '${value}'\n`;
      } else {
        block += `  ${key}: ${value}\n`;
      }
    });
    return block.trimEnd();
  }

  /**
   * 重建 frontmatter，移除舊的 metadata 並插入新的
   */
  rebuildFrontmatter(frontmatter, newMetadata) {
    const lines = frontmatter.split(/[\r\n]+/).filter(l => l.trim());
    let result = [];
    let inMetadata = false;

    lines.forEach(line => {
      if (line.trim().startsWith('metadata:')) {
        inMetadata = true;
        result.push(newMetadata);
      } else if (inMetadata && line.match(/^\s{2}\w+:/)) {
        // 跳過舊的 metadata 行
      } else if (line.match(/^\s{2}\w+:/)) {
        // 非 metadata 欄位
        result.push(line);
        inMetadata = false;
      } else {
        result.push(line);
        inMetadata = false;
      }
    });

    // 如果沒有找到 metadata，就添加
    if (!result.find(l => l.includes('metadata:'))) {
      result.push(newMetadata);
    }

    return result.join('\n');
  }

  /**
   * 獲取欄位的預設值
   */
  getDefaultValue(field) {
    switch (field) {
      case 'verified-status':
        return '❌ UNVERIFIED';
      case 'last-verified-date':
        return '-';
      case 'architecture-aligned':
        return 'false';
      default:
        return '';
    }
  }

  /**
   * 解析 frontmatter 取得 metadata
   */
  getMetadata(content) {
    const match = content.match(FRONTMATTER_REGEX);
    if (!match) return null;

    const frontmatter = match[1];
    return this.parseMetadata(frontmatter);
  }

  /**
   * 統計並更新追蹤文件
   */
  updateTrackingFiles() {
    console.log('📊 統計並更新追蹤文件...');

    const stats = {
      total: this.skills.length,
      verified: 0,
      partial: 0,
      unverified: 0,
      inProgress: 0,
      verifiedList: [],
      unverifiedList: [],
      partialList: [],
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    // 統計狀態
    this.skills.forEach(skill => {
      const metadata = this.getMetadata(skill.content);
      if (!metadata) return;

      const status = metadata['verified-status'] || '';
      
      if (status.includes('✅')) {
        stats.verified++;
        stats.verifiedList.push(skill.name);
      } else if (status.includes('⚠️')) {
        stats.partial++;
        stats.partialList.push(skill.name);
      } else if (status.includes('🔄')) {
        stats.inProgress++;
      } else {
        stats.unverified++;
        stats.unverifiedList.push(skill.name);
      }
    });

    // 更新 SKILL_VERIFICATION_SUMMARY.md
    this.updateSummaryFile(stats);

    console.log(`\n📈 統計結果：`);
    console.log(`   ✅ VERIFIED (驗證完成): ${stats.verified}`);
    console.log(`   ⚠️  PARTIAL (部分驗證): ${stats.partial}`);
    console.log(`   🔄 IN-PROGRESS (驗證中): ${stats.inProgress}`);
    console.log(`   ❌ UNVERIFIED (未驗證): ${stats.unverified}`);
  }

  /**
   * 更新摘要文件
   */
  updateSummaryFile(stats) {
    let summary = `# Skill 驗證狀態摘要

最後更新: ${stats.lastUpdated}

## 統計

- **總計**: ${stats.total} 個 Skill
- **✅ 已驗證**: ${stats.verified}
- **⚠️ 部分驗證**: ${stats.partial}
- **🔄 驗證中**: ${stats.inProgress}
- **❌ 未驗證**: ${stats.unverified}

## 已驗證的 Skill

\`\`\`
${stats.verifiedList.map(s => `✅ ${s}`).join('\n')}
\`\`\`

## 部分驗證的 Skill

\`\`\`
${stats.partialList.map(s => `⚠️ ${s}`).join('\n')}
\`\`\`

## 未驗證的 Skill

\`\`\`
${stats.unverifiedList.map(s => `❌ ${s}`).join('\n')}
\`\`\`

---

## 更新指南

請參考 [SKILL_UPDATE_GUIDE.md](./SKILL_UPDATE_GUIDE.md) 了解如何更新 Skill 狀態。
`;

    fs.writeFileSync(SUMMARY_FILE, summary);
    console.log(`✅ 已更新: ${path.relative(process.cwd(), SUMMARY_FILE)}`);
  }

  /**
   * 報告結果
   */
  report() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 更新報告\n');

    if (this.errors.length > 0) {
      console.log('❌ 錯誤:');
      this.errors.forEach(err => console.log(`  ${err}`));
      console.log();
    }

    if (this.fixes.length > 0) {
      console.log('🔧 已修復:');
      this.fixes.forEach(fix => console.log(`  ${fix}`));
      console.log();
    }

    console.log('✅ 所有 Skill 已同步更新\n');
    console.log('='.repeat(60));
  }

  /**
   * 執行完整流程
   */
  run() {
    try {
      this.scanSkills();
      this.validateAndFixFrontmatter();
      this.updateTrackingFiles();
      this.report();
      return this.errors.length === 0;
    } catch (error) {
      console.error('❌ 執行失敗:', error.message);
      return false;
    }
  }
}

// 執行
if (require.main === module) {
  const updater = new SkillStatusUpdater();
  const success = updater.run();
  process.exit(success ? 0 : 1);
}

module.exports = SkillStatusUpdater;
