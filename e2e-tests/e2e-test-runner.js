#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Runner for Arctos Robot Controller
 *
 * This script orchestrates the execution of all E2E test suites with proper
 * environment setup, parallel execution, reporting, and cleanup.
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Test configuration
const CONFIG = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  apiURL: process.env.API_URL || 'http://localhost:3001',
  testDir: './e2e-tests',
  reportDir: './playwright-report',
  resultsDir: './test-results/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : Math.max(1, os.cpus().length - 1),

  // Test suites configuration
  testSuites: [
    {
      name: 'Authentication Workflows',
      file: 'auth-workflows.spec.ts',
      priority: 1, // Run first
      timeout: 60000,
      retries: 3,
    },
    {
      name: 'Core Robot Control',
      file: 'robot-control-workflows.spec.ts',
      priority: 2,
      timeout: 120000,
      dependencies: ['auth-workflows.spec.ts'],
    },
    {
      name: 'Real-time Multi-user',
      file: 'realtime-multiuser-workflows.spec.ts',
      priority: 3,
      timeout: 180000,
      dependencies: ['auth-workflows.spec.ts', 'robot-control-workflows.spec.ts'],
    },
    {
      name: 'Cross-platform Mobile',
      file: 'cross-platform-mobile-workflows.spec.ts',
      priority: 4,
      timeout: 240000,
      parallel: true,
    },
    {
      name: 'Error Recovery & Edge Cases',
      file: 'error-recovery-edge-cases.spec.ts',
      priority: 5,
      timeout: 300000,
      parallel: true,
    },
    {
      name: 'Security & Authorization',
      file: 'security-authorization.spec.ts',
      priority: 6,
      timeout: 180000,
      parallel: false, // Security tests should run in isolation
    },
  ],
};

