#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 BER Project Comprehensive Testing Suite');
console.log('==========================================\n');

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${colors.blue}${description}...${colors.reset}`);
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    log(`✅ ${description} completed successfully`, 'green');
    return { success: true, output };
  } catch (error) {
    log(`❌ ${description} failed`, 'red');
    log(error.stdout || error.message, 'red');
    return { success: false, error: error.stdout || error.message };
  }
}

function displayTestResults(results) {
  log('\n📊 Test Results Summary', 'bold');
  log('=====================');
  
  results.forEach(result => {
    if (result.success) {
      log(`✅ ${result.name}: PASSED`, 'green');
    } else {
      log(`❌ ${result.name}: FAILED`, 'red');
      log(`   Error: ${result.error}`, 'red');
    }
  });
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);
  
  log(`\n📈 Overall Results: ${passed}/${total} tests passed (${percentage}%)`, 'bold');
  
  if (passed === total) {
    log('🎉 All tests passed! The BER application is working correctly.', 'green');
  } else {
    log('⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  const results = [];
  
  // Check if dependencies are installed
  if (!fs.existsSync('node_modules')) {
    log('📦 Installing dependencies...', 'yellow');
    runCommand('npm install', 'Dependency installation');
  }
  
  // Run unit tests
  const unitTests = runCommand('npm run test:unit', 'Unit Tests');
  results.push({ name: 'Unit Tests', ...unitTests });
  
  // Run integration tests
  const integrationTests = runCommand('npm run test:integration', 'Integration Tests');
  results.push({ name: 'Integration Tests', ...integrationTests });
  
  // Run all tests with coverage
  const coverageTests = runCommand('npm run test:coverage', 'Test Coverage');
  results.push({ name: 'Test Coverage', ...coverageTests });
  
  // Display results
  displayTestResults(results);
}

// Run the test suite
main().catch(error => {
  log(`❌ Test runner failed: ${error.message}`, 'red');
  process.exit(1);
}); 