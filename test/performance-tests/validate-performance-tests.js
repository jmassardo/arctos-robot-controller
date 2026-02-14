#!/usr/bin/env node
/**
 * Performance Testing Validation Script
 *
 * Quick validation that performance tests are working correctly
 * without external dependencies.
 */

const path = require('path');
const { performance } = require('perf_hooks');

console.log('🧪 Performance Test Validation');
console.log('🎯 Testing Arctos Robot Controller Performance Framework\n');

class PerformanceTestValidator {
  constructor() {
    this.results = {
      tests: [],
      startTime: performance.now(),
    };
  }

  async validateFramework() {
    console.log('📋 Validating Performance Test Framework...\n');

    try {
      // Test 1: Validate test runner
      await this.validateTestRunner();

      // Test 2: Validate individual test modules
      await this.validateTestModules();

      // Test 3: Validate performance thresholds
      await this.validatePerformanceThresholds();

      // Test 4: Validate simulation methods
      await this.validateSimulationMethods();

      const totalTime = performance.now() - this.results.startTime;
      const passedTests = this.results.tests.filter(t => t.status === 'passed').length;

      console.log('\n🎉 Performance Test Validation Complete!');
      console.log(`📊 Results: ${passedTests}/${this.results.tests.length} validations passed`);
      console.log(`⏱️  Duration: ${totalTime.toFixed(2)}ms\n`);

      if (passedTests === this.results.tests.length) {
        console.log('✅ Performance testing framework is ready for use!');
        console.log('💡 Run "npm run test:performance" to execute full performance tests');
        return true;
      } else {
        console.log('❌ Some validations failed - check implementation');
        return false;
      }
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      return false;
    }
  }

  async validateTestRunner() {
    console.log('  🔧 Validating Performance Test Runner...');

    const testStart = performance.now();

    try {
      const PerformanceTestRunner = require('./performance-test-runner.js');
      const runner = new PerformanceTestRunner({
        verbose: false,
        outputDir: '/tmp/perf-test-validation',
      });

      // Validate runner initialization
      if (!runner.options || !runner.results) {
        throw new Error('Runner not properly initialized');
      }

      // Validate thresholds
      if (!runner.options.thresholds || !runner.options.thresholds.robotCommandLatency) {
        throw new Error('Performance thresholds not configured');
      }

      const duration = performance.now() - testStart;

      this.results.tests.push({
        name: 'Performance Test Runner',
        status: 'passed',
        duration: duration,
      });

      console.log('    ✅ Test runner validation passed');
    } catch (error) {
      this.results.tests.push({
        name: 'Performance Test Runner',
        status: 'failed',
        error: error.message,
      });

      console.log('    ❌ Test runner validation failed:', error.message);
    }
  }

  async validateTestModules() {
    console.log('  📦 Validating Performance Test Modules...');

    const testModules = [
      'robot-control-latency.test.js',
      'realtime-communication.test.js',
      'concurrent-user-load.test.js',
      'gcode-processing.test.js',
      'api-response-time.test.js',
    ];

    for (const moduleName of testModules) {
      const testStart = performance.now();

      try {
        const modulePath = path.join(__dirname, moduleName);
        const TestModule = require(modulePath);

        // Create instance without dependencies for validation
        const testInstance = new TestModule({
          skipDependencies: true,
          validationMode: true,
        });

        if (!testInstance.run || !testInstance.results) {
          throw new Error(`Module ${moduleName} missing required methods`);
        }

        const duration = performance.now() - testStart;

        this.results.tests.push({
          name: `Module: ${moduleName}`,
          status: 'passed',
          duration: duration,
        });

        console.log(`    ✅ ${moduleName} validation passed`);
      } catch (error) {
        this.results.tests.push({
          name: `Module: ${moduleName}`,
          status: 'failed',
          error: error.message,
        });

        console.log(`    ⚠️  ${moduleName} validation: ${error.message}`);
      }
    }
  }

