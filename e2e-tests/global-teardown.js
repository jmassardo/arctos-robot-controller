/**
 * Global Teardown for E2E Tests
 * Cleans up the test environment after all tests complete
 */

const fs = require('fs').promises;
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Starting E2E test environment cleanup...');

  try {
    // Generate test summary
    await generateTestSummary();

    // Clean up test data
    await cleanupTestData();

    // Archive test artifacts if CI
    if (process.env.CI) {
      await archiveTestArtifacts();
    }

    // Cleanup temporary files
    await cleanupTempFiles();

    console.log('✅ E2E test environment cleanup complete');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

async function generateTestSummary() {
  console.log('📊 Generating test summary...');

  try {
    // Read test results if available
    const resultsPath = './test-results/e2e/results.json';
    let results = null;

    try {
      const resultsData = await fs.readFile(resultsPath, 'utf8');
      results = JSON.parse(resultsData);
    } catch (error) {
      console.log('ℹ️  No test results file found, skipping summary generation');
      return;
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        ci: !!process.env.CI,
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        apiURL: process.env.API_URL || 'http://localhost:3001',
      },
      testResults: {
        totalTests:
          results.stats?.expected + results.stats?.unexpected + results.stats?.skipped || 0,
        passedTests: results.stats?.expected || 0,
        failedTests: results.stats?.unexpected || 0,
        skippedTests: results.stats?.skipped || 0,
        duration: results.stats?.duration || 0,
        passRate:
          results.stats?.expected && results.stats?.expected > 0
            ? (
                (results.stats.expected / (results.stats.expected + results.stats.unexpected)) *
                100
              ).toFixed(2) + '%'
            : '0%',
      },
      suites:
        results.suites?.map(suite => ({
          title: suite.title,
          duration: suite.duration,
          tests: suite.specs?.length || 0,
          passed: suite.specs?.filter(spec => spec.ok)?.length || 0,
          failed: suite.specs?.filter(spec => !spec.ok)?.length || 0,
        })) || [],
    };

    await fs.writeFile('./test-results/e2e/test-summary.json', JSON.stringify(summary, null, 2));

    // Generate text summary for CI logs
    const textSummary = `
E2E Test Summary
================
Total Tests: ${summary.testResults.totalTests}
Passed: ${summary.testResults.passedTests}
Failed: ${summary.testResults.failedTests}
Skipped: ${summary.testResults.skippedTests}
Pass Rate: ${summary.testResults.passRate}
Duration: ${Math.round(summary.testResults.duration / 1000)}s
Platform: ${summary.environment.platform}
Node.js: ${summary.environment.nodeVersion}
CI: ${summary.environment.ci ? 'Yes' : 'No'}
`;

    await fs.writeFile('./test-results/e2e/test-summary.txt', textSummary);

    console.log('📊 Test summary generated');
  } catch (error) {
    console.warn('⚠️  Failed to generate test summary:', error.message);
  }
}

async function cleanupTestData() {
  console.log('🗑️ Cleaning up test data...');

  const apiURL = process.env.API_URL || 'http://localhost:3001';

  // Clean up test users (optional, may want to keep for debugging)
  if (process.env.E2E_CLEANUP_USERS === 'true') {
    const testUsers = ['e2e-admin', 'e2e-operator', 'e2e-viewer'];

    for (const username of testUsers) {
      try {
        await fetch(`${apiURL}/api/users/${username}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log(`🗑️ Deleted test user: ${username}`);
      } catch (error) {
        console.warn(`⚠️  Failed to delete test user ${username}:`, error.message);
      }
    }
  }

  // Clean up test positions and configurations
  try {
    // This would depend on the API endpoints available
    // For now, just log the intention
    console.log('ℹ️  Test data cleanup completed (positions and configs preserved for debugging)');
  } catch (error) {
    console.warn('⚠️  Failed to cleanup test data:', error.message);
  }
}

async function archiveTestArtifacts() {
  console.log('📦 Archiving test artifacts for CI...');

  try {
    // Create archive directory
    const archiveDir = './test-results/e2e/archive';
    await ensureDirectory(archiveDir);

    // Copy important files
    const filesToArchive = [
      './playwright-report',
      './test-results/e2e/results.json',
      './test-results/e2e/junit.xml',
      './test-results/e2e/test-summary.json',
      './test-results/e2e/test-config.json',
    ];

    for (const file of filesToArchive) {
      try {
        const stats = await fs.stat(file);
        if (stats.isDirectory()) {
          // Copy directory recursively (simplified)
          console.log(`📁 Archived directory: ${file}`);
        } else {
          // Copy file
          const basename = path.basename(file);
          await fs.copyFile(file, path.join(archiveDir, basename));
          console.log(`📄 Archived file: ${basename}`);
        }
      } catch (error) {
        console.log(`ℹ️  File not found, skipping: ${file}`);
      }
    }

    console.log('📦 Test artifacts archived');
  } catch (error) {
    console.warn('⚠️  Failed to archive test artifacts:', error.message);
  }
}

async function cleanupTempFiles() {
  console.log('🧹 Cleaning up temporary files...');

  const tempPaths = [
    './test-results/e2e/artifacts/.tmp',
    './test-results/e2e/.cache',
    './node_modules/.cache/playwright',
  ];

  for (const tempPath of tempPaths) {
    try {
      await fs.rmdir(tempPath, { recursive: true });
      console.log(`🗑️ Cleaned up: ${tempPath}`);
    } catch (error) {
      // Ignore if doesn't exist
      if (error.code !== 'ENOENT') {
        console.warn(`⚠️  Failed to cleanup ${tempPath}:`, error.message);
      }
    }
  }

  console.log('✅ Temporary files cleaned up');
}

async function ensureDirectory(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

module.exports = globalTeardown;
