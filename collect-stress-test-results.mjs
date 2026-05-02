#!/usr/bin/env node

/**
 * Stress Test Results Collector
 * Aggregates and summarizes test results from multiple runs
 */

import fs from 'fs';
import path from 'path';

const resultsDir = path.resolve('./test-results');
const htmlReportPath = path.resolve('./blob-report');

console.log(`\n${'═'.repeat(80)}`);
console.log(`📊 STRESS TEST RESULTS COLLECTOR`);
console.log(`${'═'.repeat(80)}\n`);

// Check if reports exist
if (!fs.existsSync(htmlReportPath)) {
  console.log(`⚠️  Report directory not found at ${htmlReportPath}`);
  console.log(`To view HTML report: npx playwright show-report\n`);
  process.exit(0);
}

// Read JSON report if available
const reportJsonPath = path.resolve(resultsDir, 'report.json');
const reportJsonLegacy = path.resolve(resultsDir, 'junit.xml');

if (fs.existsSync(reportJsonPath)) {
  console.log(`📋 Found test report: ${reportJsonPath}`);
  const report = JSON.parse(fs.readFileSync(reportJsonPath, 'utf-8'));
  
  if (report.tests && Array.isArray(report.tests)) {
    console.log(`\n📈 Test Summary:`);
    console.log(`   Total Tests: ${report.tests.length}`);
    
    const passed = report.tests.filter(t => t.status === 'passed').length;
    const failed = report.tests.filter(t => t.status === 'failed').length;
    const skipped = report.tests.filter(t => t.status === 'skipped').length;
    
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Success Rate: ${((passed / report.tests.length) * 100).toFixed(1)}%\n`);
    
    if (failed > 0) {
      console.log(`\n⚠️  Failed Tests:`);
      report.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`   - ${t.title}`);
        if (t.error) console.log(`     ${t.error.message}`);
      });
    }
  }
}

console.log(`\n📖 To view detailed HTML report:`);
console.log(`   npx playwright show-report\n`);

console.log(`${'═'.repeat(80)}\n`);
