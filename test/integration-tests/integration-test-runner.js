/**
 * Comprehensive Integration Test Runner
 * Orchestrates and runs all integration tests with detailed reporting
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const {
  TEST_CONFIG,
  initializeTestEnvironment,
  cleanupTestEnvironment,
} = require('./integration-test-config');

class IntegrationTestRunner {
  constructor(options = {}) {
    this.options = {
      parallel: options.parallel || false,
      verbose: options.verbose || false,
      generateReport: options.generateReport !== false,
      timeout: options.timeout || 300000, // 5 minutes default
      retryFailedTests: options.retryFailedTests || false,
      ...options,
    };

    this.results = {
      startTime: null,
      endTime: null,
      duration: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      suiteResults: [],
      errors: [],
    };

    this.testSuites = [
      {
        name: 'API Contract Tests',
        file: './api-contracts/api-contract-tests.js',
        description: 'Testing all REST API endpoints and contracts',
        timeout: 120000, // 2 minutes
      },
      {
        name: 'Database Integration Tests',
        file: './database-integration/database-integration-tests.js',
        description: 'Testing database operations and data consistency',
        timeout: 180000, // 3 minutes
      },
      {
        name: 'Socket.IO Integration Tests',
        file: './socket-integration/socket-integration-tests.js',
        description: 'Testing real-time WebSocket communication',
        timeout: 150000, // 2.5 minutes
      },
      {
        name: 'Authentication Flow Tests',
        file: './auth-flow/auth-flow-integration-tests.js',
        description: 'Testing complete authentication workflows including 2FA',
        timeout: 180000, // 3 minutes
      },
      {
        name: 'Hardware Integration Tests',
        file: './hardware-integration/hardware-integration-tests.js',
        description: 'Testing hardware communication and protocols',
        timeout: 120000, // 2 minutes
      },
    ];
  }

  /**
   * Run all integration test suites
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Integration Test Suite');
    console.log('='.repeat(60));

    this.results.startTime = new Date();

    try {
      // Initialize test environment
      await this.initializeEnvironment();

      if (this.options.parallel) {
        await this.runTestsInParallel();
      } else {
        await this.runTestsSequentially();
      }
    } catch (error) {
      console.error('❌ Critical error during test execution:', error.message);
      this.results.errors.push({
        type: 'CRITICAL_ERROR',
        message: error.message,
        stack: error.stack,
      });
    } finally {
      // Always cleanup
      await this.cleanupEnvironment();

      this.results.endTime = new Date();
      this.results.duration = this.results.endTime - this.results.startTime;

      // Generate reports
      await this.generateReports();

      // Print summary
      this.printSummary();
    }

    return this.results;
  }

  /**
   * Initialize test environment
   */
  async initializeEnvironment() {
    console.log('📋 Initializing integration test environment...');

    try {
      await initializeTestEnvironment();

      // Ensure all required directories exist
      await fs.ensureDir(path.join(__dirname, '../test-results'));
      await fs.ensureDir(path.join(__dirname, '../test-results/integration'));

      console.log('✅ Test environment initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup test environment
   */
  async cleanupEnvironment() {
    console.log('🧹 Cleaning up test environment...');

    try {
      await cleanupTestEnvironment();
      console.log('✅ Test environment cleaned up successfully');
    } catch (error) {
      console.error('⚠️  Warning: Failed to cleanup test environment:', error.message);
    }
  }

  /**
   * Run tests sequentially
   */
  async runTestsSequentially() {
    console.log('📋 Running integration tests sequentially...\n');

    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }
  }

  /**
   * Run tests in parallel
   */
  async runTestsInParallel() {
    console.log('🚀 Running integration tests in parallel...\n');

    const promises = this.testSuites.map(suite => this.runTestSuite(suite));
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      const suite = this.testSuites[index];
      if (result.status === 'rejected') {
        console.error(`❌ Suite "${suite.name}" failed with error:`, result.reason);
        this.results.errors.push({
          type: 'SUITE_ERROR',
          suite: suite.name,
          message: result.reason.message,
          stack: result.reason.stack,
        });
      }
    });
  }

  /**
   * Run a single test suite
   */
  async runTestSuite(suite) {
    const startTime = new Date();
    const suiteResult = {
      name: suite.name,
      description: suite.description,
      startTime: startTime,
      endTime: null,
      duration: 0,
      status: 'RUNNING',
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      output: '',
      errors: [],
    };

    console.log(`🧪 Running: ${suite.name}`);
    console.log(`   📝 ${suite.description}`);

    try {
      const result = await this.executeTestFile(suite);

      suiteResult.status = result.exitCode === 0 ? 'PASSED' : 'FAILED';
      suiteResult.output = result.output;
      suiteResult.tests = this.parseTestCount(result.output);
      suiteResult.passed = this.parsePassedCount(result.output);
      suiteResult.failed = this.parseFailedCount(result.output);
      suiteResult.skipped = this.parseSkippedCount(result.output);

      if (result.exitCode === 0) {
        console.log(`   ✅ PASSED (${suiteResult.tests} tests, ${result.duration}ms)`);
        this.results.passedTests += suiteResult.passed;
      } else {
        console.log(`   ❌ FAILED (${suiteResult.failed} failures, ${result.duration}ms)`);
        this.results.failedTests += suiteResult.failed;

        // Extract error details
        suiteResult.errors = this.parseTestErrors(result.output);
      }

      this.results.totalTests += suiteResult.tests;
      this.results.skippedTests += suiteResult.skipped;
    } catch (error) {
      suiteResult.status = 'ERROR';
      suiteResult.errors.push({
        message: error.message,
        stack: error.stack,
      });

      console.log(`   💥 ERROR: ${error.message}`);
      this.results.errors.push({
        type: 'SUITE_EXECUTION_ERROR',
        suite: suite.name,
        message: error.message,
      });
    }

    suiteResult.endTime = new Date();
    suiteResult.duration = suiteResult.endTime - startTime;

    this.results.suiteResults.push(suiteResult);

    // Add spacing between suites
    console.log('');
  }

  /**
   * Execute a test file using Node.js test runner
   */
  async executeTestFile(suite) {
    return new Promise((resolve, reject) => {
      const testFilePath = path.resolve(__dirname, suite.file);
      const startTime = Date.now();

      const nodeProcess = spawn('node', ['--test', testFilePath], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_TIMEOUT: suite.timeout || this.options.timeout,
        },
        stdio: 'pipe',
      });

      let output = '';
      let errorOutput = '';

      nodeProcess.stdout.on('data', data => {
        const text = data.toString();
        output += text;

        if (this.options.verbose) {
          process.stdout.write(text);
        }
      });

      nodeProcess.stderr.on('data', data => {
        const text = data.toString();
        errorOutput += text;

        if (this.options.verbose) {
          process.stderr.write(text);
        }
      });

      nodeProcess.on('close', code => {
        const duration = Date.now() - startTime;

        resolve({
          exitCode: code,
          output: output + errorOutput,
          duration: duration,
        });
      });

      nodeProcess.on('error', error => {
        reject(error);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        nodeProcess.kill('SIGKILL');
        reject(new Error(`Test suite timed out after ${suite.timeout}ms`));
      }, suite.timeout || this.options.timeout);

      nodeProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Parse test output to extract test counts and results
   */
  parseTestCount(output) {
    const matches = output.match(/tests? (\d+)/gi);
    if (!matches) return 0;

    return matches.reduce((total, match) => {
      const num = parseInt(match.match(/\d+/)[0]);
      return Math.max(total, num);
    }, 0);
  }

  parsePassedCount(output) {
    const passMatches = output.match(/(\d+) pass/gi);
    if (!passMatches) return 0;

    return passMatches.reduce((total, match) => {
      const num = parseInt(match.match(/\d+/)[0]);
      return total + num;
    }, 0);
  }

  parseFailedCount(output) {
    const failMatches = output.match(/(\d+) fail/gi);
    if (!failMatches) return 0;

    return failMatches.reduce((total, match) => {
      const num = parseInt(match.match(/\d+/)[0]);
      return total + num;
    }, 0);
  }

  parseSkippedCount(output) {
    const skipMatches = output.match(/(\d+) skip/gi);
    if (!skipMatches) return 0;

    return skipMatches.reduce((total, match) => {
      const num = parseInt(match.match(/\d+/)[0]);
      return total + num;
    }, 0);
  }

  parseTestErrors(output) {
    const errors = [];

    // Simple error extraction - can be enhanced
    const errorLines = output
      .split('\n')
      .filter(
        line => line.includes('Error:') || line.includes('AssertionError:') || line.includes('fail')
      );

    errorLines.forEach(line => {
      errors.push({
        message: line.trim(),
        type: 'TEST_FAILURE',
      });
    });

    return errors;
  }

  /**
   * Generate comprehensive test reports
   */
  async generateReports() {
    if (!this.options.generateReport) return;

    console.log('📊 Generating integration test reports...');

    try {
      await this.generateJSONReport();
      await this.generateHTMLReport();
      await this.generateTextReport();

      console.log('✅ Reports generated successfully');
    } catch (error) {
      console.error('⚠️  Warning: Failed to generate reports:', error.message);
    }
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport() {
    const reportPath = path.join(
      __dirname,
      '../test-results/integration/integration-test-results.json'
    );

    const report = {
      ...this.results,
      testSuites: this.results.suiteResults,
      configuration: {
        parallel: this.options.parallel,
        timeout: this.options.timeout,
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    await fs.writeJson(reportPath, report, { spaces: 2 });
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport() {
    const reportPath = path.join(
      __dirname,
      '../test-results/integration/integration-test-report.html'
    );

    const successRate =
      this.results.totalTests > 0
        ? Math.round((this.results.passedTests / this.results.totalTests) * 100)
        : 0;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Integration Test Report - Arctos Robot Controller</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; }
        .metric { background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
        .metric.success { border-left-color: #28a745; }
        .metric.failure { border-left-color: #dc3545; }
        .suite { background: white; margin-bottom: 20px; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; }
        .suite.passed { border-left: 4px solid #28a745; }
        .suite.failed { border-left: 4px solid #dc3545; }
        .suite.error { border-left: 4px solid #ffc107; }
        .errors { background: #f8d7da; padding: 10px; border-radius: 4px; margin-top: 10px; }
        .duration { color: #6c757d; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Integration Test Report</h1>
        <h2>Arctos Robot Controller</h2>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Duration:</strong> ${Math.round(this.results.duration / 1000)}s</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${this.results.totalTests}</div>
        </div>
        <div class="metric success">
            <h3>Passed</h3>
            <div style="font-size: 2em; font-weight: bold;">${this.results.passedTests}</div>
        </div>
        <div class="metric failure">
            <h3>Failed</h3>
            <div style="font-size: 2em; font-weight: bold;">${this.results.failedTests}</div>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <div style="font-size: 2em; font-weight: bold;">${successRate}%</div>
        </div>
    </div>
    
    <h2>Test Suites</h2>
    ${this.results.suiteResults
      .map(
        suite => `
        <div class="suite ${suite.status.toLowerCase()}">
            <h3>${suite.name}</h3>
            <p>${suite.description}</p>
            <p><strong>Status:</strong> ${suite.status}</p>
            <p><strong>Tests:</strong> ${suite.tests} total, ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped</p>
            <p class="duration"><strong>Duration:</strong> ${Math.round(suite.duration / 1000)}s</p>
            
            ${
              suite.errors.length > 0
                ? `
                <div class="errors">
                    <h4>Errors:</h4>
                    <ul>
                        ${suite.errors.map(error => `<li>${error.message}</li>`).join('')}
                    </ul>
                </div>
            `
                : ''
            }
        </div>
    `
      )
      .join('')}
    
    ${
      this.results.errors.length > 0
        ? `
        <h2>Critical Errors</h2>
        <div class="errors">
            <ul>
                ${this.results.errors.map(error => `<li><strong>${error.type}:</strong> ${error.message}</li>`).join('')}
            </ul>
        </div>
    `
        : ''
    }
    
</body>
</html>`;

    await fs.writeFile(reportPath, html);
  }

  /**
   * Generate text report
   */
  async generateTextReport() {
    const reportPath = path.join(
      __dirname,
      '../test-results/integration/integration-test-summary.txt'
    );

    const successRate =
      this.results.totalTests > 0
        ? Math.round((this.results.passedTests / this.results.totalTests) * 100)
        : 0;

    const report = `
INTEGRATION TEST REPORT - ARCTOS ROBOT CONTROLLER
================================================

Generated: ${new Date().toISOString()}
Duration: ${Math.round(this.results.duration / 1000)}s
Configuration: ${this.options.parallel ? 'Parallel' : 'Sequential'} execution

SUMMARY
-------
Total Tests: ${this.results.totalTests}
Passed: ${this.results.passedTests}
Failed: ${this.results.failedTests}
Skipped: ${this.results.skippedTests}
Success Rate: ${successRate}%

TEST SUITES
-----------
${this.results.suiteResults
  .map(
    suite => `
${suite.name}: ${suite.status}
  Description: ${suite.description}
  Tests: ${suite.tests} (${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped)
  Duration: ${Math.round(suite.duration / 1000)}s
  ${suite.errors.length > 0 ? `Errors: ${suite.errors.length}` : ''}
`
  )
  .join('')}

${
  this.results.errors.length > 0
    ? `
CRITICAL ERRORS
---------------
${this.results.errors.map(error => `${error.type}: ${error.message}`).join('\n')}
`
    : ''
}
`;

    await fs.writeFile(reportPath, report.trim());
  }

  /**
   * Print summary to console
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🏁 INTEGRATION TEST SUMMARY');
    console.log('='.repeat(60));

    const successRate =
      this.results.totalTests > 0
        ? Math.round((this.results.passedTests / this.results.totalTests) * 100)
        : 0;

    console.log(`📊 Total Tests: ${this.results.totalTests}`);
    console.log(`✅ Passed: ${this.results.passedTests}`);
    console.log(`❌ Failed: ${this.results.failedTests}`);
    console.log(`⏭️  Skipped: ${this.results.skippedTests}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    console.log(`⏱️  Duration: ${Math.round(this.results.duration / 1000)}s`);

    if (this.results.errors.length > 0) {
      console.log(`💥 Critical Errors: ${this.results.errors.length}`);
    }

    console.log('\n📂 Reports generated in: test/test-results/integration/');

    // Exit with appropriate code
    const hasFailures = this.results.failedTests > 0 || this.results.errors.length > 0;

    if (hasFailures) {
      console.log('\n❌ Integration tests completed with failures');
      process.exit(1);
    } else {
      console.log('\n🎉 All integration tests passed successfully!');
      process.exit(0);
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    parallel: args.includes('--parallel'),
    verbose: args.includes('--verbose'),
    generateReport: !args.includes('--no-report'),
    retryFailedTests: args.includes('--retry'),
  };

  // Parse timeout option
  const timeoutArg = args.find(arg => arg.startsWith('--timeout='));
  if (timeoutArg) {
    options.timeout = parseInt(timeoutArg.split('=')[1]) * 1000;
  }

  const runner = new IntegrationTestRunner(options);
  runner.runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = IntegrationTestRunner;
