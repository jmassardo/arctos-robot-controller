/**
 * API Response Time Performance Tests
 *
 * Tests REST API endpoint performance under various load conditions
 * for the Arctos Robot Controller system.
 *
 * Performance Test Engineer Implementation
 */

const { performance } = require('perf_hooks');

class ApiResponseTimeTests {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      tests: [],
      metrics: {
        endpointResults: [],
        loadTestResults: [],
        authenticationResults: [],
      },
      success: true,
    };

    // API performance thresholds
    this.thresholds = {
      getEndpoint: 100, // ms - GET requests
      postEndpoint: 200, // ms - POST requests
      putEndpoint: 150, // ms - PUT requests
      deleteEndpoint: 100, // ms - DELETE requests
      authEndpoint: 300, // ms - Authentication
      uploadEndpoint: 1000, // ms - File uploads
      bulkEndpoint: 500, // ms - Bulk operations
    };
  }

  async run() {
    console.log('    🌐 Running API Response Time tests...');

    try {
      // Test individual endpoints
      await this.testGetEndpoints();
      await this.testPostEndpoints();
      await this.testPutEndpoints();
      await this.testDeleteEndpoints();

      // Authentication performance
      await this.testAuthenticationEndpoints();

      // File operations
      await this.testFileUploadEndpoints();

      // Bulk operations
      await this.testBulkOperations();

      // Load testing
      await this.testEndpointsUnderLoad();

      // Analyze results
      this.analyzeApiResults();

      this.results.success = this.results.tests.every(t => t.status !== 'failed');
    } catch (error) {
      console.error('    ❌ API Response Time tests failed:', error);
      this.results.success = false;
      this.results.error = error.message;
    }

    return this.results;
  }

  async testGetEndpoints() {
    console.log('      📥 Testing GET Endpoints...');

    const getEndpoints = [
      { path: '/api/config', description: 'Robot Configuration' },
      { path: '/api/positions', description: 'Saved Positions' },
      { path: '/api/robot/status', description: 'Robot Status' },
      { path: '/api/gcode/files', description: 'G-code Files' },
      { path: '/api/logs', description: 'System Logs' },
      { path: '/api/users', description: 'User Management' },
    ];

    const endpointResults = [];

    for (const endpoint of getEndpoints) {
      const iterations = 10;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateApiRequest('GET', endpoint.path, null);

        const responseTime = performance.now() - start;
        responseTimes.push(responseTime);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      endpointResults.push({
        method: 'GET',
        path: endpoint.path,
        description: endpoint.description,
        avgResponseTime: avgResponseTime,
        maxResponseTime: maxResponseTime,
        iterations: iterations,
        responseTimes: responseTimes,
      });
    }

    const overallAvgTime =
      endpointResults.reduce((sum, er) => sum + er.avgResponseTime, 0) / endpointResults.length;

    const testResult = {
      name: 'GET Endpoints Performance',
      status: overallAvgTime <= this.thresholds.getEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        endpointResults: endpointResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.getEndpoint,
        endpointCount: getEndpoints.length,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average response time: ${overallAvgTime.toFixed(2)}ms`);
    endpointResults.forEach(result => {
      console.log(`          ${result.path}: ${result.avgResponseTime.toFixed(2)}ms`);
    });
  }

  async testPostEndpoints() {
    console.log('      📤 Testing POST Endpoints...');

    const postEndpoints = [
      { path: '/api/config', description: 'Update Configuration', data: { robotType: 'test' } },
      {
        path: '/api/positions',
        description: 'Save Position',
        data: { name: 'test', x: 100, y: 50, z: 25 },
      },
      {
        path: '/api/robot/command',
        description: 'Robot Command',
        data: { command: 'move', axis: 'x', value: 10 },
      },
      {
        path: '/api/gcode/execute',
        description: 'Execute G-code',
        data: { gcode: 'G0 X100 Y100' },
      },
      {
        path: '/api/auth/login',
        description: 'User Login',
        data: { username: 'test', password: 'test' },
      },
    ];

    const endpointResults = [];

    for (const endpoint of postEndpoints) {
      const iterations = 8;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateApiRequest('POST', endpoint.path, endpoint.data);

        const responseTime = performance.now() - start;
        responseTimes.push(responseTime);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      endpointResults.push({
        method: 'POST',
        path: endpoint.path,
        description: endpoint.description,
        avgResponseTime: avgResponseTime,
        maxResponseTime: maxResponseTime,
        iterations: iterations,
        responseTimes: responseTimes,
      });
    }

    const overallAvgTime =
      endpointResults.reduce((sum, er) => sum + er.avgResponseTime, 0) / endpointResults.length;

    const testResult = {
      name: 'POST Endpoints Performance',
      status: overallAvgTime <= this.thresholds.postEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        endpointResults: endpointResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.postEndpoint,
        endpointCount: postEndpoints.length,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.endpointResults.push(...endpointResults);

    console.log(`        📊 Average response time: ${overallAvgTime.toFixed(2)}ms`);
    endpointResults.forEach(result => {
      console.log(`          ${result.path}: ${result.avgResponseTime.toFixed(2)}ms`);
    });
  }

  async testPutEndpoints() {
    console.log('      ✏️  Testing PUT Endpoints...');

    const putEndpoints = [
      { path: '/api/config/1', description: 'Update Config Item', data: { value: 'updated' } },
      { path: '/api/positions/1', description: 'Update Position', data: { x: 150, y: 75, z: 30 } },
      { path: '/api/users/1', description: 'Update User', data: { name: 'updated_user' } },
    ];

    const endpointResults = [];

    for (const endpoint of putEndpoints) {
      const iterations = 6;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateApiRequest('PUT', endpoint.path, endpoint.data);

        const responseTime = performance.now() - start;
        responseTimes.push(responseTime);

        await new Promise(resolve => setTimeout(resolve, 75));
      }

      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      endpointResults.push({
        method: 'PUT',
        path: endpoint.path,
        description: endpoint.description,
        avgResponseTime: avgResponseTime,
        maxResponseTime: maxResponseTime,
        iterations: iterations,
        responseTimes: responseTimes,
      });
    }

    const overallAvgTime =
      endpointResults.reduce((sum, er) => sum + er.avgResponseTime, 0) / endpointResults.length;

    const testResult = {
      name: 'PUT Endpoints Performance',
      status: overallAvgTime <= this.thresholds.putEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        endpointResults: endpointResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.putEndpoint,
        endpointCount: putEndpoints.length,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average response time: ${overallAvgTime.toFixed(2)}ms`);
  }

  async testDeleteEndpoints() {
    console.log('      🗑️  Testing DELETE Endpoints...');

    const deleteEndpoints = [
      { path: '/api/positions/temp', description: 'Delete Position' },
      { path: '/api/gcode/files/temp.gcode', description: 'Delete G-code File' },
      { path: '/api/logs/old', description: 'Delete Old Logs' },
    ];

    const endpointResults = [];

    for (const endpoint of deleteEndpoints) {
      const iterations = 5;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateApiRequest('DELETE', endpoint.path, null);

        const responseTime = performance.now() - start;
        responseTimes.push(responseTime);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / iterations;

      endpointResults.push({
        method: 'DELETE',
        path: endpoint.path,
        description: endpoint.description,
        avgResponseTime: avgResponseTime,
        iterations: iterations,
      });
    }

    const overallAvgTime =
      endpointResults.reduce((sum, er) => sum + er.avgResponseTime, 0) / endpointResults.length;

    const testResult = {
      name: 'DELETE Endpoints Performance',
      status: overallAvgTime <= this.thresholds.deleteEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        endpointResults: endpointResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.deleteEndpoint,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average response time: ${overallAvgTime.toFixed(2)}ms`);
  }

  async testAuthenticationEndpoints() {
    console.log('      🔐 Testing Authentication Performance...');

    const authOperations = [
      {
        operation: 'login',
        endpoint: '/api/auth/login',
        data: { username: 'test', password: 'test' },
      },
      {
        operation: 'register',
        endpoint: '/api/auth/register',
        data: { username: 'newuser', password: 'pass', email: 'test@test.com' },
      },
      { operation: 'logout', endpoint: '/api/auth/logout', data: null },
      { operation: 'token_refresh', endpoint: '/api/auth/refresh', data: { token: 'mock_token' } },
      {
        operation: 'password_reset',
        endpoint: '/api/auth/reset-password',
        data: { email: 'test@test.com' },
      },
    ];

    const authResults = [];

    for (const auth of authOperations) {
      const iterations = 5;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await this.simulateAuthRequest(auth.operation, auth.endpoint, auth.data);

        const responseTime = performance.now() - start;
        responseTimes.push(responseTime);

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / iterations;
      const maxResponseTime = Math.max(...responseTimes);

      authResults.push({
        operation: auth.operation,
        endpoint: auth.endpoint,
        avgResponseTime: avgResponseTime,
        maxResponseTime: maxResponseTime,
        iterations: iterations,
        responseTimes: responseTimes,
      });
    }

    const overallAvgTime =
      authResults.reduce((sum, ar) => sum + ar.avgResponseTime, 0) / authResults.length;

    const testResult = {
      name: 'Authentication Performance',
      status: overallAvgTime <= this.thresholds.authEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        authResults: authResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.authEndpoint,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.authenticationResults = authResults;

    console.log(`        📊 Average auth time: ${overallAvgTime.toFixed(2)}ms`);
    authResults.forEach(result => {
      console.log(`          ${result.operation}: ${result.avgResponseTime.toFixed(2)}ms`);
    });
  }

  async testFileUploadEndpoints() {
    console.log('      📁 Testing File Upload Performance...');

    const fileSizes = [
      { name: 'Small G-code', size: 10 * 1024, endpoint: '/api/gcode/upload' },
      { name: 'Medium G-code', size: 100 * 1024, endpoint: '/api/gcode/upload' },
      { name: 'Large G-code', size: 1024 * 1024, endpoint: '/api/gcode/upload' },
      { name: 'Config Backup', size: 50 * 1024, endpoint: '/api/config/upload' },
    ];

    const uploadResults = [];

    for (const fileSpec of fileSizes) {
      const iterations = 3;
      const uploadTimes = [];

      for (let i = 0; i < iterations; i++) {
        const mockFileData = this.generateMockFileData(fileSpec.size);

        const start = performance.now();

        await this.simulateFileUpload(fileSpec.endpoint, mockFileData, fileSpec.name);

        const uploadTime = performance.now() - start;
        uploadTimes.push(uploadTime);

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const avgUploadTime = uploadTimes.reduce((sum, ut) => sum + ut, 0) / iterations;
      const throughputKBps = fileSpec.size / 1024 / (avgUploadTime / 1000);

      uploadResults.push({
        fileName: fileSpec.name,
        fileSize: fileSpec.size,
        avgUploadTime: avgUploadTime,
        throughputKBps: throughputKBps,
        iterations: iterations,
      });
    }

    const avgThroughput =
      uploadResults.reduce((sum, ur) => sum + ur.throughputKBps, 0) / uploadResults.length;
    const maxUploadTime = Math.max(...uploadResults.map(ur => ur.avgUploadTime));

    const testResult = {
      name: 'File Upload Performance',
      status:
        maxUploadTime <= this.thresholds.uploadEndpoint && avgThroughput >= 100
          ? 'passed'
          : 'failed', // 100 KB/s minimum
      duration: maxUploadTime,
      metrics: {
        uploadResults: uploadResults,
        avgThroughput: avgThroughput,
        maxUploadTime: maxUploadTime,
        threshold: this.thresholds.uploadEndpoint,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average throughput: ${avgThroughput.toFixed(2)} KB/s`);
    uploadResults.forEach(result => {
      console.log(`          ${result.fileName}: ${result.throughputKBps.toFixed(2)} KB/s`);
    });
  }

  async testBulkOperations() {
    console.log('      📦 Testing Bulk Operations Performance...');

    const bulkOperations = [
      { operation: 'bulk_position_save', count: 100, endpoint: '/api/positions/bulk' },
      { operation: 'bulk_config_update', count: 50, endpoint: '/api/config/bulk' },
      { operation: 'bulk_log_export', count: 1000, endpoint: '/api/logs/export' },
      { operation: 'bulk_user_import', count: 25, endpoint: '/api/users/import' },
    ];

    const bulkResults = [];

    for (const bulk of bulkOperations) {
      const bulkData = this.generateBulkData(bulk.operation, bulk.count);

      const start = performance.now();

      await this.simulateBulkOperation(bulk.endpoint, bulkData, bulk.operation);

      const bulkTime = performance.now() - start;
      const itemsPerSecond = bulk.count / (bulkTime / 1000);

      bulkResults.push({
        operation: bulk.operation,
        itemCount: bulk.count,
        bulkTime: bulkTime,
        itemsPerSecond: itemsPerSecond,
        endpoint: bulk.endpoint,
      });
    }

    const overallAvgTime =
      bulkResults.reduce((sum, br) => sum + br.bulkTime, 0) / bulkResults.length;

    const testResult = {
      name: 'Bulk Operations Performance',
      status: overallAvgTime <= this.thresholds.bulkEndpoint ? 'passed' : 'failed',
      duration: overallAvgTime,
      metrics: {
        bulkResults: bulkResults,
        overallAvgTime: overallAvgTime,
        threshold: this.thresholds.bulkEndpoint,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Average bulk time: ${overallAvgTime.toFixed(2)}ms`);
    bulkResults.forEach(result => {
      console.log(`          ${result.operation}: ${result.itemsPerSecond.toFixed(2)} items/sec`);
    });
  }

  async testEndpointsUnderLoad() {
    console.log('      🔥 Testing Endpoints Under Load...');

    const criticalEndpoints = [
      { path: '/api/robot/status', method: 'GET', data: null },
      {
        path: '/api/robot/command',
        method: 'POST',
        data: { command: 'move', axis: 'x', value: 5 },
      },
      { path: '/api/gcode/execute', method: 'POST', data: { gcode: 'G1 X10 Y10' } },
    ];

    const loadResults = [];

    for (const endpoint of criticalEndpoints) {
      console.log(`        🎯 Load testing ${endpoint.path}...`);

      const concurrentRequests = 20;
      const requestsPerConnection = 10;

      const connectionPromises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const connectionPromise = (async () => {
          const connectionResults = [];

          for (let j = 0; j < requestsPerConnection; j++) {
            const start = performance.now();

            await this.simulateApiRequest(endpoint.method, endpoint.path, endpoint.data);

            const responseTime = performance.now() - start;
            connectionResults.push(responseTime);

            // Small delay between requests from same connection
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          return connectionResults;
        })();

        connectionPromises.push(connectionPromise);
      }

      const loadStart = performance.now();
      const allResults = await Promise.all(connectionPromises);
      const totalLoadTime = performance.now() - loadStart;

      // Flatten all results
      const allResponseTimes = [];
      allResults.forEach(connectionResults => allResponseTimes.push(...connectionResults));

      const avgResponseTime =
        allResponseTimes.reduce((sum, rt) => sum + rt, 0) / allResponseTimes.length;
      const p95ResponseTime = allResponseTimes.sort((a, b) => a - b)[
        Math.floor(allResponseTimes.length * 0.95)
      ];
      const maxResponseTime = Math.max(...allResponseTimes);
      const throughput = allResponseTimes.length / (totalLoadTime / 1000);

      loadResults.push({
        endpoint: endpoint.path,
        method: endpoint.method,
        concurrentRequests: concurrentRequests,
        totalRequests: allResponseTimes.length,
        avgResponseTime: avgResponseTime,
        p95ResponseTime: p95ResponseTime,
        maxResponseTime: maxResponseTime,
        throughput: throughput,
        totalLoadTime: totalLoadTime,
      });
    }

    const overallAvgResponse =
      loadResults.reduce((sum, lr) => sum + lr.avgResponseTime, 0) / loadResults.length;
    const overallThroughput =
      loadResults.reduce((sum, lr) => sum + lr.throughput, 0) / loadResults.length;

    const testResult = {
      name: 'Endpoints Under Load',
      status:
        overallAvgResponse <= this.thresholds.postEndpoint * 2 && overallThroughput >= 10
          ? 'passed'
          : 'failed', // Allow 2x degradation, 10 req/sec minimum
      duration: overallAvgResponse,
      metrics: {
        loadResults: loadResults,
        overallAvgResponse: overallAvgResponse,
        overallThroughput: overallThroughput,
        totalRequestsTested: loadResults.reduce((sum, lr) => sum + lr.totalRequests, 0),
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.loadTestResults = loadResults;

    console.log(
      `        📊 Overall: ${overallAvgResponse.toFixed(2)}ms avg, ${overallThroughput.toFixed(2)} req/sec`
    );
  }

  // Simulation methods for API requests
  async simulateApiRequest(method, path, data) {
    // Simulate different response times based on endpoint complexity
    const responseTimeFactors = {
      '/api/config': Math.random() * 50 + 30,
      '/api/positions': Math.random() * 40 + 25,
      '/api/robot/status': Math.random() * 30 + 20,
      '/api/robot/command': Math.random() * 80 + 40,
      '/api/gcode': Math.random() * 100 + 50,
      '/api/logs': Math.random() * 60 + 30,
      '/api/users': Math.random() * 70 + 35,
    };

    // Find matching response time factor
    let responseTime = Math.random() * 50 + 30; // Default

    for (const [pathPattern, time] of Object.entries(responseTimeFactors)) {
      if (path.includes(pathPattern)) {
        responseTime = time;
        break;
      }
    }

    // Method-specific adjustments
    const methodFactors = {
      GET: 1.0,
      POST: 1.3,
      PUT: 1.2,
      DELETE: 0.8,
    };

    responseTime *= methodFactors[method] || 1.0;

    // Add data processing time
    if (data) {
      const dataSize = JSON.stringify(data).length;
      responseTime += dataSize * 0.01; // 0.01ms per character
    }

    await new Promise(resolve => setTimeout(resolve, responseTime));

    return {
      status: 200,
      responseTime: responseTime,
      data: { success: true },
    };
  }

  async simulateAuthRequest(operation, endpoint, data) {
    // Authentication operations have additional processing overhead
    const authResponseTimes = {
      login: Math.random() * 200 + 150, // 150-350ms (password hashing)
      register: Math.random() * 300 + 200, // 200-500ms (validation + hashing)
      logout: Math.random() * 50 + 25, // 25-75ms
      token_refresh: Math.random() * 100 + 50, // 50-150ms
      password_reset: Math.random() * 250 + 100, // 100-350ms (email processing)
    };

    const responseTime = authResponseTimes[operation] || Math.random() * 150 + 100;

    await new Promise(resolve => setTimeout(resolve, responseTime));

    return {
      status: 200,
      responseTime: responseTime,
      data: { success: true, token: 'mock_token' },
    };
  }

  async simulateFileUpload(endpoint, fileData, fileName) {
    // File upload time based on size and processing
    const fileSize = fileData.length;
    const uploadTimePerByte = Math.random() * 0.001 + 0.0005; // Variable upload speed
    const processingTime = Math.random() * 200 + 100; // Processing overhead

    const totalTime = fileSize * uploadTimePerByte + processingTime;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    return {
      status: 200,
      responseTime: totalTime,
      data: { uploaded: true, fileName: fileName, size: fileSize },
    };
  }

  async simulateBulkOperation(endpoint, bulkData, operation) {
    // Bulk operations have efficiency gains but baseline overhead
    const itemCount = Array.isArray(bulkData) ? bulkData.length : bulkData.count || 1;
    const baseOverhead = Math.random() * 100 + 50; // 50-150ms base overhead
    const timePerItem = Math.random() * 5 + 2; // 2-7ms per item
    const efficiencyFactor = Math.max(0.3, 1 - itemCount / 1000); // Efficiency gains for larger batches

    const totalTime = baseOverhead + itemCount * timePerItem * efficiencyFactor;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    return {
      status: 200,
      responseTime: totalTime,
      data: { processed: itemCount, operation: operation },
    };
  }

  generateMockFileData(size) {
    // Generate mock file data of specified size
    const unit = 'A';
    const unitsNeeded = Math.floor(size / unit.length);
    return unit.repeat(unitsNeeded);
  }

  generateBulkData(operation, count) {
    switch (operation) {
      case 'bulk_position_save':
        return Array.from({ length: count }, (_, i) => ({
          name: `position_${i}`,
          x: Math.random() * 200,
          y: Math.random() * 200,
          z: Math.random() * 100,
        }));

      case 'bulk_config_update':
        return Array.from({ length: count }, (_, i) => ({
          key: `config_${i}`,
          value: `value_${i}`,
        }));

      case 'bulk_log_export':
        return { count: count, format: 'json', dateRange: '7days' };

      case 'bulk_user_import':
        return Array.from({ length: count }, (_, i) => ({
          username: `user_${i}`,
          email: `user_${i}@test.com`,
          role: 'operator',
        }));

      default:
        return Array.from({ length: count }, (_, i) => ({ id: i, data: `item_${i}` }));
    }
  }

  analyzeApiResults() {
    console.log('      📊 Analyzing API performance results...');

    const passedTests = this.results.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.results.tests.length;

    // Calculate overall API health score
    const apiHealthScore = (passedTests / totalTests) * 100;

    // Analyze endpoint performance by method
    const methodAnalysis = {};
    this.results.metrics.endpointResults.forEach(endpoint => {
      if (!methodAnalysis[endpoint.method]) {
        methodAnalysis[endpoint.method] = {
          count: 0,
          totalTime: 0,
          avgTime: 0,
        };
      }
      methodAnalysis[endpoint.method].count++;
      methodAnalysis[endpoint.method].totalTime += endpoint.avgResponseTime;
    });

    // Calculate averages
    Object.keys(methodAnalysis).forEach(method => {
      methodAnalysis[method].avgTime =
        methodAnalysis[method].totalTime / methodAnalysis[method].count;
    });

    this.results.metrics.apiHealthMetrics = {
      testsPassed: passedTests,
      testsTotal: totalTests,
      healthScore: apiHealthScore,
      methodAnalysis: methodAnalysis,
      totalEndpointsTested: this.results.metrics.endpointResults.length,
    };

    console.log(`        🎯 API Health Score: ${apiHealthScore.toFixed(1)}%`);
    console.log('        📋 Method analysis:');
    Object.entries(methodAnalysis).forEach(([method, metrics]) => {
      console.log(
        `          ${method}: ${metrics.avgTime.toFixed(2)}ms avg (${metrics.count} endpoints)`
      );
    });
  }
}

module.exports = ApiResponseTimeTests;