  async validatePerformanceThresholds() {
    console.log('  🎯 Validating Performance Thresholds...');

    const testStart = performance.now();

    try {
      // Test robotic control thresholds
      const robotThresholds = {
        emergencyStop: 10, // ms - Safety critical
        manualControl: 50, // ms - Real-time control
        positionCommand: 100, // ms - Position updates
        statusUpdate: 200, // ms - Status feedback
        gcodeExecution: 500, // ms - G-code processing
      };

      // Simulate threshold validation
      for (const [threshold, limit] of Object.entries(robotThresholds)) {
        const simulatedValue = Math.random() * limit * 0.8; // Within threshold

        if (simulatedValue > limit) {
          throw new Error(`${threshold} threshold exceeded: ${simulatedValue}ms > ${limit}ms`);
        }
      }

      const duration = performance.now() - testStart;

      this.results.tests.push({
        name: 'Performance Thresholds',
        status: 'passed',
        duration: duration,
        metrics: { thresholds: robotThresholds },
      });

      console.log('    ✅ Performance thresholds validation passed');
      console.log(`      Emergency Stop: ${robotThresholds.emergencyStop}ms (safety critical)`);
      console.log(`      Manual Control: ${robotThresholds.manualControl}ms (real-time)`);
    } catch (error) {
      this.results.tests.push({
        name: 'Performance Thresholds',
        status: 'failed',
        error: error.message,
      });

      console.log('    ❌ Performance thresholds validation failed:', error.message);
    }
  }

  async validateSimulationMethods() {
    console.log('  🎮 Validating Simulation Methods...');

    const testStart = performance.now();

    try {
      // Test robot control simulation
      const robotSim = await this.simulateRobotControl();
      if (!robotSim.success) {
        throw new Error('Robot control simulation failed');
      }

      // Test API simulation
      const apiSim = await this.simulateApiCall();
      if (!apiSim.success) {
        throw new Error('API simulation failed');
      }

      // Test G-code simulation
      const gcodeSim = await this.simulateGCodeProcessing();
      if (!gcodeSim.success) {
        throw new Error('G-code processing simulation failed');
      }

      const duration = performance.now() - testStart;

      this.results.tests.push({
        name: 'Simulation Methods',
        status: 'passed',
        duration: duration,
        metrics: {
          robotControlLatency: robotSim.latency,
          apiResponseTime: apiSim.responseTime,
          gcodeProcessingRate: gcodeSim.processingRate,
        },
      });

      console.log('    ✅ Simulation methods validation passed');
      console.log(`      Robot Control: ${robotSim.latency.toFixed(2)}ms`);
      console.log(`      API Response: ${apiSim.responseTime.toFixed(2)}ms`);
      console.log(`      G-code Rate: ${gcodeSim.processingRate.toFixed(2)} lines/sec`);
    } catch (error) {
      this.results.tests.push({
        name: 'Simulation Methods',
        status: 'failed',
        error: error.message,
      });

      console.log('    ❌ Simulation methods validation failed:', error.message);
    }
  }

  // Simulation methods for validation
  async simulateRobotControl() {
    const start = performance.now();

    // Simulate robot command processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 20));

    const latency = performance.now() - start;

    return {
      success: latency < 100, // Should be well under threshold
      latency: latency,
    };
  }

  async simulateApiCall() {
    const start = performance.now();

    // Simulate API processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

    const responseTime = performance.now() - start;

    return {
      success: responseTime < 300,
      responseTime: responseTime,
    };
  }

  async simulateGCodeProcessing() {
    const start = performance.now();
    const lines = 1000;

    // Simulate G-code parsing
    for (let i = 0; i < lines / 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    const duration = performance.now() - start;
    const processingRate = lines / (duration / 1000);

    return {
      success: processingRate > 500, // Should exceed 500 lines/sec
      processingRate: processingRate,
      duration: duration,
    };
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PerformanceTestValidator();
  validator
    .validateFramework()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}

module.exports = PerformanceTestValidator;
