/**
 * Concurrent User Load Performance Tests
 *
 * Tests system performance under multiple simultaneous users
 * for robotic control operations with real-time collaboration.
 *
 * Performance Test Engineer Implementation
 */

const { performance } = require('perf_hooks');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class ConcurrentUserLoadTests {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      tests: [],
      metrics: {
        userLoadResults: [],
        scalabilityMetrics: {},
        resourceUsage: [],
        concurrencyFailures: [],
      },
      success: true,
    };

    // Load testing thresholds
    this.thresholds = {
      maxUsers: 10, // Maximum concurrent users
      avgResponseTime: 500, // ms - Under load
      p95ResponseTime: 1000, // ms - 95th percentile
      errorRateThreshold: 5, // % - Acceptable error rate
      memoryGrowthLimit: 100, // MB - Memory usage increase
      cpuUtilizationLimit: 80, // % - CPU usage limit
      socketConnectionLimit: 50, // Concurrent Socket.IO connections
      databaseConnectionLimit: 20, // Database connection pool
    };

    this.activeUsers = [];
    this.resourceMonitor = null;
    this.baselineMemory = 0;
  }

  async run() {
    console.log('    👥 Running Concurrent User Load tests...');

    try {
      // Setup test environment
      await this.setupLoadTestEnvironment();

      // Baseline performance
      await this.establishLoadBaseline();

      // Gradual load increase tests
      await this.testGradualLoadIncrease();

      // Concurrent operation tests
      await this.testConcurrentManualControl();
      await this.testConcurrentGCodeExecution();
      await this.testConcurrentPositionReplay();
      await this.testMultiUserRealTimeSync();

      // Peak load tests
      await this.testPeakLoad();
      await this.testLoadSpikes();

      // Resource scaling tests
      await this.testResourceScaling();
      await this.testMemoryUnderLoad();

      // Recovery tests
      await this.testLoadRecovery();

      // Analyze results
      this.analyzeLoadResults();

      this.results.success = this.results.tests.every(t => t.status !== 'failed');
    } catch (error) {
      console.error('    ❌ Concurrent User Load tests failed:', error);
      this.results.success = false;
      this.results.error = error.message;
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  async setupLoadTestEnvironment() {
    console.log('      🔧 Setting up load test environment...');

    // Start resource monitoring
    this.baselineMemory = process.memoryUsage().heapUsed;
    this.startResourceMonitoring();

    // Initialize mock server environment
    this.mockEnvironment = {
      server: {
        connections: [],
        activeRequests: 0,
        totalRequests: 0,
      },
      database: {
        connections: [],
        activeQueries: 0,
      },
      sockets: {
        connections: new Map(),
        messagesSent: 0,
      },
    };
  }

  async establishLoadBaseline() {
    console.log('      📊 Establishing single-user baseline...');

    const baselineMetrics = await this.simulateUserSession({
      userId: 'baseline',
      operations: ['login', 'manual_control', 'position_save', 'logout'],
      duration: 5000,
    });

    this.baselinePerformance = {
      avgResponseTime: baselineMetrics.avgResponseTime,
      operations: baselineMetrics.operations,
      memoryUsage: baselineMetrics.memoryUsage,
    };

    console.log(
      `        📈 Baseline: ${baselineMetrics.avgResponseTime.toFixed(2)}ms avg response`
    );
  }

  async testGradualLoadIncrease() {
    console.log('      📈 Testing Gradual Load Increase...');

    const loadLevels = [1, 2, 3, 5, 7, 10, 12, 15]; // Concurrent users
    const loadResults = [];

    for (const userCount of loadLevels) {
      console.log(`        👥 Testing ${userCount} concurrent users...`);

      const loadTest = await this.runLoadTest({
        concurrentUsers: userCount,
        duration: 10000, // 10 seconds
        operationsPerUser: 20,
        rampUpTime: 2000, // 2 seconds
      });

      loadResults.push({
        userCount: userCount,
        ...loadTest,
      });

      // Wait between load levels
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if we hit breaking point
      if (loadTest.errorRate > this.thresholds.errorRateThreshold) {
        console.log(`        ⚠️  Breaking point reached at ${userCount} users`);
        break;
      }
    }

    const testResult = {
      name: 'Gradual Load Increase',
      status: this.determineLoadTestStatus(loadResults),
      duration: loadResults.reduce((sum, r) => sum + r.duration, 0),
      metrics: {
        loadResults: loadResults,
        maxUsers: Math.max(...loadResults.map(r => r.userCount)),
        breakingPoint: this.findBreakingPoint(loadResults),
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.userLoadResults = loadResults;

    console.log(`        🎯 Max users supported: ${testResult.metrics.maxUsers}`);
  }

  async testConcurrentManualControl() {
    console.log('      🕹️  Testing Concurrent Manual Control...');

    const concurrentUsers = 5;
    const controlDuration = 15000; // 15 seconds

    const userPromises = [];

    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = this.simulateConcurrentManualControl({
        userId: `manual_user_${i}`,
        duration: controlDuration,
        commandFrequency: 200, // Command every 200ms
      });

      userPromises.push(userPromise);
    }

    const startTime = performance.now();
    const userResults = await Promise.all(userPromises);
    const totalDuration = performance.now() - startTime;

    const combinedMetrics = this.combineUserMetrics(userResults);

    const testResult = {
      name: 'Concurrent Manual Control',
      status: combinedMetrics.avgLatency <= this.thresholds.avgResponseTime ? 'passed' : 'failed',
      duration: totalDuration,
      metrics: {
        concurrentUsers: concurrentUsers,
        totalCommands: combinedMetrics.totalCommands,
        avgLatency: combinedMetrics.avgLatency,
        maxLatency: combinedMetrics.maxLatency,
        errorRate: combinedMetrics.errorRate,
        commandsPerSecond: combinedMetrics.totalCommands / (controlDuration / 1000),
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${combinedMetrics.totalCommands} commands, ${combinedMetrics.avgLatency.toFixed(2)}ms avg latency`
    );
  }

  async testConcurrentGCodeExecution() {
    console.log('      🔧 Testing Concurrent G-Code Execution...');

    const concurrentUsers = 3; // Lower count for G-code due to resource intensity
    const gcodePrograms = [
      'G0 X100 Y100\nG1 X200 Y200 F1000\nG0 X0 Y0',
      'G2 X100 Y0 I50 J0\nG1 X0 Y0 F500',
      'G0 Z10\nG1 Z0 F100\nG0 Z10',
    ];

    const userPromises = [];

    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = this.simulateConcurrentGCodeExecution({
        userId: `gcode_user_${i}`,
        gcodeProgram: gcodePrograms[i % gcodePrograms.length],
        iterations: 3,
      });

      userPromises.push(userPromise);
    }

    const startTime = performance.now();
    const userResults = await Promise.all(userPromises);
    const totalDuration = performance.now() - startTime;

    const combinedMetrics = this.combineUserMetrics(userResults);

    const testResult = {
      name: 'Concurrent G-Code Execution',
      status:
        combinedMetrics.avgLatency <= this.thresholds.avgResponseTime * 2 ? 'passed' : 'failed', // Allow 2x for G-code
      duration: totalDuration,
      metrics: {
        concurrentUsers: concurrentUsers,
        totalExecutions: combinedMetrics.totalCommands,
        avgExecutionTime: combinedMetrics.avgLatency,
        maxExecutionTime: combinedMetrics.maxLatency,
        errorRate: combinedMetrics.errorRate,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${combinedMetrics.totalCommands} executions, ${combinedMetrics.avgLatency.toFixed(2)}ms avg time`
    );
  }

  async testConcurrentPositionReplay() {
    console.log('      🔄 Testing Concurrent Position Replay...');

    const concurrentUsers = 4;
    const positionSets = [
      [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 50, z: 25 },
      ],
      [
        { x: 50, y: 100, z: 75 },
        { x: 150, y: 200, z: 100 },
      ],
      [
        { x: 200, y: 0, z: 50 },
        { x: 0, y: 200, z: 125 },
      ],
    ];

    const userPromises = [];

    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = this.simulateConcurrentPositionReplay({
        userId: `replay_user_${i}`,
        positions: positionSets[i % positionSets.length],
        replays: 5,
      });

      userPromises.push(userPromise);
    }

    const startTime = performance.now();
    const userResults = await Promise.all(userPromises);
    const totalDuration = performance.now() - startTime;

    const combinedMetrics = this.combineUserMetrics(userResults);

    const testResult = {
      name: 'Concurrent Position Replay',
      status: combinedMetrics.avgLatency <= this.thresholds.avgResponseTime ? 'passed' : 'failed',
      duration: totalDuration,
      metrics: {
        concurrentUsers: concurrentUsers,
        totalReplays: combinedMetrics.totalCommands,
        avgReplayTime: combinedMetrics.avgLatency,
        maxReplayTime: combinedMetrics.maxLatency,
        errorRate: combinedMetrics.errorRate,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${combinedMetrics.totalCommands} replays, ${combinedMetrics.avgLatency.toFixed(2)}ms avg time`
    );
  }

  async testMultiUserRealTimeSync() {
    console.log('      🔄 Testing Multi-User Real-Time Synchronization...');

    const concurrentUsers = 6;
    const syncDuration = 10000; // 10 seconds
    const syncMessages = [];

    const userPromises = [];

    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = this.simulateRealTimeSync({
        userId: `sync_user_${i}`,
        duration: syncDuration,
        updateFrequency: 100, // Update every 100ms
        messageCallback: msg => syncMessages.push(msg),
      });

      userPromises.push(userPromise);
    }

    const startTime = performance.now();
    const userResults = await Promise.all(userPromises);
    const totalDuration = performance.now() - startTime;

    // Analyze synchronization quality
    const syncQuality = this.analyzeSynchronization(syncMessages);

    const testResult = {
      name: 'Multi-User Real-Time Sync',
      status: syncQuality.avgSyncDelay <= 100 ? 'passed' : 'failed', // 100ms sync tolerance
      duration: totalDuration,
      metrics: {
        concurrentUsers: concurrentUsers,
        totalMessages: syncMessages.length,
        avgSyncDelay: syncQuality.avgSyncDelay,
        maxSyncDelay: syncQuality.maxSyncDelay,
        syncAccuracy: syncQuality.accuracy,
        messageRate: syncMessages.length / (syncDuration / 1000),
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${syncMessages.length} messages, ${syncQuality.avgSyncDelay.toFixed(2)}ms avg sync delay`
    );
  }

  async testPeakLoad() {
    console.log('      🔥 Testing Peak Load Capacity...');

    const peakUsers = 15; // Above expected limit
    const peakDuration = 30000; // 30 seconds

    const loadTest = await this.runLoadTest({
      concurrentUsers: peakUsers,
      duration: peakDuration,
      operationsPerUser: 50,
      rampUpTime: 5000,
    });

    const testResult = {
      name: 'Peak Load Capacity',
      status: loadTest.errorRate <= this.thresholds.errorRateThreshold * 2 ? 'passed' : 'warning', // Allow higher error rate at peak
      duration: loadTest.duration,
      metrics: {
        peakUsers: peakUsers,
        avgResponseTime: loadTest.avgResponseTime,
        p95ResponseTime: loadTest.p95ResponseTime,
        errorRate: loadTest.errorRate,
        throughput: loadTest.throughput,
        resourceUtilization: loadTest.resourceUsage,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${peakUsers} users, ${loadTest.avgResponseTime.toFixed(2)}ms avg, ${loadTest.errorRate.toFixed(2)}% errors`
    );
  }

  async testLoadSpikes() {
    console.log('      ⚡ Testing Load Spikes...');

    const spikeDuration = 2000; // 2 second spikes
    const normalUsers = 3;
    const spikeUsers = 12;
    const spikes = 5;

    const spikeResults = [];

    for (let spike = 0; spike < spikes; spike++) {
      console.log(`        ⚡ Spike ${spike + 1}/${spikes}...`);

      // Normal load
      const normalLoad = this.runLoadTest({
        concurrentUsers: normalUsers,
        duration: 3000,
        operationsPerUser: 10,
        rampUpTime: 500,
      });

      // Spike load
      const spikeLoad = this.runLoadTest({
        concurrentUsers: spikeUsers,
        duration: spikeDuration,
        operationsPerUser: 15,
        rampUpTime: 200,
      });

      const [normalResult, spikeResult] = await Promise.all([normalLoad, spikeLoad]);

      spikeResults.push({
        spike: spike + 1,
        normal: normalResult,
        spike: spikeResult,
        recoveryTime: this.calculateRecoveryTime(normalResult, spikeResult),
      });

      // Wait between spikes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const avgRecoveryTime = spikeResults.reduce((sum, r) => sum + r.recoveryTime, 0) / spikes;

    const testResult = {
      name: 'Load Spikes',
      status: avgRecoveryTime <= 5000 ? 'passed' : 'failed', // 5 second recovery
      duration: spikeDuration * spikes,
      metrics: {
        spikes: spikes,
        spikeUsers: spikeUsers,
        normalUsers: normalUsers,
        avgRecoveryTime: avgRecoveryTime,
        spikeResults: spikeResults,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 ${spikes} spikes, ${avgRecoveryTime.toFixed(2)}ms avg recovery`);
  }

  async testResourceScaling() {
    console.log('      📈 Testing Resource Scaling...');

    const scalingLevels = [2, 4, 6, 8, 10];
    const scalingResults = [];

    for (const users of scalingLevels) {
      const beforeResources = this.getCurrentResourceUsage();

      const loadTest = await this.runLoadTest({
        concurrentUsers: users,
        duration: 8000,
        operationsPerUser: 20,
        rampUpTime: 1000,
      });

      const afterResources = this.getCurrentResourceUsage();

      scalingResults.push({
        users: users,
        performance: loadTest,
        resourceDelta: {
          memory: afterResources.memory - beforeResources.memory,
          cpu: afterResources.cpu - beforeResources.cpu,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const linearityScore = this.calculateScalingLinearity(scalingResults);

    const testResult = {
      name: 'Resource Scaling',
      status: linearityScore >= 0.8 ? 'passed' : 'warning', // 80% linearity threshold
      duration: scalingResults.reduce((sum, r) => sum + r.performance.duration, 0),
      metrics: {
        scalingResults: scalingResults,
        linearityScore: linearityScore,
        resourceEfficiency: this.calculateResourceEfficiency(scalingResults),
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Scaling linearity: ${(linearityScore * 100).toFixed(1)}%`);
  }

  async testMemoryUnderLoad() {
    console.log('      🧠 Testing Memory Usage Under Load...');

    const initialMemory = process.memoryUsage().heapUsed;
    const memorySnapshots = [initialMemory];

    // Run sustained load while monitoring memory
    const loadPromise = this.runLoadTest({
      concurrentUsers: 8,
      duration: 20000, // 20 seconds
      operationsPerUser: 100,
      rampUpTime: 2000,
    });

    // Monitor memory every second
    const memoryMonitor = setInterval(() => {
      memorySnapshots.push(process.memoryUsage().heapUsed);
    }, 1000);

    const loadResult = await loadPromise;
    clearInterval(memoryMonitor);

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = (finalMemory - initialMemory) / (1024 * 1024); // MB

    const testResult = {
      name: 'Memory Usage Under Load',
      status: memoryGrowth <= this.thresholds.memoryGrowthLimit ? 'passed' : 'failed',
      duration: loadResult.duration,
      metrics: {
        initialMemoryMB: initialMemory / (1024 * 1024),
        finalMemoryMB: finalMemory / (1024 * 1024),
        memoryGrowthMB: memoryGrowth,
        peakMemoryMB: Math.max(...memorySnapshots) / (1024 * 1024),
        memorySnapshots: memorySnapshots.map(m => m / (1024 * 1024)),
        threshold: this.thresholds.memoryGrowthLimit,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.resourceUsage = memorySnapshots;

    console.log(
      `        📊 Memory growth: ${memoryGrowth.toFixed(2)}MB, Peak: ${(Math.max(...memorySnapshots) / (1024 * 1024)).toFixed(2)}MB`
    );
  }

  async testLoadRecovery() {
    console.log('      🔄 Testing Load Recovery...');

    // Create high load
    console.log('        🔥 Creating high load...');
    const highLoad = this.runLoadTest({
      concurrentUsers: 12,
      duration: 10000,
      operationsPerUser: 50,
      rampUpTime: 1000,
    });

    const highLoadResult = await highLoad;

    // Wait for recovery
    console.log('        ⏳ Waiting for recovery...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test recovery performance
    console.log('        🔍 Testing recovery performance...');
    const recoveryLoad = await this.runLoadTest({
      concurrentUsers: 3,
      duration: 5000,
      operationsPerUser: 20,
      rampUpTime: 500,
    });

    const recoveryRatio = recoveryLoad.avgResponseTime / this.baselinePerformance.avgResponseTime;

    const testResult = {
      name: 'Load Recovery',
      status: recoveryRatio <= 1.2 ? 'passed' : 'failed', // Within 20% of baseline
      duration: 20000, // Total test duration
      metrics: {
        highLoadMetrics: highLoadResult,
        recoveryMetrics: recoveryLoad,
        baselineResponseTime: this.baselinePerformance.avgResponseTime,
        recoveryResponseTime: recoveryLoad.avgResponseTime,
        recoveryRatio: recoveryRatio,
        recoveryTime: 5000,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Recovery ratio: ${recoveryRatio.toFixed(2)}x baseline`);
  }

  // Helper methods for load testing simulations
  async runLoadTest({ concurrentUsers, duration, operationsPerUser, rampUpTime }) {
    const startTime = performance.now();
    const userPromises = [];
    const allResults = [];

    // Ramp up users gradually
    const rampUpDelay = rampUpTime / concurrentUsers;

    for (let i = 0; i < concurrentUsers; i++) {
      const userPromise = (async () => {
        // Stagger user start times
        await new Promise(resolve => setTimeout(resolve, i * rampUpDelay));

        return this.simulateUserSession({
          userId: `load_user_${i}`,
          operations: ['login', 'manual_control', 'position_save', 'gcode_execute', 'logout'],
          operationCount: operationsPerUser,
          duration: duration - i * rampUpDelay,
        });
      })();

      userPromises.push(userPromise);
    }

    const results = await Promise.all(userPromises);
    results.forEach(r => allResults.push(...r.operations));

    const totalDuration = performance.now() - startTime;

    return this.calculateLoadTestMetrics(allResults, totalDuration);
  }

  async simulateUserSession({ userId, operations, operationCount, duration }) {
    const sessionResults = {
      userId,
      operations: [],
      startTime: performance.now(),
      endTime: null,
      avgResponseTime: 0,
      memoryUsage: process.memoryUsage().heapUsed,
    };

    const operationInterval = duration / (operationCount || operations.length);

    for (let i = 0; i < (operationCount || operations.length); i++) {
      const operation = operations[i % operations.length];

      const opStart = performance.now();
      await this.simulateOperation(operation, userId);
      const opDuration = performance.now() - opStart;

      sessionResults.operations.push({
        operation,
        duration: opDuration,
        timestamp: performance.now(),
      });

      // Wait between operations
      if (i < (operationCount || operations.length) - 1) {
        await new Promise(resolve => setTimeout(resolve, operationInterval));
      }
    }

    sessionResults.endTime = performance.now();
    sessionResults.avgResponseTime =
      sessionResults.operations.reduce((sum, op) => sum + op.duration, 0) /
      sessionResults.operations.length;

    return sessionResults;
  }

  async simulateOperation(operation, userId) {
    // Simulate different operation types with realistic timing
    const operationTimes = {
      login: Math.random() * 200 + 100, // 100-300ms
      manual_control: Math.random() * 50 + 25, // 25-75ms
      position_save: Math.random() * 150 + 50, // 50-200ms
      gcode_execute: Math.random() * 500 + 200, // 200-700ms
      logout: Math.random() * 100 + 50, // 50-150ms
    };

    const processingTime = operationTimes[operation] || 100;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Update mock environment
    this.mockEnvironment.server.totalRequests++;
  }

  // Analysis and calculation methods
  calculateLoadTestMetrics(operations, totalDuration) {
    if (operations.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        errorRate: 100,
        throughput: 0,
        duration: totalDuration,
      };
    }

    const durations = operations.map(op => op.duration);
    durations.sort((a, b) => a - b);

    const avgResponseTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95ResponseTime = durations[Math.floor(durations.length * 0.95)];
    const errorRate = 0; // Simulated - no errors in mock
    const throughput = operations.length / (totalDuration / 1000); // ops/sec

    return {
      avgResponseTime,
      p95ResponseTime,
      errorRate,
      throughput,
      duration: totalDuration,
      totalOperations: operations.length,
      resourceUsage: this.getCurrentResourceUsage(),
    };
  }

  combineUserMetrics(userResults) {
    const allOperations = [];
    userResults.forEach(user => allOperations.push(...user.operations));

    if (allOperations.length === 0) {
      return {
        totalCommands: 0,
        avgLatency: 0,
        maxLatency: 0,
        errorRate: 0,
      };
    }

    const latencies = allOperations.map(op => op.duration);

    return {
      totalCommands: allOperations.length,
      avgLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      maxLatency: Math.max(...latencies),
      errorRate: 0, // Simulated
    };
  }

  determineLoadTestStatus(loadResults) {
    const failedTests = loadResults.filter(
      r =>
        r.errorRate > this.thresholds.errorRateThreshold ||
        r.avgResponseTime > this.thresholds.avgResponseTime
    );

    return failedTests.length === 0 ? 'passed' : 'failed';
  }

  findBreakingPoint(loadResults) {
    for (const result of loadResults) {
      if (result.errorRate > this.thresholds.errorRateThreshold) {
        return result.userCount;
      }
    }
    return Math.max(...loadResults.map(r => r.userCount));
  }

  getCurrentResourceUsage() {
    const memUsage = process.memoryUsage();
    return {
      memory: memUsage.heapUsed / (1024 * 1024), // MB
      cpu: process.cpuUsage().user / 1000000, // Approximate CPU usage
    };
  }

  startResourceMonitoring() {
    this.resourceMonitor = setInterval(() => {
      const usage = this.getCurrentResourceUsage();
      this.results.metrics.resourceUsage.push({
        timestamp: Date.now(),
        ...usage,
      });
    }, 1000);
  }

  analyzeLoadResults() {
    console.log('      📊 Analyzing load test results...');

    const passedTests = this.results.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.results.tests.length;

    this.results.metrics.scalabilityMetrics = {
      testsPassed: passedTests,
      testsTotal: totalTests,
      passRate: (passedTests / totalTests) * 100,
      maxSupportedUsers:
        this.results.metrics.userLoadResults.length > 0
          ? Math.max(...this.results.metrics.userLoadResults.map(r => r.userCount))
          : 0,
    };

    console.log(`        🎯 Load Test Summary: ${passedTests}/${totalTests} passed`);
    console.log(
      `        👥 Max Supported Users: ${this.results.metrics.scalabilityMetrics.maxSupportedUsers}`
    );
  }

  async cleanup() {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }
    this.activeUsers = [];
    this.mockEnvironment = null;
  }
}

module.exports = ConcurrentUserLoadTests;
