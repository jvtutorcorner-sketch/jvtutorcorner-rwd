/**
 * Playwright 自訂 Reporter
 * 在測試完成後自動更新 Skill 狀態
 */

const SkillStatusUpdater = require('./update-skill-status.js');

class SkillStatusReporter {
  onEnd(result) {
    // 只在所有測試完成後執行
    console.log('\n' + '='.repeat(60));
    console.log('🎯 所有測試已完成');
    console.log('='.repeat(60) + '\n');

    // 檢查測試結果
    if (result.status === 'passed') {
      console.log('✅ 所有測試通過！開始更新 Skill 狀態...\n');
      
      try {
        const updater = new SkillStatusUpdater();
        updater.run();
      } catch (error) {
        console.error('❌ 更新 Skill 狀態失敗:', error.message);
      }
    } else if (result.status === 'failed') {
      console.log('❌ 有測試失敗，跳過 Skill 狀態更新\n');
    } else {
      console.log('⚠️  測試状態不確定\n');
    }
  }
}

module.exports = SkillStatusReporter;