class E2ETestRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      suites: [],
      startTime: null,
      endTime: null,
      duration: 0,
    };

    this.processes = new Map();
    this.isShuttingDown = false;
  }

  async run() {
    console.log('🚀 Starting Comprehensive E2E Test Suite for Arctos Robot Controller');
    console.log('='.repeat(80));

    this.results.startTime = new Date();

    try {
      // Pre-flight checks
      await this.preFlightChecks();

      // Setup test environment
      await this.setupEnvironment();

      // Start application servers
      await this.startServers();

      // Wait for servers to be ready
      await this.waitForServers();

      // Run test suites
      await this.runTestSuites();

      // Generate reports
      await this.generateReports();
    } catch (error) {
      console.error('❌ E2E Test Runner failed:', error.message);
      this.results.failed += 1;
    } finally {
      // Cleanup
      await this.cleanup();

      // Print final results
      this.printFinalResults();

      // Exit with appropriate code
      process.exit(this.results.failed > 0 ? 1 : 0);
    }
  }

  async preFlightChecks() {
    console.log('🔍 Running pre-flight checks...');

    // Check Node.js version
    const nodeVersion = process.version;
    if (
      !nodeVersion.startsWith('v16') &&
      !nodeVersion.startsWith('v18') &&
      !nodeVersion.startsWith('v20')
    ) {
      console.warn('⚠️  Recommended Node.js version is 16+, current:', nodeVersion);
    }

    // Check if required directories exist
    await this.ensureDirectoryExists(CONFIG.resultsDir);
    await this.ensureDirectoryExists(CONFIG.reportDir);

    // Check if test files exist
    for (const suite of CONFIG.testSuites) {
      const testFile = path.join(CONFIG.testDir, suite.file);
      try {
        await fs.access(testFile);
      } catch (error) {
        throw new Error(`Test file not found: ${testFile}`);
      }
    }

    // Check if Playwright browsers are installed
    try {
      await this.executeCommand('npx playwright --version');
    } catch (error) {
      throw new Error('Playwright is not installed. Run: npx playwright install');
    }

    console.log('✅ Pre-flight checks completed');
  }

  async setupEnvironment() {
    console.log('⚙️  Setting up test environment...');

    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.E2E_TESTING = 'true';
    process.env.BASE_URL = CONFIG.baseURL;
    process.env.API_URL = CONFIG.apiURL;

    // Create test configuration file
    const testConfig = {
      baseURL: CONFIG.baseURL,
      apiURL: CONFIG.apiURL,
      timeout: CONFIG.timeout,
      retries: CONFIG.retries,
      workers: CONFIG.workers,
      testUsers: {
        admin: {
          username: 'e2e-admin',
          password: 'AdminPass123!',
          email: 'admin@e2e-test.com',
        },
        operator: {
          username: 'e2e-operator',
          password: 'OperatorPass123!',
          email: 'operator@e2e-test.com',
        },
        viewer: {
          username: 'e2e-viewer',
          password: 'ViewerPass123!',
          email: 'viewer@e2e-test.com',
        },
      },
    };

    await fs.writeFile(
      path.join(CONFIG.resultsDir, 'e2e-config.json'),
      JSON.stringify(testConfig, null, 2)
    );

    console.log('✅ Test environment configured');
  }

  async startServers() {
    console.log('🌐 Starting application servers...');

    // Start backend server
    const backendProcess = spawn('npm', ['start'], {
      stdio: 'pipe',
      env: { ...process.env, PORT: '3001' },
    });

    this.processes.set('backend', backendProcess);

    // Start frontend server
    const frontendProcess = spawn('npm', ['start'], {
      stdio: 'pipe',
      cwd: './client',
      env: { ...process.env, PORT: '3000' },
    });

    this.processes.set('frontend', frontendProcess);

    // Handle server output
    backendProcess.stdout.on('data', data => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', data => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    frontendProcess.stdout.on('data', data => {
      console.log(`[Frontend] ${data.toString().trim()}`);
    });

    frontendProcess.stderr.on('data', data => {
      console.error(`[Frontend Error] ${data.toString().trim()}`);
    });

    console.log('✅ Application servers started');
  }

  async waitForServers() {
    console.log('⏳ Waiting for servers to be ready...');

    const maxAttempts = 30;
    const delay = 2000;

    // Wait for backend
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${CONFIG.apiURL}/health`);
        if (response.ok) {
          console.log('✅ Backend server is ready');
          break;
        }
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error('Backend server failed to start');
        }
        await this.sleep(delay);
      }
    }

    // Wait for frontend
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(CONFIG.baseURL);
        if (response.ok) {
          console.log('✅ Frontend server is ready');
          break;
        }
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error('Frontend server failed to start');
        }
        await this.sleep(delay);
      }
    }

    // Additional startup delay
    await this.sleep(5000);
  }

  async runTestSuites() {
    console.log('🧪 Running E2E test suites...');

    // Sort suites by priority
    const sortedSuites = [...CONFIG.testSuites].sort((a, b) => a.priority - b.priority);

    // Group suites by parallel execution capability
    const parallelSuites = sortedSuites.filter(suite => suite.parallel);
    const sequentialSuites = sortedSuites.filter(suite => !suite.parallel);

    // Run sequential suites first
    for (const suite of sequentialSuites) {
      await this.runTestSuite(suite);
    }

    // Run parallel suites
    if (parallelSuites.length > 0) {
      const parallelPromises = parallelSuites.map(suite => this.runTestSuite(suite));
      await Promise.allSettled(parallelPromises);
    }
  }

  async runTestSuite(suite) {
    console.log(`\n📋 Running ${suite.name}...`);
    console.log('-'.repeat(50));

    const startTime = Date.now();

    try {
      // Build Playwright command
      const args = [
        'playwright',
        'test',
        path.join(CONFIG.testDir, suite.file),
        '--reporter=json',
        `--output-dir=${CONFIG.resultsDir}/${suite.name.toLowerCase().replace(/\s+/g, '-')}`,
        `--timeout=${suite.timeout || CONFIG.timeout}`,
        `--retries=${suite.retries || CONFIG.retries}`,
      ];

      // Add browser configuration
      args.push('--project=chromium', '--project=firefox', '--project=webkit');

      // Execute test suite
      const result = await this.executeCommand(`npx ${args.join(' ')}`);

      // Parse results
      const resultData = JSON.parse(result.stdout);

      const suiteResult = {
        name: suite.name,
        file: suite.file,
        duration: Date.now() - startTime,
        passed: resultData.stats.expected,
        failed: resultData.stats.unexpected,
        skipped: resultData.stats.skipped,
        total: resultData.stats.expected + resultData.stats.unexpected + resultData.stats.skipped,
        tests: resultData.tests,
      };

      this.results.suites.push(suiteResult);
      this.results.total += suiteResult.total;
      this.results.passed += suiteResult.passed;
      this.results.failed += suiteResult.failed;
      this.results.skipped += suiteResult.skipped;

      if (suiteResult.failed === 0) {
        console.log(
          `✅ ${suite.name} - All tests passed (${suiteResult.passed}/${suiteResult.total})`
        );
      } else {
        console.log(
          `❌ ${suite.name} - ${suiteResult.failed} tests failed (${suiteResult.passed}/${suiteResult.total})`
        );
      }
    } catch (error) {
      console.error(`❌ ${suite.name} failed:`, error.message);

      const failedSuite = {
        name: suite.name,
        file: suite.file,
        duration: Date.now() - startTime,
        passed: 0,
        failed: 1,
        skipped: 0,
        total: 1,
        error: error.message,
      };

      this.results.suites.push(failedSuite);
      this.results.failed += 1;
      this.results.total += 1;
    }
  }

  async generateReports() {
    console.log('📊 Generating test reports...');

    this.results.endTime = new Date();
    this.results.duration = this.results.endTime - this.results.startTime;

    // Generate JSON report
    await fs.writeFile(
      path.join(CONFIG.resultsDir, 'e2e-results.json'),
      JSON.stringify(this.results, null, 2)
    );

    // Generate HTML report
    const htmlReport = this.generateHtmlReport();
    await fs.writeFile(path.join(CONFIG.resultsDir, 'e2e-report.html'), htmlReport);

    // Generate JUnit XML for CI/CD
    const junitXml = this.generateJUnitReport();
    await fs.writeFile(path.join(CONFIG.resultsDir, 'e2e-junit.xml'), junitXml);

    console.log('✅ Test reports generated');
  }

  generateHtmlReport() {
    const passRate = ((this.results.passed / this.results.total) * 100).toFixed(1);

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Arctos Robot Controller - E2E Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { text-align: center; padding: 15px; border-radius: 5px; }
        .passed { background: #d4edda; color: #155724; }
        .failed { background: #f8d7da; color: #721c24; }
        .skipped { background: #fff3cd; color: #856404; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.pass { border-left: 5px solid #28a745; }
        .suite.fail { border-left: 5px solid #dc3545; }
        .test-list { margin-top: 10px; }
        .test-item { padding: 5px; margin: 2px 0; border-radius: 3px; }
        .test-pass { background: #d4edda; }
        .test-fail { background: #f8d7da; }
        .test-skip { background: #fff3cd; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Arctos Robot Controller - End-to-End Test Report</h1>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Duration:</strong> ${Math.round(this.results.duration / 1000)}s</p>
        <p><strong>Pass Rate:</strong> ${passRate}%</p>
    </div>
    
    <div class="summary">
        <div class="metric passed">
            <h3>${this.results.passed}</h3>
            <p>Passed</p>
        </div>
        <div class="metric failed">
            <h3>${this.results.failed}</h3>
            <p>Failed</p>
        </div>
        <div class="metric skipped">
            <h3>${this.results.skipped}</h3>
            <p>Skipped</p>
        </div>
        <div class="metric">
            <h3>${this.results.total}</h3>
            <p>Total</p>
        </div>
    </div>
    
    <h2>Test Suites</h2>
    ${this.results.suites
      .map(
        suite => `
        <div class="suite ${suite.failed > 0 ? 'fail' : 'pass'}">
            <h3>${suite.name}</h3>
            <p><strong>File:</strong> ${suite.file}</p>
            <p><strong>Duration:</strong> ${Math.round(suite.duration / 1000)}s</p>
            <p><strong>Results:</strong> ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped</p>
            ${suite.error ? `<p class="error"><strong>Error:</strong> ${suite.error}</p>` : ''}
        </div>
    `
      )
      .join('')}
</body>
</html>
    `;
  }

  generateJUnitReport() {
    const totalTime = (this.results.duration / 1000).toFixed(2);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites name="Arctos Robot Controller E2E Tests" tests="${this.results.total}" failures="${this.results.failed}" time="${totalTime}">\n`;

    for (const suite of this.results.suites) {
      const suiteTime = (suite.duration / 1000).toFixed(2);
      xml += `  <testsuite name="${suite.name}" tests="${suite.total}" failures="${suite.failed}" time="${suiteTime}">\n`;

      if (suite.error) {
        xml += `    <testcase name="Suite Execution" time="${suiteTime}">\n`;
        xml += `      <failure message="${suite.error}"></failure>\n`;
        xml += `    </testcase>\n`;
      } else if (suite.tests) {
        for (const test of suite.tests) {
          xml += `    <testcase name="${test.title}" time="${(test.duration / 1000).toFixed(2)}">\n`;
          if (test.status === 'failed') {
            xml += `      <failure message="${test.error || 'Test failed'}"></failure>\n`;
          }
          xml += `    </testcase>\n`;
        }
      }

      xml += `  </testsuite>\n`;
    }

    xml += `</testsuites>\n`;
    return xml;
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');

    this.isShuttingDown = true;

    // Stop all processes
    for (const [name, process] of this.processes) {
      try {
        console.log(`Stopping ${name} server...`);
        process.kill('SIGTERM');

        // Force kill if not stopped within 5 seconds
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        console.warn(`Failed to stop ${name}:`, error.message);
      }
    }

    // Wait for processes to stop
    await this.sleep(2000);

    console.log('✅ Cleanup completed');
  }

  printFinalResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL E2E TEST RESULTS');
    console.log('='.repeat(80));

    const duration = Math.round(this.results.duration / 1000);
    const passRate = ((this.results.passed / this.results.total) * 100).toFixed(1);

    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📝 Total Tests: ${this.results.total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏭️  Skipped: ${this.results.skipped}`);
    console.log(`📈 Pass Rate: ${passRate}%`);

    console.log('\n📋 Suite Breakdown:');
    for (const suite of this.results.suites) {
      const status = suite.failed > 0 ? '❌' : '✅';
      const suitePassRate = ((suite.passed / suite.total) * 100).toFixed(1);
      console.log(`  ${status} ${suite.name}: ${suite.passed}/${suite.total} (${suitePassRate}%)`);
    }

    if (this.results.failed === 0) {
      console.log(
        '\n🎉 ALL E2E TESTS PASSED! The Arctos Robot Controller is ready for production.'
      );
    } else {
      console.log(
        `\n⚠️  ${this.results.failed} test(s) failed. Please review and fix before production deployment.`
      );
    }

    console.log(`\n📄 Detailed reports available in: ${CONFIG.resultsDir}`);
    console.log('='.repeat(80));
  }

  // Helper methods
  async ensureDirectoryExists(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${error.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(143);
});

// Run the test suite
if (require.main === module) {
  const runner = new E2ETestRunner();
  runner.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = E2ETestRunner;
