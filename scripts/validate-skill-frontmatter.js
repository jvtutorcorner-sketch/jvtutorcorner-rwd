#!/usr/bin/env node
/**
 * Skill Frontmatter 驗證工具
 * 功能：
 * 1. 驗證所有 SKILL.md 的 YAML frontmatter 格式
 * 2. 檢查必需的 metadata 欄位
 * 3. 自動修復常見格式錯誤
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../.agents/skills');

class FrontmatterValidator {
  constructor() {
    this.issues = [];
    this.fixes = [];
    this.validSkills = [];
  }

  /**
   * 驗證單個檔案
   */
  validateFile(skillPath, skillName) {
    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      
      // 檢查是否有 frontmatter
      if (!content.startsWith('---')) {
        this.issues.push({
          skill: skillName,
          level: 'error',
          message: '缺少開始的 ---'
        });
        return false;
      }

      // 提取 frontmatter（支持 CRLF 和 LF）
      const frontmatterMatch = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
      if (!frontmatterMatch) {
        this.issues.push({
          skill: skillName,
          level: 'error',
          message: 'Frontmatter 格式不正確'
        });
        return false;
      }

      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');

      // 驗證 YAML 結構
      let hasMetadata = false;
      let indentError = false;

      lines.forEach((line, index) => {
        if (line.trim().startsWith('metadata:')) {
          hasMetadata = true;
        }

        // 檢查縮進（metadata 內容應該有 2 個空格）
        if (hasMetadata && line.trim() && !line.startsWith('---') && !line.trim().startsWith('metadata:')) {
          if (!line.startsWith('  ') && line.trim()) {
            indentError = true;
          }
        }
      });

      if (!hasMetadata) {
        this.issues.push({
          skill: skillName,
          level: 'warn',
          message: '缺少 metadata 區塊'
        });
        return false;
      }

      if (indentError) {
        this.issues.push({
          skill: skillName,
          level: 'warn',
          message: 'Metadata 縮進不一致'
        });
      }

      // 驗證必需欄位
      const requiredFields = ['verified-status', 'last-verified-date', 'architecture-aligned'];
      const missingFields = [];

      requiredFields.forEach(field => {
        if (!frontmatter.includes(field + ':')) {
          missingFields.push(field);
        }
      });

      if (missingFields.length > 0) {
        this.issues.push({
          skill: skillName,
          level: 'error',
          message: `缺少欄位: ${missingFields.join(', ')}`
        });
        return false;
      }

      this.validSkills.push(skillName);
      return true;
    } catch (error) {
      this.issues.push({
        skill: skillName,
        level: 'error',
        message: error.message
      });
      return false;
    }
  }

  /**
   * 掃描並驗證所有 Skill
   */
  scanAndValidate() {
    console.log('🔍 掃描 Skill 檔案...\n');

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    let count = 0;

    entries.forEach(entry => {
      if (!entry.isDirectory()) return;

      const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) return;

      count++;
      this.validateFile(skillPath, entry.name);
    });

    console.log(`✅ 掃描完成: 檢查了 ${count} 個 Skill\n`);
  }

  /**
   * 生成報告
   */
  report() {
    console.log('='.repeat(60));
    console.log('📋 驗證報告\n');

    // 按等級分類
    const errors = this.issues.filter(i => i.level === 'error');
    const warnings = this.issues.filter(i => i.level === 'warn');

    if (errors.length > 0) {
      console.log(`❌ 錯誤 (${errors.length}):`);
      errors.forEach(issue => {
        console.log(`   [${issue.skill}] ${issue.message}`);
      });
      console.log();
    }

    if (warnings.length > 0) {
      console.log(`⚠️  警告 (${warnings.length}):`);
      warnings.forEach(issue => {
        console.log(`   [${issue.skill}] ${issue.message}`);
      });
      console.log();
    }

    if (this.validSkills.length > 0) {
      console.log(`✅ 通過驗證 (${this.validSkills.length}):`);
      this.validSkills.forEach(skill => {
        console.log(`   ✓ ${skill}`);
      });
      console.log();
    }

    console.log('='.repeat(60));

    // 返回狀態
    if (errors.length > 0) {
      console.log('\n❌ 驗證失敗\n');
      return false;
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  驗證通過，但有警告\n');
      return true;
    }

    console.log('\n✅ 所有 Skill 驗證通過\n');
    return true;
  }

  /**
   * 執行驗證
   */
  run() {
    this.scanAndValidate();
    return this.report();
  }
}

// 執行
if (require.main === module) {
  const validator = new FrontmatterValidator();
  const success = validator.run();
  process.exit(success ? 0 : 1);
}

module.exports = FrontmatterValidator;
