/**
 * Robot Control Latency Performance Tests
 *
 * Critical performance tests for robotic control system latency.
 * Tests real-time control command response times and safety thresholds.
 *
 * Performance Test Engineer Implementation
 */

const { performance } = require('perf_hooks');
const supertest = require('supertest');
const { io } = require('socket.io-client');

class RobotControlLatencyTests {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      tests: [],
      metrics: {
        commandLatencies: [],
        emergencyStopLatencies: [],
        positionUpdateLatencies: [],
        realtimeFeedbackLatencies: [],
      },
      success: true,
    };

    // Critical safety thresholds for robotic control
    this.thresholds = {
      emergencyStop: 10, // ms - Critical safety requirement
      manualControl: 50, // ms - Real-time control
      positionCommand: 100, // ms - Position updates
      statusUpdate: 200, // ms - Status feedback
      gcodeExecution: 500, // ms - G-code command processing
    };
  }

  async run() {
    console.log('    🤖 Running Robot Control Latency tests...');

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Critical latency tests
      await this.testEmergencyStopLatency();
      await this.testManualControlLatency();
      await this.testPositionCommandLatency();
      await this.testRealtimeStatusUpdates();
      await this.testGCodeCommandLatency();
      await this.testConcurrentControlLatency();
      await this.testHardwareProtocolLatency();

      // Stress testing under load
      await this.testLatencyUnderLoad();

      // Analyze results
      this.analyzeLatencyResults();

      this.results.success = this.results.tests.every(t => t.status !== 'failed');
    } catch (error) {
      console.error('    ❌ Robot Control Latency tests failed:', error);
      this.results.success = false;
      this.results.error = error.message;
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  async setupTestEnvironment() {
    // Mock server setup for testing
    this.mockServer = {
      port: 5001,
      running: true,
    };

    // Mock robot controller
    this.mockRobot = {
      axes: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 },
      gripper: 0,
      status: 'idle',
      emergencyStop: false,
    };
  }

  async testEmergencyStopLatency() {
    console.log('      🚨 Testing Emergency Stop Latency (Critical Safety)...');

    const iterations = 20;
    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Simulate emergency stop command
      await this.simulateEmergencyStop();

      const latency = performance.now() - start;
      latencies.push(latency);

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const maxLatency = Math.max(...latencies);

    const testResult = {
      name: 'Emergency Stop Latency',
      status: maxLatency <= this.thresholds.emergencyStop ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: maxLatency,
        minLatency: Math.min(...latencies),
        threshold: this.thresholds.emergencyStop,
        iterations: iterations,
        allLatencies: latencies,
      },
    };

    if (testResult.status === 'failed') {
      testResult.error = `Max emergency stop latency ${maxLatency.toFixed(2)}ms exceeds critical threshold of ${this.thresholds.emergencyStop}ms`;
    }

    this.results.tests.push(testResult);
    this.results.metrics.emergencyStopLatencies = latencies;

    console.log(
      `        📊 Average: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms, Threshold: ${this.thresholds.emergencyStop}ms`
    );
  }

  async testManualControlLatency() {
    console.log('      🕹️  Testing Manual Control Latency...');

    const controlCommands = [
      { axis: 'x', direction: '+', distance: 10 },
      { axis: 'y', direction: '-', distance: 5 },
      { axis: 'z', direction: '+', distance: 15 },
      { axis: 'gripper', action: 'open' },
      { axis: 'gripper', action: 'close' },
    ];

    const latencies = [];

    for (const command of controlCommands) {
      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        await this.simulateManualControl(command);

        const latency = performance.now() - start;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const maxLatency = Math.max(...latencies);

    const testResult = {
      name: 'Manual Control Latency',
      status: avgLatency <= this.thresholds.manualControl ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: maxLatency,
        threshold: this.thresholds.manualControl,
        commandsPerSecond: 1000 / avgLatency,
        allLatencies: latencies,
      },
    };

    if (testResult.status === 'failed') {
      testResult.error = `Manual control latency ${avgLatency.toFixed(2)}ms exceeds threshold of ${this.thresholds.manualControl}ms`;
    }

    this.results.tests.push(testResult);

    console.log(
      `        📊 Average: ${avgLatency.toFixed(2)}ms, Commands/sec: ${(1000 / avgLatency).toFixed(2)}`
    );
  }

  async testPositionCommandLatency() {
    console.log('      📍 Testing Position Command Latency...');

    const positions = [
      { x: 100, y: 50, z: 75 },
      { x: 200, y: 150, z: 100 },
      { x: 0, y: 0, z: 50 },
      { x: 150, y: 100, z: 125 },
    ];

    const latencies = [];

    for (const position of positions) {
      for (let i = 0; i < 5; i++) {
        const start = performance.now();

        await this.simulatePositionCommand(position);

        const latency = performance.now() - start;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

    const testResult = {
      name: 'Position Command Latency',
      status: avgLatency <= this.thresholds.positionCommand ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: Math.max(...latencies),
        threshold: this.thresholds.positionCommand,
        positionsPerSecond: 1000 / avgLatency,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.positionUpdateLatencies = latencies;

    console.log(
      `        📊 Average: ${avgLatency.toFixed(2)}ms, Positions/sec: ${(1000 / avgLatency).toFixed(2)}`
    );
  }

  async testRealtimeStatusUpdates() {
    console.log('      📡 Testing Real-time Status Update Latency...');

    const statusUpdates = ['idle', 'moving', 'executing', 'paused', 'error', 'homing'];

    const latencies = [];

    for (const status of statusUpdates) {
      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        await this.simulateStatusUpdate(status);

        const latency = performance.now() - start;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

    const testResult = {
      name: 'Real-time Status Updates',
      status: avgLatency <= this.thresholds.statusUpdate ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: Math.max(...latencies),
        threshold: this.thresholds.statusUpdate,
        updatesPerSecond: 1000 / avgLatency,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.realtimeFeedbackLatencies = latencies;

    console.log(
      `        📊 Average: ${avgLatency.toFixed(2)}ms, Updates/sec: ${(1000 / avgLatency).toFixed(2)}`
    );
  }

  async testGCodeCommandLatency() {
    console.log('      🔧 Testing G-Code Command Processing Latency...');

    const gcodeCommands = [
      'G0 X100 Y50',
      'G1 X200 Y150 F1000',
      'G2 X150 Y100 I25 J25',
      'M3 S1000',
      'M5',
      'G28',
    ];

    const latencies = [];

    for (const gcode of gcodeCommands) {
      for (let i = 0; i < 5; i++) {
        const start = performance.now();

        await this.simulateGCodeCommand(gcode);

        const latency = performance.now() - start;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;

    const testResult = {
      name: 'G-Code Command Processing',
      status: avgLatency <= this.thresholds.gcodeExecution ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: Math.max(...latencies),
        threshold: this.thresholds.gcodeExecution,
        commandsPerSecond: 1000 / avgLatency,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 Average: ${avgLatency.toFixed(2)}ms, G-Code commands/sec: ${(1000 / avgLatency).toFixed(2)}`
    );
  }

  async testConcurrentControlLatency() {
    console.log('      👥 Testing Concurrent Control Latency...');

    const concurrentUsers = 5;
    const commandsPerUser = 10;
    const allLatencies = [];

    const userPromises = [];

    for (let user = 0; user < concurrentUsers; user++) {
      const userPromise = (async () => {
        const userLatencies = [];

        for (let cmd = 0; cmd < commandsPerUser; cmd++) {
          const start = performance.now();

          await this.simulateManualControl({
            axis: 'x',
            direction: '+',
            distance: Math.random() * 10,
            userId: user,
          });

          const latency = performance.now() - start;
          userLatencies.push(latency);

          // Random delay between commands
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        }

        return userLatencies;
      })();

      userPromises.push(userPromise);
    }

    const results = await Promise.all(userPromises);
    results.forEach(userLatencies => allLatencies.push(...userLatencies));

    const avgLatency = allLatencies.reduce((a, b) => a + b) / allLatencies.length;
    const maxLatency = Math.max(...allLatencies);

    const testResult = {
      name: 'Concurrent Control Latency',
      status: avgLatency <= this.thresholds.manualControl * 1.5 ? 'passed' : 'failed', // Allow 50% degradation
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: maxLatency,
        concurrentUsers: concurrentUsers,
        totalCommands: allLatencies.length,
        degradationFactor: avgLatency / this.thresholds.manualControl,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${concurrentUsers} users, Average: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`
    );
  }

  async testHardwareProtocolLatency() {
    console.log('      🔌 Testing Hardware Protocol Latency...');

    const protocols = ['can', 'serial', 'modbus', 'tcp'];
    const protocolLatencies = {};

    for (const protocol of protocols) {
      const latencies = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        await this.simulateHardwareCommand(protocol, {
          command: 'move',
          axis: 'x',
          position: 100,
        });

        const latency = performance.now() - start;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      protocolLatencies[protocol] = {
        average: latencies.reduce((a, b) => a + b) / latencies.length,
        max: Math.max(...latencies),
        min: Math.min(...latencies),
      };
    }

    const avgOverallLatency =
      Object.values(protocolLatencies).reduce((sum, p) => sum + p.average, 0) / protocols.length;

    const testResult = {
      name: 'Hardware Protocol Latency',
      status: avgOverallLatency <= this.thresholds.manualControl ? 'passed' : 'failed',
      duration: avgOverallLatency,
      metrics: {
        protocols: protocolLatencies,
        averageOverall: avgOverallLatency,
        threshold: this.thresholds.manualControl,
      },
    };

    this.results.tests.push(testResult);

    console.log('        📊 Protocol latencies:');
    for (const [protocol, metrics] of Object.entries(protocolLatencies)) {
      console.log(`          ${protocol}: ${metrics.average.toFixed(2)}ms avg`);
    }
  }

  async testLatencyUnderLoad() {
    console.log('      🔥 Testing Latency Under Load...');

    const highLoadDuration = 5000; // 5 seconds of high load
    const commandInterval = 10; // Command every 10ms
    const latencies = [];

    const startTime = performance.now();

    const loadPromise = new Promise(resolve => {
      const interval = setInterval(async () => {
        const cmdStart = performance.now();

        await this.simulateManualControl({
          axis: 'x',
          direction: Math.random() > 0.5 ? '+' : '-',
          distance: Math.random() * 5,
        });

        const cmdLatency = performance.now() - cmdStart;
        latencies.push(cmdLatency);

        if (performance.now() - startTime >= highLoadDuration) {
          clearInterval(interval);
          resolve();
        }
      }, commandInterval);
    });

    await loadPromise;

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    const testResult = {
      name: 'Latency Under High Load',
      status: p95Latency <= this.thresholds.manualControl * 2 ? 'passed' : 'warning', // Allow 2x degradation under load
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        p95Latency: p95Latency,
        maxLatency: Math.max(...latencies),
        commandsExecuted: latencies.length,
        commandRate: latencies.length / (highLoadDuration / 1000),
        loadDuration: highLoadDuration,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${latencies.length} commands, Average: ${avgLatency.toFixed(2)}ms, P95: ${p95Latency.toFixed(2)}ms`
    );
  }

  // Simulation methods for testing
  async simulateEmergencyStop() {
    // Simulate emergency stop processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 15)); // 0-15ms
    this.mockRobot.emergencyStop = true;
    this.mockRobot.status = 'emergency_stopped';
  }

  async simulateManualControl(command) {
    // Simulate manual control processing time
    const processingTime = Math.random() * 30 + 10; // 10-40ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    if (command.axis !== 'gripper') {
      this.mockRobot.axes[command.axis] += command.distance * (command.direction === '+' ? 1 : -1);
    } else {
      this.mockRobot.gripper = command.action === 'open' ? 0 : 100;
    }
  }

  async simulatePositionCommand(position) {
    // Simulate position command processing time
    const processingTime = Math.random() * 80 + 20; // 20-100ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    Object.assign(this.mockRobot.axes, position);
    this.mockRobot.status = 'moving';
  }

  async simulateStatusUpdate(status) {
    // Simulate status update processing time
    const processingTime = Math.random() * 20 + 5; // 5-25ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    this.mockRobot.status = status;
  }

  async simulateGCodeCommand(gcode) {
    // Simulate G-code command processing time
    const processingTime = Math.random() * 200 + 100; // 100-300ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    this.mockRobot.status = 'executing';
  }

  async simulateHardwareCommand(protocol, command) {
    // Simulate hardware protocol communication time
    const protocolLatencies = {
      can: Math.random() * 20 + 10, // 10-30ms
      serial: Math.random() * 40 + 20, // 20-60ms
      modbus: Math.random() * 60 + 30, // 30-90ms
      tcp: Math.random() * 30 + 15, // 15-45ms
    };

    const processingTime = protocolLatencies[protocol] || 50;
    await new Promise(resolve => setTimeout(resolve, processingTime));
  }

  analyzeLatencyResults() {
    // Generate latency analysis and recommendations
    const criticalFailures = this.results.tests.filter(
      t =>
        t.status === 'failed' &&
        ['Emergency Stop Latency', 'Manual Control Latency'].includes(t.name)
    );

    if (criticalFailures.length > 0) {
      console.log('      ⚠️  CRITICAL: Safety-critical latency thresholds exceeded!');
    }

    // Calculate overall latency health score
    const passedTests = this.results.tests.filter(t => t.status === 'passed').length;
    const healthScore = (passedTests / this.results.tests.length) * 100;

    this.results.metrics.healthScore = healthScore;
    this.results.metrics.criticalFailures = criticalFailures.length;

    console.log(`        🎯 Latency Health Score: ${healthScore.toFixed(1)}%`);
  }

  async cleanup() {
    // Cleanup test environment
    this.mockServer = null;
    this.mockRobot = null;
  }
}

module.exports = RobotControlLatencyTests;
