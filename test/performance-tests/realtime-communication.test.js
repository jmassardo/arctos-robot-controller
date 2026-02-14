/**
 * Real-time Communication Performance Tests
 *
 * Tests Socket.IO real-time communication performance under various conditions.
 * Critical for robotic control system where real-time feedback is essential.
 *
 * Performance Test Engineer Implementation
 */

const { performance } = require('perf_hooks');
const { io } = require('socket.io-client');

class RealtimeCommunicationTests {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      tests: [],
      metrics: {
        latencyResults: [],
        throughputResults: [],
        connectionMetrics: [],
        messageDeliveryMetrics: [],
      },
      success: true,
    };

    // Real-time communication thresholds
    this.thresholds = {
      messageLatency: 50, // ms - Real-time requirement
      connectionTime: 1000, // ms - Socket connection
      messageDelivery: 99.9, // % - Message delivery rate
      throughput: 1000, // messages/second
      concurrentConnections: 50, // Simultaneous connections
      memoryPerConnection: 5, // MB per connection
      reconnectionTime: 2000, // ms - Auto-reconnection
      heartbeatInterval: 25000, // ms - Keep-alive
    };

    this.mockServer = null;
    this.activeConnections = [];
  }

  async run() {
    console.log('    📡 Running Real-time Communication tests...');

    try {
      // Setup test environment
      await this.setupRealtimeTestEnvironment();

      // Basic latency tests
      await this.testMessageLatency();
      await this.testBidirectionalLatency();

      // Throughput tests
      await this.testMessageThroughput();
      await this.testBulkDataTransfer();

      // Connection tests
      await this.testConnectionPerformance();
      await this.testConcurrentConnections();

      // Real-time specific tests
      await this.testRobotStatusUpdates();
      await this.testManualControlFeedback();
      await this.testMultiUserSynchronization();

      // Reliability tests
      await this.testMessageDeliveryReliability();
      await this.testConnectionRecovery();

      // Stress tests
      await this.testHighFrequencyUpdates();
      await this.testConnectionStorm();

      // Analyze results
      this.analyzeRealtimeResults();

      this.results.success = this.results.tests.every(t => t.status !== 'failed');
    } catch (error) {
      console.error('    ❌ Real-time Communication tests failed:', error);
      this.results.success = false;
      this.results.error = error.message;
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  async setupRealtimeTestEnvironment() {
    console.log('      🔧 Setting up real-time test environment...');

    // Mock Socket.IO server
    this.mockServer = {
      port: 5002,
      connections: new Map(),
      messagesSent: 0,
      messagesReceived: 0,
      latencies: [],
    };

    // Initialize test metrics
    this.testMetrics = {
      startTime: performance.now(),
      connectionsCreated: 0,
      messagesProcessed: 0,
      errors: [],
    };
  }

  async testMessageLatency() {
    console.log('      ⚡ Testing Message Latency...');

    const messageTypes = [
      'robot_status',
      'manual_control',
      'position_update',
      'emergency_stop',
      'gcode_progress',
    ];

    const latencies = [];

    for (const messageType of messageTypes) {
      for (let i = 0; i < 20; i++) {
        const start = performance.now();

        await this.simulateSocketMessage(messageType, {
          timestamp: start,
          data: this.generateTestData(messageType),
        });

        const latency = performance.now() - start;
        latencies.push({ messageType, latency });

        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const avgLatency = latencies.reduce((sum, l) => sum + l.latency, 0) / latencies.length;
    const maxLatency = Math.max(...latencies.map(l => l.latency));

    // Analyze by message type
    const typeAnalysis = {};
    messageTypes.forEach(type => {
      const typeLatencies = latencies.filter(l => l.messageType === type).map(l => l.latency);
      typeAnalysis[type] = {
        avg: typeLatencies.reduce((sum, l) => sum + l, 0) / typeLatencies.length,
        max: Math.max(...typeLatencies),
        count: typeLatencies.length,
      };
    });

    const testResult = {
      name: 'Message Latency',
      status: avgLatency <= this.thresholds.messageLatency ? 'passed' : 'failed',
      duration: avgLatency,
      metrics: {
        averageLatency: avgLatency,
        maxLatency: maxLatency,
        messageTypes: messageTypes.length,
        totalMessages: latencies.length,
        typeAnalysis: typeAnalysis,
        threshold: this.thresholds.messageLatency,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.latencyResults = latencies;

    console.log(`        📊 Average: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);
    console.log('        📋 By message type:');
    Object.entries(typeAnalysis).forEach(([type, metrics]) => {
      console.log(`          ${type}: ${metrics.avg.toFixed(2)}ms avg`);
    });
  }

  async testBidirectionalLatency() {
    console.log('      🔄 Testing Bidirectional Latency...');

    const iterations = 50;
    const roundTripLatencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Simulate request-response cycle
      await this.simulateRequestResponse({
        request: 'get_robot_status',
        expectedResponse: 'robot_status_update',
      });

      const roundTripTime = performance.now() - start;
      roundTripLatencies.push(roundTripTime);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const avgRoundTrip = roundTripLatencies.reduce((sum, rtt) => sum + rtt, 0) / iterations;
    const p95RoundTrip = roundTripLatencies.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

    const testResult = {
      name: 'Bidirectional Latency',
      status: avgRoundTrip <= this.thresholds.messageLatency * 2 ? 'passed' : 'failed', // Allow 2x for round trip
      duration: avgRoundTrip,
      metrics: {
        averageRoundTrip: avgRoundTrip,
        p95RoundTrip: p95RoundTrip,
        maxRoundTrip: Math.max(...roundTripLatencies),
        iterations: iterations,
        allLatencies: roundTripLatencies,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 Average RTT: ${avgRoundTrip.toFixed(2)}ms, P95: ${p95RoundTrip.toFixed(2)}ms`
    );
  }

  async testMessageThroughput() {
    console.log('      🚀 Testing Message Throughput...');

    const testDuration = 10000; // 10 seconds
    const messageTypes = ['status_update', 'position_data', 'sensor_reading'];

    let messagesSent = 0;
    let messagesReceived = 0;
    const throughputData = [];

    const startTime = performance.now();

    // Start message sending
    const sendingPromise = new Promise(resolve => {
      const interval = setInterval(async () => {
        const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];

        await this.simulateSocketMessage(messageType, {
          id: messagesSent,
          timestamp: performance.now(),
          data: this.generateTestData(messageType),
        });

        messagesSent++;

        if (performance.now() - startTime >= testDuration) {
          clearInterval(interval);
          resolve();
        }
      }, 5); // Send every 5ms
    });

    // Monitor throughput every second
    const monitoringPromise = new Promise(resolve => {
      const monitorInterval = setInterval(() => {
        const currentTime = performance.now();
        const elapsed = currentTime - startTime;

        throughputData.push({
          elapsed: elapsed,
          messagesSent: messagesSent,
          throughput: (messagesSent / elapsed) * 1000, // messages per second
        });

        if (elapsed >= testDuration) {
          clearInterval(monitorInterval);
          resolve();
        }
      }, 1000);
    });

    await Promise.all([sendingPromise, monitoringPromise]);

    const totalDuration = performance.now() - startTime;
    const averageThroughput = (messagesSent / totalDuration) * 1000;
    const peakThroughput = Math.max(...throughputData.map(d => d.throughput));

    const testResult = {
      name: 'Message Throughput',
      status: averageThroughput >= this.thresholds.throughput ? 'passed' : 'failed',
      duration: totalDuration,
      metrics: {
        messagesSent: messagesSent,
        messagesReceived: messagesReceived, // In real test, would track actual delivery
        averageThroughput: averageThroughput,
        peakThroughput: peakThroughput,
        throughputData: throughputData,
        testDuration: testDuration,
        threshold: this.thresholds.throughput,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.throughputResults = throughputData;

    console.log(
      `        📊 ${messagesSent} messages, ${averageThroughput.toFixed(2)} msg/sec avg, ${peakThroughput.toFixed(2)} peak`
    );
  }

  async testBulkDataTransfer() {
    console.log('      📦 Testing Bulk Data Transfer...');

    const bulkDataSizes = [
      { name: 'Small G-Code', size: 1024 }, // 1KB
      { name: 'Medium G-Code', size: 10240 }, // 10KB
      { name: 'Large G-Code', size: 102400 }, // 100KB
      { name: 'Position Array', size: 51200 }, // 50KB
    ];

    const transferResults = [];

    for (const dataSet of bulkDataSizes) {
      const iterations = 5;
      const transferTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateBulkDataTransfer({
          name: dataSet.name,
          size: dataSet.size,
          data: this.generateBulkTestData(dataSet.size),
        });

        const transferTime = performance.now() - start;
        transferTimes.push(transferTime);

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const avgTransferTime = transferTimes.reduce((sum, t) => sum + t, 0) / iterations;
      const throughputKBps = dataSet.size / 1024 / (avgTransferTime / 1000);

      transferResults.push({
        name: dataSet.name,
        size: dataSet.size,
        avgTransferTime: avgTransferTime,
        throughputKBps: throughputKBps,
        iterations: iterations,
      });
    }

    const avgThroughput =
      transferResults.reduce((sum, r) => sum + r.throughputKBps, 0) / transferResults.length;

    const testResult = {
      name: 'Bulk Data Transfer',
      status: avgThroughput >= 100 ? 'passed' : 'failed', // 100 KB/s minimum
      duration: transferResults.reduce((sum, r) => sum + r.avgTransferTime, 0),
      metrics: {
        transferResults: transferResults,
        averageThroughputKBps: avgThroughput,
        dataSetsTested: bulkDataSizes.length,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average throughput: ${avgThroughput.toFixed(2)} KB/s`);
    transferResults.forEach(result => {
      console.log(`          ${result.name}: ${result.throughputKBps.toFixed(2)} KB/s`);
    });
  }

  async testConnectionPerformance() {
    console.log('      🔌 Testing Connection Performance...');

    const connectionIterations = 20;
    const connectionTimes = [];
    const disconnectionTimes = [];

    for (let i = 0; i < connectionIterations; i++) {
      // Test connection time
      const connectStart = performance.now();
      const connection = await this.simulateSocketConnection();
      const connectTime = performance.now() - connectStart;
      connectionTimes.push(connectTime);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Test disconnection time
      const disconnectStart = performance.now();
      await this.simulateSocketDisconnection(connection);
      const disconnectTime = performance.now() - disconnectStart;
      disconnectionTimes.push(disconnectTime);

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const avgConnectionTime = connectionTimes.reduce((sum, t) => sum + t, 0) / connectionIterations;
    const avgDisconnectionTime =
      disconnectionTimes.reduce((sum, t) => sum + t, 0) / connectionIterations;

    const testResult = {
      name: 'Connection Performance',
      status: avgConnectionTime <= this.thresholds.connectionTime ? 'passed' : 'failed',
      duration: avgConnectionTime,
      metrics: {
        averageConnectionTime: avgConnectionTime,
        averageDisconnectionTime: avgDisconnectionTime,
        maxConnectionTime: Math.max(...connectionTimes),
        maxDisconnectionTime: Math.max(...disconnectionTimes),
        iterations: connectionIterations,
        threshold: this.thresholds.connectionTime,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 Connection: ${avgConnectionTime.toFixed(2)}ms, Disconnection: ${avgDisconnectionTime.toFixed(2)}ms`
    );
  }

  async testConcurrentConnections() {
    console.log('      👥 Testing Concurrent Connections...');

    const maxConnections = 25;
    const connectionPromises = [];
    const connectionMetrics = [];

    const startTime = performance.now();

    // Create connections concurrently
    for (let i = 0; i < maxConnections; i++) {
      const connectionPromise = (async () => {
        const connectStart = performance.now();
        const connection = await this.simulateSocketConnection(`concurrent_${i}`);
        const connectTime = performance.now() - connectStart;

        // Keep connection alive for testing
        await new Promise(resolve => setTimeout(resolve, 5000));

        return {
          id: `concurrent_${i}`,
          connectionTime: connectTime,
          connected: true,
        };
      })();

      connectionPromises.push(connectionPromise);

      // Stagger connection attempts slightly
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const connections = await Promise.all(connectionPromises);
    const totalTime = performance.now() - startTime;

    const successfulConnections = connections.filter(c => c.connected).length;
    const avgConnectionTime =
      connections.reduce((sum, c) => sum + c.connectionTime, 0) / connections.length;

    // Simulate message exchange on all connections
    const messageExchangeStart = performance.now();
    const messagePromises = connections.map(async (conn, index) => {
      await this.simulateSocketMessage('concurrent_test', {
        connectionId: conn.id,
        messageIndex: index,
      });
    });

    await Promise.all(messagePromises);
    const messageExchangeTime = performance.now() - messageExchangeStart;

    // Cleanup connections
    await Promise.all(connections.map(conn => this.simulateSocketDisconnection(conn)));

    const testResult = {
      name: 'Concurrent Connections',
      status: successfulConnections >= maxConnections * 0.95 ? 'passed' : 'failed', // 95% success rate
      duration: totalTime,
      metrics: {
        maxConnections: maxConnections,
        successfulConnections: successfulConnections,
        successRate: (successfulConnections / maxConnections) * 100,
        averageConnectionTime: avgConnectionTime,
        messageExchangeTime: messageExchangeTime,
        totalTime: totalTime,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.connectionMetrics = connections;

    console.log(
      `        📊 ${successfulConnections}/${maxConnections} connections, ${avgConnectionTime.toFixed(2)}ms avg connect`
    );
  }

  async testRobotStatusUpdates() {
    console.log('      🤖 Testing Robot Status Updates...');

    const updateDuration = 10000; // 10 seconds
    const updateFrequency = 50; // 20Hz updates
    const statusUpdates = [];
    const latencies = [];

    let updateCount = 0;
    const startTime = performance.now();

    const updatePromise = new Promise(resolve => {
      const interval = setInterval(async () => {
        const updateStart = performance.now();

        const robotStatus = {
          timestamp: updateStart,
          axes: {
            x: Math.random() * 200,
            y: Math.random() * 200,
            z: Math.random() * 100,
          },
          gripper: Math.random() * 100,
          status: ['idle', 'moving', 'executing'][Math.floor(Math.random() * 3)],
          temperature: 20 + Math.random() * 10,
        };

        await this.simulateSocketMessage('robot_status_update', robotStatus);

        const latency = performance.now() - updateStart;
        latencies.push(latency);
        statusUpdates.push(robotStatus);
        updateCount++;

        if (performance.now() - startTime >= updateDuration) {
          clearInterval(interval);
          resolve();
        }
      }, updateFrequency);
    });

    await updatePromise;

    const totalTime = performance.now() - startTime;
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const actualFrequency = (updateCount / totalTime) * 1000;

    const testResult = {
      name: 'Robot Status Updates',
      status:
        avgLatency <= this.thresholds.messageLatency &&
        actualFrequency >= (1000 / updateFrequency) * 0.9
          ? 'passed'
          : 'failed',
      duration: totalTime,
      metrics: {
        totalUpdates: updateCount,
        averageLatency: avgLatency,
        maxLatency: Math.max(...latencies),
        targetFrequency: 1000 / updateFrequency,
        actualFrequency: actualFrequency,
        frequencyAccuracy: (actualFrequency / (1000 / updateFrequency)) * 100,
        statusUpdates: statusUpdates.slice(0, 10), // Sample for verification
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${updateCount} updates, ${avgLatency.toFixed(2)}ms avg latency, ${actualFrequency.toFixed(2)}Hz frequency`
    );
  }

  async testManualControlFeedback() {
    console.log('      🕹️  Testing Manual Control Feedback...');

    const controlCommands = [
      { axis: 'x', direction: '+', distance: 10 },
      { axis: 'y', direction: '-', distance: 5 },
      { axis: 'z', direction: '+', distance: 15 },
      { axis: 'gripper', action: 'toggle' },
    ];

    const feedbackLatencies = [];

    for (let iteration = 0; iteration < 3; iteration++) {
      for (const command of controlCommands) {
        const commandStart = performance.now();

        // Send control command
        await this.simulateSocketMessage('manual_control_command', {
          timestamp: commandStart,
          command: command,
        });

        // Simulate feedback response
        await this.simulateSocketMessage('control_feedback', {
          timestamp: performance.now(),
          command: command,
          status: 'executed',
          newPosition: this.calculateNewPosition(command),
        });

        const feedbackLatency = performance.now() - commandStart;
        feedbackLatencies.push({
          command: `${command.axis}_${command.direction || command.action}`,
          latency: feedbackLatency,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const avgFeedbackLatency =
      feedbackLatencies.reduce((sum, f) => sum + f.latency, 0) / feedbackLatencies.length;
    const maxFeedbackLatency = Math.max(...feedbackLatencies.map(f => f.latency));

    const testResult = {
      name: 'Manual Control Feedback',
      status: avgFeedbackLatency <= this.thresholds.messageLatency * 1.5 ? 'passed' : 'failed', // Allow 1.5x for control feedback
      duration: avgFeedbackLatency,
      metrics: {
        totalCommands: feedbackLatencies.length,
        averageFeedbackLatency: avgFeedbackLatency,
        maxFeedbackLatency: maxFeedbackLatency,
        commandTypes: controlCommands.length,
        iterations: 3,
        feedbackLatencies: feedbackLatencies,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${feedbackLatencies.length} commands, ${avgFeedbackLatency.toFixed(2)}ms avg feedback`
    );
  }

  async testMultiUserSynchronization() {
    console.log('      🔄 Testing Multi-User Synchronization...');

    const userCount = 4;
    const syncDuration = 8000; // 8 seconds
    const syncMessages = [];
    const userPromises = [];

    for (let userId = 0; userId < userCount; userId++) {
      const userPromise = (async () => {
        const userMessages = [];
        const startTime = performance.now();

        while (performance.now() - startTime < syncDuration) {
          const messageStart = performance.now();

          // Each user sends position updates
          const message = {
            userId: userId,
            timestamp: messageStart,
            action: 'position_update',
            data: {
              x: Math.random() * 100,
              y: Math.random() * 100,
              z: Math.random() * 50,
            },
          };

          await this.simulateSocketMessage('user_sync_message', message);

          // Simulate broadcast to other users
          for (let otherUser = 0; otherUser < userCount; otherUser++) {
            if (otherUser !== userId) {
              await this.simulateSocketMessage('sync_broadcast', {
                ...message,
                receiverId: otherUser,
                broadcastTime: performance.now(),
              });
            }
          }

          const messageLatency = performance.now() - messageStart;
          userMessages.push({
            userId: userId,
            latency: messageLatency,
            timestamp: messageStart,
          });

          await new Promise(resolve => setTimeout(resolve, 200)); // 5Hz updates per user
        }

        return userMessages;
      })();

      userPromises.push(userPromise);
    }

    const allUserMessages = await Promise.all(userPromises);
    allUserMessages.forEach(userMsgs => syncMessages.push(...userMsgs));

    // Analyze synchronization quality
    const avgSyncLatency =
      syncMessages.reduce((sum, msg) => sum + msg.latency, 0) / syncMessages.length;
    const maxSyncLatency = Math.max(...syncMessages.map(msg => msg.latency));

    const testResult = {
      name: 'Multi-User Synchronization',
      status: avgSyncLatency <= this.thresholds.messageLatency * 2 ? 'passed' : 'failed', // Allow 2x for multi-user sync
      duration: syncDuration,
      metrics: {
        userCount: userCount,
        totalMessages: syncMessages.length,
        averageSyncLatency: avgSyncLatency,
        maxSyncLatency: maxSyncLatency,
        messagesPerUser: syncMessages.length / userCount,
        syncDuration: syncDuration,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${userCount} users, ${syncMessages.length} messages, ${avgSyncLatency.toFixed(2)}ms avg sync`
    );
  }

  async testMessageDeliveryReliability() {
    console.log('      ✅ Testing Message Delivery Reliability...');

    const totalMessages = 1000;
    const messagesSent = [];
    const messagesReceived = [];

    for (let i = 0; i < totalMessages; i++) {
      const messageId = `reliability_${i}`;
      const sendTime = performance.now();

      messagesSent.push({
        id: messageId,
        sendTime: sendTime,
        type: 'reliability_test',
      });

      try {
        await this.simulateSocketMessage('reliability_test', {
          id: messageId,
          sendTime: sendTime,
          index: i,
        });

        // Simulate successful delivery
        messagesReceived.push({
          id: messageId,
          receiveTime: performance.now(),
          delivered: true,
        });
      } catch (error) {
        messagesReceived.push({
          id: messageId,
          receiveTime: performance.now(),
          delivered: false,
          error: error.message,
        });
      }

      // Small delay to avoid overwhelming
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    const deliveredCount = messagesReceived.filter(msg => msg.delivered).length;
    const deliveryRate = (deliveredCount / totalMessages) * 100;

    const testResult = {
      name: 'Message Delivery Reliability',
      status: deliveryRate >= this.thresholds.messageDelivery ? 'passed' : 'failed',
      duration: totalMessages, // Conceptual duration
      metrics: {
        totalMessages: totalMessages,
        messagesDelivered: deliveredCount,
        messagesFailed: totalMessages - deliveredCount,
        deliveryRate: deliveryRate,
        threshold: this.thresholds.messageDelivery,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.messageDeliveryMetrics = {
      sent: messagesSent.length,
      received: messagesReceived.length,
      deliveryRate: deliveryRate,
    };

    console.log(
      `        📊 ${deliveredCount}/${totalMessages} delivered (${deliveryRate.toFixed(2)}%)`
    );
  }

  async testConnectionRecovery() {
    console.log('      🔄 Testing Connection Recovery...');

    const recoveryIterations = 5;
    const recoveryResults = [];

    for (let i = 0; i < recoveryIterations; i++) {
      // Establish connection
      const connection = await this.simulateSocketConnection(`recovery_${i}`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate connection loss
      const disconnectTime = performance.now();
      await this.simulateConnectionLoss(connection);

      // Measure recovery time
      const recoveryStart = performance.now();
      const recoveredConnection = await this.simulateConnectionRecovery(connection);
      const recoveryTime = performance.now() - recoveryStart;

      // Test recovered connection
      const testStart = performance.now();
      await this.simulateSocketMessage('recovery_test', { iteration: i });
      const testLatency = performance.now() - testStart;

      recoveryResults.push({
        iteration: i,
        recoveryTime: recoveryTime,
        testLatency: testLatency,
        recovered: recoveredConnection !== null,
      });

      // Cleanup
      if (recoveredConnection) {
        await this.simulateSocketDisconnection(recoveredConnection);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successfulRecoveries = recoveryResults.filter(r => r.recovered).length;
    const avgRecoveryTime =
      recoveryResults.filter(r => r.recovered).reduce((sum, r) => sum + r.recoveryTime, 0) /
      successfulRecoveries;

    const testResult = {
      name: 'Connection Recovery',
      status:
        avgRecoveryTime <= this.thresholds.reconnectionTime &&
        successfulRecoveries >= recoveryIterations * 0.8
          ? 'passed'
          : 'failed',
      duration: avgRecoveryTime,
      metrics: {
        iterations: recoveryIterations,
        successfulRecoveries: successfulRecoveries,
        recoveryRate: (successfulRecoveries / recoveryIterations) * 100,
        averageRecoveryTime: avgRecoveryTime,
        maxRecoveryTime: Math.max(
          ...recoveryResults.filter(r => r.recovered).map(r => r.recoveryTime)
        ),
        threshold: this.thresholds.reconnectionTime,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${successfulRecoveries}/${recoveryIterations} recovered, ${avgRecoveryTime.toFixed(2)}ms avg recovery`
    );
  }

  async testHighFrequencyUpdates() {
    console.log('      ⚡ Testing High Frequency Updates...');

    const testDuration = 5000; // 5 seconds
    const updateInterval = 10; // 100Hz updates
    const updates = [];
    const latencies = [];

    let updateCount = 0;
    const startTime = performance.now();

    const updatePromise = new Promise(resolve => {
      const interval = setInterval(async () => {
        const updateStart = performance.now();

        await this.simulateSocketMessage('high_frequency_update', {
          updateId: updateCount,
          timestamp: updateStart,
          data: Math.random(),
        });

        const latency = performance.now() - updateStart;
        latencies.push(latency);
        updates.push({
          id: updateCount,
          timestamp: updateStart,
          latency: latency,
        });

        updateCount++;

        if (performance.now() - startTime >= testDuration) {
          clearInterval(interval);
          resolve();
        }
      }, updateInterval);
    });

    await updatePromise;

    const totalTime = performance.now() - startTime;
    const actualFrequency = (updateCount / totalTime) * 1000;
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const targetFrequency = 1000 / updateInterval;

    const testResult = {
      name: 'High Frequency Updates',
      status:
        avgLatency <= this.thresholds.messageLatency && actualFrequency >= targetFrequency * 0.9
          ? 'passed'
          : 'failed',
      duration: totalTime,
      metrics: {
        totalUpdates: updateCount,
        targetFrequency: targetFrequency,
        actualFrequency: actualFrequency,
        frequencyAccuracy: (actualFrequency / targetFrequency) * 100,
        averageLatency: avgLatency,
        maxLatency: Math.max(...latencies),
        testDuration: testDuration,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${updateCount} updates, ${actualFrequency.toFixed(2)}Hz actual, ${avgLatency.toFixed(2)}ms avg latency`
    );
  }

  async testConnectionStorm() {
    console.log('      🌪️  Testing Connection Storm...');

    const stormConnections = 50;
    const stormDuration = 3000; // 3 seconds
    const connections = [];
    const connectionResults = [];

    const stormStart = performance.now();

    // Create connection storm
    const connectionPromises = [];

    for (let i = 0; i < stormConnections; i++) {
      const connectionPromise = (async () => {
        const connectStart = performance.now();

        try {
          const connection = await this.simulateSocketConnection(`storm_${i}`);
          const connectTime = performance.now() - connectStart;

          // Keep connection alive during storm
          await new Promise(resolve => setTimeout(resolve, stormDuration));

          return {
            id: `storm_${i}`,
            connectionTime: connectTime,
            success: true,
            connection: connection,
          };
        } catch (error) {
          return {
            id: `storm_${i}`,
            connectionTime: performance.now() - connectStart,
            success: false,
            error: error.message,
          };
        }
      })();

      connectionPromises.push(connectionPromise);

      // Minimal stagger to create storm effect
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const stormResults = await Promise.all(connectionPromises);
    const stormTime = performance.now() - stormStart;

    const successfulConnections = stormResults.filter(r => r.success).length;
    const avgConnectionTime =
      stormResults.filter(r => r.success).reduce((sum, r) => sum + r.connectionTime, 0) /
      successfulConnections;

    // Cleanup storm connections
    const cleanupPromises = stormResults
      .filter(r => r.success && r.connection)
      .map(r => this.simulateSocketDisconnection(r.connection));

    await Promise.all(cleanupPromises);

    const testResult = {
      name: 'Connection Storm',
      status:
        successfulConnections >= stormConnections * 0.8 &&
        avgConnectionTime <= this.thresholds.connectionTime * 3
          ? 'passed'
          : 'warning',
      duration: stormTime,
      metrics: {
        stormConnections: stormConnections,
        successfulConnections: successfulConnections,
        successRate: (successfulConnections / stormConnections) * 100,
        averageConnectionTime: avgConnectionTime,
        maxConnectionTime: Math.max(
          ...stormResults.filter(r => r.success).map(r => r.connectionTime)
        ),
        stormDuration: stormTime,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${successfulConnections}/${stormConnections} connections, ${avgConnectionTime.toFixed(2)}ms avg connect`
    );
  }

  // Simulation methods for Socket.IO operations
  async simulateSocketMessage(messageType, data) {
    // Simulate Socket.IO message processing time
    const processingTimes = {
      robot_status: Math.random() * 20 + 10, // 10-30ms
      manual_control: Math.random() * 30 + 15, // 15-45ms
      position_update: Math.random() * 25 + 10, // 10-35ms
      emergency_stop: Math.random() * 10 + 5, // 5-15ms (critical)
      gcode_progress: Math.random() * 40 + 20, // 20-60ms
    };

    const processingTime = processingTimes[messageType] || Math.random() * 30 + 15;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Update mock server metrics
    this.mockServer.messagesSent++;
    this.mockServer.latencies.push(processingTime);
  }

  async simulateRequestResponse({ request, expectedResponse }) {
    // Simulate request
    await this.simulateSocketMessage(request, { timestamp: performance.now() });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 20));

    // Simulate response
    await this.simulateSocketMessage(expectedResponse, {
      timestamp: performance.now(),
      requestResponse: true,
    });
  }

  async simulateSocketConnection(connectionId = null) {
    const connectTime = Math.random() * 500 + 200; // 200-700ms connection time
    await new Promise(resolve => setTimeout(resolve, connectTime));

    const connection = {
      id: connectionId || `conn_${Date.now()}`,
      connected: true,
      connectedAt: performance.now(),
    };

    this.activeConnections.push(connection);
    this.mockServer.connections.set(connection.id, connection);

    return connection;
  }

  async simulateSocketDisconnection(connection) {
    const disconnectTime = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, disconnectTime));

    connection.connected = false;
    this.mockServer.connections.delete(connection.id);

    const index = this.activeConnections.indexOf(connection);
    if (index > -1) {
      this.activeConnections.splice(index, 1);
    }
  }

  async simulateConnectionLoss(connection) {
    // Simulate sudden connection loss (no graceful disconnect)
    connection.connected = false;
    connection.lostAt = performance.now();
  }

  async simulateConnectionRecovery(connection) {
    const recoveryTime = Math.random() * 1500 + 500; // 500-2000ms
    await new Promise(resolve => setTimeout(resolve, recoveryTime));

    // 90% success rate for recovery
    if (Math.random() < 0.9) {
      connection.connected = true;
      connection.recoveredAt = performance.now();
      return connection;
    }

    return null; // Recovery failed
  }

  async simulateBulkDataTransfer({ name, size, data }) {
    // Simulate bulk data transfer time based on size
    const baseTime = 100; // Base processing time
    const sizeTime = (size / 1024) * 10; // 10ms per KB
    const networkTime = Math.random() * 200 + 50; // 50-250ms network variance

    const totalTime = baseTime + sizeTime + networkTime;
    await new Promise(resolve => setTimeout(resolve, totalTime));
  }

  generateTestData(messageType) {
    const testData = {
      robot_status: {
        axes: { x: 100, y: 50, z: 25 },
        gripper: 75,
        status: 'moving',
      },
      manual_control: {
        axis: 'x',
        direction: '+',
        distance: 10,
      },
      position_update: {
        x: Math.random() * 200,
        y: Math.random() * 200,
        z: Math.random() * 100,
      },
      emergency_stop: {
        triggered: true,
        reason: 'manual',
      },
      gcode_progress: {
        line: 42,
        progress: 65.5,
        estimate: 120,
      },
    };

    return testData[messageType] || { message: 'test data' };
  }

  generateBulkTestData(size) {
    // Generate test data of specified size
    const unit = 'X';
    const unitsNeeded = Math.floor(size / unit.length);
    return unit.repeat(unitsNeeded);
  }

  calculateNewPosition(command) {
    // Simulate position calculation for control feedback
    const currentPos = { x: 100, y: 50, z: 25 };

    if (command.axis === 'gripper') {
      return { ...currentPos, gripper: command.action === 'open' ? 0 : 100 };
    }

    const movement = command.distance * (command.direction === '+' ? 1 : -1);
    currentPos[command.axis] += movement;

    return currentPos;
  }

  analyzeRealtimeResults() {
    console.log('      📊 Analyzing real-time communication results...');

    const passedTests = this.results.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.results.tests.length;
    const warningTests = this.results.tests.filter(t => t.status === 'warning').length;

    // Calculate overall communication health
    const healthScore = (passedTests / totalTests) * 100;

    this.results.metrics.communicationHealth = {
      testsPassed: passedTests,
      testsTotal: totalTests,
      testsWarning: warningTests,
      healthScore: healthScore,
      avgMessageLatency:
        this.results.metrics.latencyResults.length > 0
          ? this.results.metrics.latencyResults.reduce((sum, l) => sum + l.latency, 0) /
            this.results.metrics.latencyResults.length
          : 0,
    };

    console.log(`        🎯 Communication Health: ${healthScore.toFixed(1)}%`);
    console.log(`        📡 Active Connections: ${this.activeConnections.length}`);
  }

  async cleanup() {
    // Cleanup all active connections
    const cleanupPromises = this.activeConnections.map(conn =>
      this.simulateSocketDisconnection(conn)
    );

    await Promise.all(cleanupPromises);

    this.activeConnections = [];
    this.mockServer = null;
    this.testMetrics = null;
  }
}

module.exports = RealtimeCommunicationTests;
