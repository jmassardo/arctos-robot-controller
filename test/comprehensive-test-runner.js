/**
 * Comprehensive Test Runner and Coverage Manager
 * Manages execution of all unit tests with detailed coverage reporting
 */

const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const util = require('util');

class ComprehensiveTestRunner {
  constructor(options = {}) {
    this.options = {
      coverageThreshold: 90,
      outputDir: './test-results',
      includeIntegration: true,
      parallel: false,
      timeout: 300000, // 5 minutes
      ...options
    };
    
    this.testSuites = [
      {
        name: 'Authentication Module',
        file: 'auth.comprehensive.test.js',
        category: 'unit',
        priority: 'high'
      },
      {
        name: 'G-Code Parser Module',
        file: 'gcode-parser.comprehensive.test.js',
        category: 'unit',
        priority: 'high'
      },
      {
        name: 'Database Module',
        file: 'database.comprehensive.test.js',
        category: 'unit',
        priority: 'high'
      },
      {
        name: 'Hardware Controllers',
        file: 'hardware-controllers.comprehensive.test.js',
        category: 'unit',
        priority: 'medium'
      },
      {
        name: 'Server Application',
        file: 'server.comprehensive.test.js',
        category: 'integration',
        priority: 'high'
      }
    ];
    
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: {},
      errors: [],
      duration: 0,
      suites: []
    };
  }

  /**
   * Run all comprehensive tests with coverage
   */
  async runAll() {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================');
    
    const startTime = Date.now();
    
    try {
      // Setup test environment
      await this.setupTestEnvironment();
      
      // Run test suites
      if (this.options.parallel) {
        await this.runTestsInParallel();
      } else {
        await this.runTestsSequentially();
      }
      
      // Generate coverage report
      await this.generateCoverageReport();
      
      // Generate summary report
      await this.generateSummaryReport();
      
      this.results.duration = Date.now() - startTime;
      
      console.log('\n✅ All tests completed successfully!');
      console.log(`📊 Total Duration: ${this.formatDuration(this.results.duration)}`);
      
      return this.results;
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    }
  }

  /**
   * Setup test environment
   */
  async setupTestEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Create output directories
    await fs.ensureDir(this.options.outputDir);
    await fs.ensureDir(path.join(this.options.outputDir, 'coverage'));
    await fs.ensureDir(path.join(this.options.outputDir, 'reports'));
    
    // Create test fixtures directory
    await fs.ensureDir('./test/fixtures');
    
    // Ensure required directories exist
    const requiredDirs = ['./data', './config', './logs'];
    for (const dir of requiredDirs) {
      await fs.ensureDir(dir);
    }
    
    console.log('✅ Test environment ready');
  }

  /**
   * Run tests sequentially
   */
  async runTestsSequentially() {
    console.log('🔄 Running tests sequentially...');
    
    for (const suite of this.testSuites) {
      console.log(`\n📋 Running: ${suite.name}`);
      
      try {
        const result = await this.runSingleTest(suite);
        this.results.suites.push(result);
        
        if (result.success) {
          console.log(`✅ ${suite.name}: PASSED (${result.duration}ms)`);
          this.results.passed++;
        } else {
          console.log(`❌ ${suite.name}: FAILED`);
          this.results.failed++;
          this.results.errors.push({
            suite: suite.name,
            error: result.error
          });
        }
        
      } catch (error) {
        console.log(`💥 ${suite.name}: ERROR - ${error.message}`);
        this.results.failed++;
        this.results.errors.push({
          suite: suite.name,
          error: error.message
        });
      }
    }
  }

  /**
   * Run tests in parallel
   */
  async runTestsInParallel() {
    console.log('🔄 Running tests in parallel...');
    
    const promises = this.testSuites.map(async (suite) => {
      console.log(`📋 Starting: ${suite.name}`);
      
      try {
        const result = await this.runSingleTest(suite);
        console.log(`✅ ${suite.name}: COMPLETED`);
        return { suite, result, success: true };
      } catch (error) {
        console.log(`❌ ${suite.name}: FAILED - ${error.message}`);
        return { suite, error, success: false };
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    // Process results
    for (const promiseResult of results) {
      if (promiseResult.status === 'fulfilled') {
        const { suite, result, success, error } = promiseResult.value;
        
        if (success) {
          this.results.passed++;
          this.results.suites.push(result);
        } else {
          this.results.failed++;
          this.results.errors.push({
            suite: suite.name,
            error: error?.message || 'Unknown error'
          });
        }
      } else {
        this.results.failed++;
        this.results.errors.push({
          suite: 'Unknown',
          error: promiseResult.reason
        });
      }
    }
  }

  /**
   * Run a single test suite
   */
  async runSingleTest(suite) {
    const testFile = path.join('./test/unit-tests', suite.file);
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // Use c8 for coverage if available, otherwise just node --test
      const useC8 = true; // Enable coverage by default
      
      let command, args;
      if (useC8) {
        command = 'npx';
        args = [
          'c8',
          '--reporter=json',
          '--reporter=text',
          `--reports-dir=${path.join(this.options.outputDir, 'coverage', suite.name.replace(/\\s+/g, '-'))}`,
          'node',
          '--test',
          testFile
        ];
      } else {
        command = 'node';
        args = ['--test', testFile];
      }
      
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.options.timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        const result = {
          name: suite.name,
          file: suite.file,
          category: suite.category,
          priority: suite.priority,
          duration,
          exitCode: code,
          success: code === 0,
          stdout,
          stderr,
          coverage: this.parseCoverageFromOutput(stdout, stderr)
        };
        
        if (code === 0) {
          resolve(result);
        } else {
          result.error = stderr || `Process exited with code ${code}`;
          resolve(result); // Don't reject, let caller handle
        }
      });
      
      child.on('error', (error) => {
        reject(new Error(`Failed to start test process: ${error.message}`));
      });
    });
  }

  /**
   * Parse coverage information from test output
   */
  parseCoverageFromOutput(stdout, stderr) {
    const coverage = {
      lines: { covered: 0, total: 0, percentage: 0 },
      functions: { covered: 0, total: 0, percentage: 0 },
      branches: { covered: 0, total: 0, percentage: 0 },
      statements: { covered: 0, total: 0, percentage: 0 }
    };
    
    // Parse coverage from c8 output
    const output = stdout + stderr;
    
    // Look for coverage summary
    const coverageRegex = /Lines\\s*:\\s*(\\d+(?:\\.\\d+)?)%\\s*\\((\\d+)\\/(\\d+)\\)/;
    const functionsRegex = /Functions\\s*:\\s*(\\d+(?:\\.\\d+)?)%\\s*\\((\\d+)\\/(\\d+)\\)/;
    const branchesRegex = /Branches\\s*:\\s*(\\d+(?:\\.\\d+)?)%\\s*\\((\\d+)\\/(\\d+)\\)/;
    const statementsRegex = /Statements\\s*:\\s*(\\d+(?:\\.\\d+)?)%\\s*\\((\\d+)\\/(\\d+)\\)/;
    
    const parseMatch = (regex, type) => {
      const match = output.match(regex);
      if (match) {
        coverage[type] = {
          percentage: parseFloat(match[1]),
          covered: parseInt(match[2]),
          total: parseInt(match[3])
        };
      }
    };
    
    parseMatch(coverageRegex, 'lines');
    parseMatch(functionsRegex, 'functions');
    parseMatch(branchesRegex, 'branches');
    parseMatch(statementsRegex, 'statements');
    
    return coverage;
  }

  /**
   * Generate comprehensive coverage report
   */
  async generateCoverageReport() {
    console.log('📊 Generating coverage report...');
    
    const coverageReport = {
      timestamp: new Date().toISOString(),
      threshold: this.options.coverageThreshold,
      overall: {
        lines: { covered: 0, total: 0, percentage: 0 },
        functions: { covered: 0, total: 0, percentage: 0 },
        branches: { covered: 0, total: 0, percentage: 0 },
        statements: { covered: 0, total: 0, percentage: 0 }
      },
      suites: [],
      summary: {
        totalSuites: this.testSuites.length,
        passedSuites: this.results.passed,
        failedSuites: this.results.failed,
        coverageThresholdMet: false
      }
    };
    
    // Aggregate coverage from all suites
    for (const suite of this.results.suites) {
      if (suite.coverage) {
        coverageReport.suites.push({
          name: suite.name,
          category: suite.category,
          coverage: suite.coverage
        });
        
        // Aggregate totals
        ['lines', 'functions', 'branches', 'statements'].forEach(type => {
          coverageReport.overall[type].covered += suite.coverage[type].covered || 0;
          coverageReport.overall[type].total += suite.coverage[type].total || 0;
        });
      }
    }
    
    // Calculate overall percentages
    ['lines', 'functions', 'branches', 'statements'].forEach(type => {
      const { covered, total } = coverageReport.overall[type];
      coverageReport.overall[type].percentage = total > 0 ? (covered / total) * 100 : 0;
    });
    
    // Check if coverage threshold is met
    const overallPercentage = coverageReport.overall.lines.percentage;
    coverageReport.summary.coverageThresholdMet = overallPercentage >= this.options.coverageThreshold;
    
    // Save coverage report
    const reportPath = path.join(this.options.outputDir, 'reports', 'coverage-report.json');
    await fs.writeJson(reportPath, coverageReport, { spaces: 2 });
    
    // Generate HTML report
    await this.generateHtmlCoverageReport(coverageReport);
    
    console.log(`📄 Coverage report saved: ${reportPath}`);
    console.log(`📈 Overall Coverage: ${overallPercentage.toFixed(2)}%`);
    
    this.results.coverage = coverageReport;
  }

  /**
   * Generate HTML coverage report
   */
  async generateHtmlCoverageReport(coverageData) {
    const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Comprehensive Test Coverage Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
            .summary { display: flex; gap: 20px; margin: 20px 0; }
            .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; flex: 1; }
            .metric.excellent { background: #d4edda; }
            .metric.good { background: #fff3cd; }
            .metric.poor { background: #f8d7da; }
            .suite { border: 1px solid #ddd; margin: 10px 0; border-radius: 5px; }
            .suite-header { background: #f8f9fa; padding: 10px; font-weight: bold; }
            .suite-body { padding: 10px; }
            .progress-bar { width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; }
            .progress-fill { height: 100%; transition: width 0.3s; }
            .progress-excellent { background: #28a745; }
            .progress-good { background: #ffc107; }
            .progress-poor { background: #dc3545; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🧪 Comprehensive Test Coverage Report</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <p>Coverage Threshold: ${this.options.coverageThreshold}%</p>
        </div>

        <div class="summary">
            <div class="metric ${this.getCoverageClass(coverageData.overall.lines.percentage)}">
                <h3>Lines Coverage</h3>
                <div class="progress-bar">
                    <div class="progress-fill progress-${this.getCoverageClass(coverageData.overall.lines.percentage)}" 
                         style="width: ${coverageData.overall.lines.percentage}%"></div>
                </div>
                <p>${coverageData.overall.lines.percentage.toFixed(2)}% (${coverageData.overall.lines.covered}/${coverageData.overall.lines.total})</p>
            </div>
            
            <div class="metric ${this.getCoverageClass(coverageData.overall.functions.percentage)}">
                <h3>Functions Coverage</h3>
                <div class="progress-bar">
                    <div class="progress-fill progress-${this.getCoverageClass(coverageData.overall.functions.percentage)}" 
                         style="width: ${coverageData.overall.functions.percentage}%"></div>
                </div>
                <p>${coverageData.overall.functions.percentage.toFixed(2)}% (${coverageData.overall.functions.covered}/${coverageData.overall.functions.total})</p>
            </div>
            
            <div class="metric ${this.getCoverageClass(coverageData.overall.branches.percentage)}">
                <h3>Branches Coverage</h3>
                <div class="progress-bar">
                    <div class="progress-fill progress-${this.getCoverageClass(coverageData.overall.branches.percentage)}" 
                         style="width: ${coverageData.overall.branches.percentage}%"></div>
                </div>
                <p>${coverageData.overall.branches.percentage.toFixed(2)}% (${coverageData.overall.branches.covered}/${coverageData.overall.branches.total})</p>
            </div>
        </div>

        <h2>📋 Test Suite Details</h2>
        ${coverageData.suites.map(suite => `
            <div class="suite">
                <div class="suite-header">${suite.name} (${suite.category})</div>
                <div class="suite-body">
                    <p><strong>Lines:</strong> ${suite.coverage.lines.percentage.toFixed(2)}% (${suite.coverage.lines.covered}/${suite.coverage.lines.total})</p>
                    <p><strong>Functions:</strong> ${suite.coverage.functions.percentage.toFixed(2)}% (${suite.coverage.functions.covered}/${suite.coverage.functions.total})</p>
                    <p><strong>Branches:</strong> ${suite.coverage.branches.percentage.toFixed(2)}% (${suite.coverage.branches.covered}/${suite.coverage.branches.total})</p>
                </div>
            </div>
        `).join('')}

        <div class="header" style="margin-top: 30px;">
            <h2>📈 Summary</h2>
            <p><strong>Total Test Suites:</strong> ${coverageData.summary.totalSuites}</p>
            <p><strong>Passed:</strong> ${coverageData.summary.passedSuites}</p>
            <p><strong>Failed:</strong> ${coverageData.summary.failedSuites}</p>
            <p><strong>Coverage Threshold Met:</strong> ${coverageData.summary.coverageThresholdMet ? '✅ Yes' : '❌ No'}</p>
        </div>
    </body>
    </html>
    `;
    
    const htmlPath = path.join(this.options.outputDir, 'reports', 'coverage-report.html');
    await fs.writeFile(htmlPath, htmlTemplate);
    
    console.log(`🌐 HTML coverage report: ${htmlPath}`);
  }

  /**
   * Get coverage class based on percentage
   */
  getCoverageClass(percentage) {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    return 'poor';
  }

  /**
   * Generate summary report
   */
  async generateSummaryReport() {
    console.log('📋 Generating test summary report...');
    
    const summary = {
      timestamp: new Date().toISOString(),
      execution: {
        duration: this.results.duration,
        totalSuites: this.testSuites.length,
        passed: this.results.passed,
        failed: this.results.failed,
        skipped: this.results.skipped,
        successRate: ((this.results.passed / this.testSuites.length) * 100).toFixed(2)
      },
      coverage: this.results.coverage ? {
        overall: this.results.coverage.overall.lines.percentage.toFixed(2),
        thresholdMet: this.results.coverage.summary.coverageThresholdMet
      } : null,
      errors: this.results.errors,
      recommendations: this.generateRecommendations()
    };
    
    const summaryPath = path.join(this.options.outputDir, 'reports', 'test-summary.json');
    await fs.writeJson(summaryPath, summary, { spaces: 2 });
    
    // Generate console summary
    this.printConsoleSummary(summary);
    
    console.log(`📄 Summary report saved: ${summaryPath}`);
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.results.failed > 0) {
      recommendations.push('Fix failing test suites before proceeding to production');
    }
    
    if (this.results.coverage && this.results.coverage.overall.lines.percentage < this.options.coverageThreshold) {
      recommendations.push(`Increase test coverage to meet ${this.options.coverageThreshold}% threshold`);
    }
    
    if (this.results.duration > 180000) { // 3 minutes
      recommendations.push('Consider optimizing test execution time');
    }
    
    if (this.results.errors.length > 0) {
      recommendations.push('Review and resolve test execution errors');
    }
    
    return recommendations;
  }

  /**
   * Print console summary
   */
  printConsoleSummary(summary) {
    console.log('\\n📊 TEST EXECUTION SUMMARY');
    console.log('==========================');
    console.log(`Duration: ${this.formatDuration(summary.execution.duration)}`);
    console.log(`Total Suites: ${summary.execution.totalSuites}`);
    console.log(`✅ Passed: ${summary.execution.passed}`);
    console.log(`❌ Failed: ${summary.execution.failed}`);
    console.log(`⏭️  Skipped: ${summary.execution.skipped}`);
    console.log(`📈 Success Rate: ${summary.execution.successRate}%`);
    
    if (summary.coverage) {
      console.log(`🎯 Overall Coverage: ${summary.coverage.overall}%`);
      console.log(`🎯 Threshold Met: ${summary.coverage.thresholdMet ? '✅' : '❌'}`);
    }
    
    if (summary.errors.length > 0) {
      console.log('\\n❌ ERRORS:');
      summary.errors.forEach(error => {
        console.log(`   ${error.suite}: ${error.error}`);
      });
    }
    
    if (summary.recommendations.length > 0) {
      console.log('\\n💡 RECOMMENDATIONS:');
      summary.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
    }
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }
}

// Export for use as module
module.exports = ComprehensiveTestRunner;

// CLI execution
if (require.main === module) {
  const runner = new ComprehensiveTestRunner({
    coverageThreshold: 90,
    outputDir: './test-results',
    includeIntegration: true,
    parallel: process.argv.includes('--parallel'),
    timeout: 300000
  });
  
  runner.runAll()
    .then((results) => {
      console.log('\\n🎉 Test execution completed successfully!');
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}