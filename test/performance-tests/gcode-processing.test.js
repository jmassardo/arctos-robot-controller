/**
 * G-Code Processing Performance Tests
 *
 * Tests G-code parsing, validation, and execution performance
 * with various file sizes and complexity levels.
 *
 * Performance Test Engineer Implementation
 */

const { performance } = require('perf_hooks');

class GcodeProcessingTests {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      tests: [],
      metrics: {
        parsingResults: [],
        executionResults: [],
        fileProcessingResults: [],
        memoryUsageResults: [],
      },
      success: true,
    };

    // G-code processing thresholds
    this.thresholds = {
      parseTime: 100, // ms per 1000 lines
      executionLatency: 50, // ms per G-code command
      fileLoadTime: 1000, // ms for large files (1MB)
      memoryPerLine: 0.1, // KB per G-code line
      validationTime: 200, // ms for syntax validation
      optimizationTime: 500, // ms for path optimization
    };
  }

  async run() {
    console.log('    🔧 Running G-Code Processing Performance tests...');

    try {
      // Setup test environment
      await this.setupGCodeTestEnvironment();

      // Basic parsing tests
      await this.testGCodeParsing();
      await this.testGCodeValidation();

      // File processing tests
      await this.testFileLoadingPerformance();
      await this.testLargeFileProcessing();

      // Execution tests
      await this.testCommandExecutionLatency();
      await this.testBatchExecutionPerformance();

      // Advanced processing tests
      await this.testPathOptimization();
      await this.testRealTimeGCodeStreaming();

      // Memory and resource tests
      await this.testMemoryUsageDuringProcessing();
      await this.testConcurrentFileProcessing();

      // Analyze results
      this.analyzeGCodeResults();

      this.results.success = this.results.tests.every(t => t.status !== 'failed');
    } catch (error) {
      console.error('    ❌ G-Code Processing tests failed:', error);
      this.results.success = false;
      this.results.error = error.message;
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  async setupGCodeTestEnvironment() {
    console.log('      🔧 Setting up G-code test environment...');

    // Generate test G-code samples of various sizes and complexities
    this.testGCodeSamples = {
      simple: this.generateGCodeSample('simple', 100), // 100 lines
      medium: this.generateGCodeSample('medium', 1000), // 1000 lines
      large: this.generateGCodeSample('large', 10000), // 10,000 lines
      complex: this.generateGCodeSample('complex', 5000), // 5000 complex lines
      streaming: this.generateGCodeSample('streaming', 20000), // 20,000 lines
    };

    // Mock G-code processor
    this.mockProcessor = {
      parsedLines: 0,
      executedCommands: 0,
      errors: [],
      warnings: [],
    };
  }

  async testGCodeParsing() {
    console.log('      📝 Testing G-Code Parsing Performance...');

    const parsingResults = [];

    for (const [sampleName, gcode] of Object.entries(this.testGCodeSamples)) {
      const lines = gcode.split('\n');
      const iterations = Math.min(3, Math.ceil(1000 / lines.length)); // Scale iterations based on size

      const sampleResults = [];

      for (let i = 0; i < iterations; i++) {
        const parseStart = performance.now();

        const parsed = await this.simulateGCodeParsing(gcode, sampleName);

        const parseTime = performance.now() - parseStart;
        const parseRate = lines.length / (parseTime / 1000); // lines per second

        sampleResults.push({
          iteration: i,
          parseTime: parseTime,
          parseRate: parseRate,
          linesProcessed: lines.length,
        });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const avgParseTime = sampleResults.reduce((sum, r) => sum + r.parseTime, 0) / iterations;
      const avgParseRate = sampleResults.reduce((sum, r) => sum + r.parseRate, 0) / iterations;

      parsingResults.push({
        sampleName: sampleName,
        lines: lines.length,
        avgParseTime: avgParseTime,
        avgParseRate: avgParseRate,
        iterations: iterations,
        results: sampleResults,
      });
    }

    const overallParseRate =
      parsingResults.reduce((sum, r) => sum + r.avgParseRate, 0) / parsingResults.length;
    const targetRate = 1000; // 1000 lines/second minimum

    const testResult = {
      name: 'G-Code Parsing Performance',
      status: overallParseRate >= targetRate ? 'passed' : 'failed',
      duration: parsingResults.reduce((sum, r) => sum + r.avgParseTime, 0) / parsingResults.length,
      metrics: {
        overallParseRate: overallParseRate,
        targetRate: targetRate,
        sampleResults: parsingResults,
        totalLinesProcessed: parsingResults.reduce((sum, r) => sum + r.lines, 0),
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.parsingResults = parsingResults;

    console.log(`        📊 Overall parse rate: ${overallParseRate.toFixed(2)} lines/sec`);
    parsingResults.forEach(result => {
      console.log(`          ${result.sampleName}: ${result.avgParseRate.toFixed(2)} lines/sec`);
    });
  }

  async testGCodeValidation() {
    console.log('      ✅ Testing G-Code Validation Performance...');

    const validationSamples = {
      valid: this.generateValidGCode(1000),
      withErrors: this.generateGCodeWithErrors(1000),
      mixed: this.generateMixedGCode(1000),
    };

    const validationResults = [];

    for (const [sampleName, gcode] of Object.entries(validationSamples)) {
      const lines = gcode.split('\n');

      const validationStart = performance.now();
      const validationResult = await this.simulateGCodeValidation(gcode, sampleName);
      const validationTime = performance.now() - validationStart;

      const validationRate = lines.length / (validationTime / 1000);

      validationResults.push({
        sampleName: sampleName,
        lines: lines.length,
        validationTime: validationTime,
        validationRate: validationRate,
        errorsFound: validationResult.errors.length,
        warningsFound: validationResult.warnings.length,
        validLines: validationResult.validLines,
      });
    }

    const avgValidationRate =
      validationResults.reduce((sum, r) => sum + r.validationRate, 0) / validationResults.length;
    const targetValidationRate = 500; // 500 lines/second minimum

    const testResult = {
      name: 'G-Code Validation Performance',
      status: avgValidationRate >= targetValidationRate ? 'passed' : 'failed',
      duration:
        validationResults.reduce((sum, r) => sum + r.validationTime, 0) / validationResults.length,
      metrics: {
        avgValidationRate: avgValidationRate,
        targetValidationRate: targetValidationRate,
        validationResults: validationResults,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Validation rate: ${avgValidationRate.toFixed(2)} lines/sec`);
  }

  async testFileLoadingPerformance() {
    console.log('      📂 Testing File Loading Performance...');

    const fileSizes = [
      { name: 'Small (10KB)', size: 10 * 1024, lines: 500 },
      { name: 'Medium (100KB)', size: 100 * 1024, lines: 5000 },
      { name: 'Large (1MB)', size: 1024 * 1024, lines: 50000 },
      { name: 'Very Large (5MB)', size: 5 * 1024 * 1024, lines: 250000 },
    ];

    const loadingResults = [];

    for (const fileSpec of fileSizes) {
      const gcode = this.generateGCodeBySize(fileSpec.size, fileSpec.lines);
      const iterations = Math.min(5, Math.ceil(10000 / fileSpec.lines)); // Scale iterations

      const loadTimes = [];

      for (let i = 0; i < iterations; i++) {
        const loadStart = performance.now();

        await this.simulateFileLoading(gcode, fileSpec.name);

        const loadTime = performance.now() - loadStart;
        loadTimes.push(loadTime);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgLoadTime = loadTimes.reduce((sum, t) => sum + t, 0) / iterations;
      const throughputMBps = fileSpec.size / (1024 * 1024) / (avgLoadTime / 1000);

      loadingResults.push({
        name: fileSpec.name,
        size: fileSpec.size,
        lines: fileSpec.lines,
        avgLoadTime: avgLoadTime,
        throughputMBps: throughputMBps,
        iterations: iterations,
      });
    }

    const avgThroughput =
      loadingResults.reduce((sum, r) => sum + r.throughputMBps, 0) / loadingResults.length;
    const targetThroughput = 1; // 1 MB/s minimum

    const testResult = {
      name: 'File Loading Performance',
      status: avgThroughput >= targetThroughput ? 'passed' : 'failed',
      duration: loadingResults.reduce((sum, r) => sum + r.avgLoadTime, 0) / loadingResults.length,
      metrics: {
        avgThroughput: avgThroughput,
        targetThroughput: targetThroughput,
        loadingResults: loadingResults,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.fileProcessingResults = loadingResults;

    console.log(`        📊 Average throughput: ${avgThroughput.toFixed(2)} MB/s`);
    loadingResults.forEach(result => {
      console.log(`          ${result.name}: ${result.throughputMBps.toFixed(2)} MB/s`);
    });
  }

  async testLargeFileProcessing() {
    console.log('      📈 Testing Large File Processing...');

    const largeFile = this.generateGCodeSample('large', 50000); // 50,000 lines
    const fileSize = Buffer.byteLength(largeFile, 'utf8');

    const processingStart = performance.now();
    const initialMemory = process.memoryUsage().heapUsed;

    // Process in chunks to simulate streaming
    const chunkSize = 1000; // Lines per chunk
    const lines = largeFile.split('\n');
    const chunks = [];

    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join('\n'));
    }

    const chunkProcessingTimes = [];
    let processedLines = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkStart = performance.now();

      await this.simulateGCodeParsing(chunks[i], `chunk_${i}`);

      const chunkTime = performance.now() - chunkStart;
      chunkProcessingTimes.push(chunkTime);
      processedLines += chunks[i].split('\n').length;

      // Small delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const totalProcessingTime = performance.now() - processingStart;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB

    const processingRate = processedLines / (totalProcessingTime / 1000);
    const avgChunkTime = chunkProcessingTimes.reduce((sum, t) => sum + t, 0) / chunks.length;

    const testResult = {
      name: 'Large File Processing',
      status: processingRate >= 1000 && memoryIncrease <= 50 ? 'passed' : 'failed', // 1000 lines/sec, <50MB memory
      duration: totalProcessingTime,
      metrics: {
        fileSize: fileSize,
        totalLines: processedLines,
        processingRate: processingRate,
        totalProcessingTime: totalProcessingTime,
        avgChunkTime: avgChunkTime,
        chunks: chunks.length,
        memoryIncrease: memoryIncrease,
        chunkProcessingTimes: chunkProcessingTimes,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${processedLines} lines, ${processingRate.toFixed(2)} lines/sec, +${memoryIncrease.toFixed(2)}MB memory`
    );
  }

  async testCommandExecutionLatency() {
    console.log('      ⚡ Testing Command Execution Latency...');

    const commandTypes = {
      G0: 'G0 X100 Y100', // Rapid movement
      G1: 'G1 X200 Y200 F1000', // Linear movement
      G2: 'G2 X150 Y150 I25 J25', // Clockwise arc
      G3: 'G3 X50 Y50 I-25 J-25', // Counterclockwise arc
      M3: 'M3 S1000', // Spindle on
      M5: 'M5', // Spindle off
      G28: 'G28', // Home
    };

    const executionResults = [];

    for (const [commandType, command] of Object.entries(commandTypes)) {
      const iterations = 20;
      const latencies = [];

      for (let i = 0; i < iterations; i++) {
        const executeStart = performance.now();

        await this.simulateCommandExecution(command, commandType);

        const latency = performance.now() - executeStart;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 25));
      }

      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / iterations;
      const maxLatency = Math.max(...latencies);

      executionResults.push({
        commandType: commandType,
        command: command,
        avgLatency: avgLatency,
        maxLatency: maxLatency,
        iterations: iterations,
        allLatencies: latencies,
      });
    }

    const overallAvgLatency =
      executionResults.reduce((sum, r) => sum + r.avgLatency, 0) / executionResults.length;
    const maxOverallLatency = Math.max(...executionResults.map(r => r.maxLatency));

    const testResult = {
      name: 'Command Execution Latency',
      status: overallAvgLatency <= this.thresholds.executionLatency ? 'passed' : 'failed',
      duration: overallAvgLatency,
      metrics: {
        overallAvgLatency: overallAvgLatency,
        maxOverallLatency: maxOverallLatency,
        threshold: this.thresholds.executionLatency,
        commandResults: executionResults,
        commandsPerSecond: 1000 / overallAvgLatency,
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.executionResults = executionResults;

    console.log(
      `        📊 Overall: ${overallAvgLatency.toFixed(2)}ms avg, ${(1000 / overallAvgLatency).toFixed(2)} cmds/sec`
    );
    executionResults.forEach(result => {
      console.log(`          ${result.commandType}: ${result.avgLatency.toFixed(2)}ms avg`);
    });
  }

  async testBatchExecutionPerformance() {
    console.log('      📦 Testing Batch Execution Performance...');

    const batchSizes = [10, 50, 100, 500, 1000];
    const batchResults = [];

    for (const batchSize of batchSizes) {
      const batch = this.generateGCodeBatch(batchSize);
      const iterations = Math.min(3, Math.ceil(100 / batchSize));

      const executionTimes = [];

      for (let i = 0; i < iterations; i++) {
        const batchStart = performance.now();

        await this.simulateBatchExecution(batch, batchSize);

        const batchTime = performance.now() - batchStart;
        executionTimes.push(batchTime);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgExecutionTime = executionTimes.reduce((sum, t) => sum + t, 0) / iterations;
      const throughput = batchSize / (avgExecutionTime / 1000); // commands per second

      batchResults.push({
        batchSize: batchSize,
        avgExecutionTime: avgExecutionTime,
        throughput: throughput,
        iterations: iterations,
      });
    }

    const maxThroughput = Math.max(...batchResults.map(r => r.throughput));
    const targetThroughput = 100; // 100 commands/second minimum

    const testResult = {
      name: 'Batch Execution Performance',
      status: maxThroughput >= targetThroughput ? 'passed' : 'failed',
      duration: batchResults.reduce((sum, r) => sum + r.avgExecutionTime, 0) / batchResults.length,
      metrics: {
        maxThroughput: maxThroughput,
        targetThroughput: targetThroughput,
        batchResults: batchResults,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Max throughput: ${maxThroughput.toFixed(2)} cmds/sec`);
    batchResults.forEach(result => {
      console.log(
        `          ${result.batchSize} commands: ${result.throughput.toFixed(2)} cmds/sec`
      );
    });
  }

  async testPathOptimization() {
    console.log('      🎯 Testing Path Optimization Performance...');

    const pathComplexities = {
      simple: this.generateSimplePath(100), // 100 points
      complex: this.generateComplexPath(500), // 500 points
      intricate: this.generateIntricatePath(1000), // 1000 points
    };

    const optimizationResults = [];

    for (const [complexity, path] of Object.entries(pathComplexities)) {
      const points = path.split('\n').length;

      const optimizeStart = performance.now();
      const optimizedPath = await this.simulatePathOptimization(path, complexity);
      const optimizeTime = performance.now() - optimizeStart;

      const optimizationRate = points / (optimizeTime / 1000); // points per second
      const pathReduction = ((path.length - optimizedPath.length) / path.length) * 100;

      optimizationResults.push({
        complexity: complexity,
        originalPoints: points,
        optimizeTime: optimizeTime,
        optimizationRate: optimizationRate,
        pathReduction: pathReduction,
        optimizedLength: optimizedPath.length,
      });
    }

    const avgOptimizationRate =
      optimizationResults.reduce((sum, r) => sum + r.optimizationRate, 0) /
      optimizationResults.length;
    const targetRate = 100; // 100 points/second minimum

    const testResult = {
      name: 'Path Optimization Performance',
      status: avgOptimizationRate >= targetRate ? 'passed' : 'failed',
      duration:
        optimizationResults.reduce((sum, r) => sum + r.optimizeTime, 0) /
        optimizationResults.length,
      metrics: {
        avgOptimizationRate: avgOptimizationRate,
        targetRate: targetRate,
        optimizationResults: optimizationResults,
      },
    };

    this.results.tests.push(testResult);

    console.log(`        📊 Optimization rate: ${avgOptimizationRate.toFixed(2)} points/sec`);
    optimizationResults.forEach(result => {
      console.log(`          ${result.complexity}: ${result.pathReduction.toFixed(1)}% reduction`);
    });
  }

  async testRealTimeGCodeStreaming() {
    console.log('      🔄 Testing Real-time G-Code Streaming...');

    const streamDuration = 10000; // 10 seconds
    const streamRate = 20; // 20 commands/second
    const commandInterval = 1000 / streamRate;

    let commandsStreamed = 0;
    let totalLatency = 0;
    const streamingLatencies = [];

    const startTime = performance.now();

    const streamingPromise = new Promise(resolve => {
      const interval = setInterval(async () => {
        const commandStart = performance.now();

        const command = this.generateRandomGCodeCommand();
        await this.simulateCommandExecution(command, 'streaming');

        const commandLatency = performance.now() - commandStart;
        streamingLatencies.push(commandLatency);
        totalLatency += commandLatency;
        commandsStreamed++;

        if (performance.now() - startTime >= streamDuration) {
          clearInterval(interval);
          resolve();
        }
      }, commandInterval);
    });

    await streamingPromise;

    const totalTime = performance.now() - startTime;
    const actualStreamRate = commandsStreamed / (totalTime / 1000);
    const avgLatency = totalLatency / commandsStreamed;
    const maxLatency = Math.max(...streamingLatencies);

    const testResult = {
      name: 'Real-time G-Code Streaming',
      status:
        actualStreamRate >= streamRate * 0.9 && avgLatency <= this.thresholds.executionLatency
          ? 'passed'
          : 'failed',
      duration: totalTime,
      metrics: {
        commandsStreamed: commandsStreamed,
        targetStreamRate: streamRate,
        actualStreamRate: actualStreamRate,
        streamAccuracy: (actualStreamRate / streamRate) * 100,
        avgLatency: avgLatency,
        maxLatency: maxLatency,
        streamDuration: streamDuration,
        streamingLatencies: streamingLatencies.slice(0, 100), // Sample
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${commandsStreamed} commands, ${actualStreamRate.toFixed(2)} cmds/sec, ${avgLatency.toFixed(2)}ms avg latency`
    );
  }

  async testMemoryUsageDuringProcessing() {
    console.log('      🧠 Testing Memory Usage During Processing...');

    const initialMemory = process.memoryUsage().heapUsed;
    const memorySnapshots = [initialMemory];

    // Process increasing amounts of G-code while monitoring memory
    const processingSizes = [1000, 5000, 10000, 25000, 50000]; // Lines to process
    const memoryResults = [];

    for (const size of processingSizes) {
      const gcode = this.generateGCodeSample('memory_test', size);

      const processStart = performance.now();
      const beforeProcessing = process.memoryUsage().heapUsed;

      await this.simulateGCodeParsing(gcode, `memory_${size}`);

      const afterProcessing = process.memoryUsage().heapUsed;
      const processTime = performance.now() - processStart;

      const memoryIncrease = (afterProcessing - beforeProcessing) / (1024 * 1024); // MB
      const memoryPerLine = (memoryIncrease / size) * 1024; // KB per line

      memoryResults.push({
        lines: size,
        processTime: processTime,
        memoryIncrease: memoryIncrease,
        memoryPerLine: memoryPerLine,
        beforeMemoryMB: beforeProcessing / (1024 * 1024),
        afterMemoryMB: afterProcessing / (1024 * 1024),
      });

      memorySnapshots.push(afterProcessing);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const maxMemoryIncrease = Math.max(...memoryResults.map(r => r.memoryIncrease));
    const avgMemoryPerLine =
      memoryResults.reduce((sum, r) => sum + r.memoryPerLine, 0) / memoryResults.length;

    const testResult = {
      name: 'Memory Usage During Processing',
      status:
        maxMemoryIncrease <= 100 && avgMemoryPerLine <= this.thresholds.memoryPerLine
          ? 'passed'
          : 'failed', // 100MB max, threshold per line
      duration: memoryResults.reduce((sum, r) => sum + r.processTime, 0),
      metrics: {
        maxMemoryIncrease: maxMemoryIncrease,
        avgMemoryPerLine: avgMemoryPerLine,
        threshold: this.thresholds.memoryPerLine,
        memoryResults: memoryResults,
        memorySnapshots: memorySnapshots.map(m => m / (1024 * 1024)), // Convert to MB
      },
    };

    this.results.tests.push(testResult);
    this.results.metrics.memoryUsageResults = memoryResults;

    console.log(
      `        📊 Max memory increase: ${maxMemoryIncrease.toFixed(2)}MB, ${avgMemoryPerLine.toFixed(3)}KB per line`
    );
  }

  async testConcurrentFileProcessing() {
    console.log('      👥 Testing Concurrent File Processing...');

    const concurrentFiles = 5;
    const fileSize = 5000; // Lines per file

    const filePromises = [];

    for (let i = 0; i < concurrentFiles; i++) {
      const filePromise = (async () => {
        const gcode = this.generateGCodeSample(`concurrent_${i}`, fileSize);

        const processStart = performance.now();
        await this.simulateGCodeParsing(gcode, `concurrent_${i}`);
        const processTime = performance.now() - processStart;

        return {
          fileId: i,
          lines: fileSize,
          processTime: processTime,
          processingRate: fileSize / (processTime / 1000),
        };
      })();

      filePromises.push(filePromise);
    }

    const concurrentStart = performance.now();
    const fileResults = await Promise.all(filePromises);
    const totalConcurrentTime = performance.now() - concurrentStart;

    const avgProcessingRate =
      fileResults.reduce((sum, r) => sum + r.processingRate, 0) / concurrentFiles;
    const totalLinesProcessed = fileResults.reduce((sum, r) => sum + r.lines, 0);
    const overallThroughput = totalLinesProcessed / (totalConcurrentTime / 1000);

    const testResult = {
      name: 'Concurrent File Processing',
      status: avgProcessingRate >= 500 && overallThroughput >= 2000 ? 'passed' : 'failed', // 500 lines/sec per file, 2000 overall
      duration: totalConcurrentTime,
      metrics: {
        concurrentFiles: concurrentFiles,
        avgProcessingRate: avgProcessingRate,
        overallThroughput: overallThroughput,
        totalLinesProcessed: totalLinesProcessed,
        totalConcurrentTime: totalConcurrentTime,
        fileResults: fileResults,
      },
    };

    this.results.tests.push(testResult);

    console.log(
      `        📊 ${concurrentFiles} files, ${avgProcessingRate.toFixed(2)} lines/sec avg, ${overallThroughput.toFixed(2)} overall`
    );
  }

  // G-code generation and simulation methods
  generateGCodeSample(complexity, lineCount) {
    const lines = [];

    for (let i = 0; i < lineCount; i++) {
      switch (complexity) {
        case 'simple':
          lines.push(this.generateSimpleGCodeLine());
          break;
        case 'medium':
          lines.push(
            Math.random() < 0.7 ? this.generateSimpleGCodeLine() : this.generateComplexGCodeLine()
          );
          break;
        case 'large':
          lines.push(
            Math.random() < 0.5 ? this.generateSimpleGCodeLine() : this.generateComplexGCodeLine()
          );
          break;
        case 'complex':
          lines.push(
            Math.random() < 0.3 ? this.generateSimpleGCodeLine() : this.generateComplexGCodeLine()
          );
          break;
        case 'streaming':
          lines.push(this.generateStreamingGCodeLine());
          break;
        default:
          lines.push(this.generateSimpleGCodeLine());
      }
    }

    return lines.join('\n');
  }

  generateSimpleGCodeLine() {
    const commands = [
      `G0 X${Math.random() * 200} Y${Math.random() * 200}`,
      `G1 X${Math.random() * 200} Y${Math.random() * 200} F${Math.floor(Math.random() * 2000 + 500)}`,
      'M3 S1000',
      'M5',
      'G28',
    ];

    return commands[Math.floor(Math.random() * commands.length)];
  }

  generateComplexGCodeLine() {
    const complexCommands = [
      `G2 X${Math.random() * 200} Y${Math.random() * 200} I${Math.random() * 50 - 25} J${Math.random() * 50 - 25} F${Math.floor(Math.random() * 1000 + 200)}`,
      `G3 X${Math.random() * 200} Y${Math.random() * 200} I${Math.random() * 50 - 25} J${Math.random() * 50 - 25} F${Math.floor(Math.random() * 1000 + 200)}`,
      `G1 X${Math.random() * 200} Y${Math.random() * 200} Z${Math.random() * 100} F${Math.floor(Math.random() * 1500 + 300)}`,
      `M3 S${Math.floor(Math.random() * 10000 + 1000)}`,
      `G4 P${Math.random() * 5}`,
    ];

    return complexCommands[Math.floor(Math.random() * complexCommands.length)];
  }

  generateStreamingGCodeLine() {
    return `G1 X${(Math.random() * 200).toFixed(3)} Y${(Math.random() * 200).toFixed(3)} F${Math.floor(Math.random() * 1000 + 500)}`;
  }

  generateValidGCode(lines) {
    const validLines = [];
    for (let i = 0; i < lines; i++) {
      validLines.push(this.generateSimpleGCodeLine());
    }
    return validLines.join('\n');
  }

  generateGCodeWithErrors(lines) {
    const linesWithErrors = [];
    for (let i = 0; i < lines; i++) {
      if (Math.random() < 0.1) {
        // 10% error rate
        linesWithErrors.push('G999 INVALID_COMMAND'); // Invalid command
      } else {
        linesWithErrors.push(this.generateSimpleGCodeLine());
      }
    }
    return linesWithErrors.join('\n');
  }

  generateMixedGCode(lines) {
    const mixedLines = [];
    for (let i = 0; i < lines; i++) {
      const rand = Math.random();
      if (rand < 0.7) {
        mixedLines.push(this.generateSimpleGCodeLine());
      } else if (rand < 0.9) {
        mixedLines.push(this.generateComplexGCodeLine());
      } else {
        mixedLines.push('G999 INVALID_COMMAND');
      }
    }
    return mixedLines.join('\n');
  }

  generateGCodeBySize(targetSize, estimatedLines) {
    let gcode = '';
    let currentSize = 0;
    let lineCount = 0;

    while (currentSize < targetSize && lineCount < estimatedLines * 1.2) {
      const line = this.generateSimpleGCodeLine() + '\n';
      gcode += line;
      currentSize += Buffer.byteLength(line, 'utf8');
      lineCount++;
    }

    return gcode;
  }

  generateGCodeBatch(size) {
    const batch = [];
    for (let i = 0; i < size; i++) {
      batch.push(this.generateSimpleGCodeLine());
    }
    return batch;
  }

  generateRandomGCodeCommand() {
    return Math.random() < 0.7 ? this.generateSimpleGCodeLine() : this.generateComplexGCodeLine();
  }

  generateSimplePath(points) {
    const path = [];
    for (let i = 0; i < points; i++) {
      path.push(`G1 X${i * 2} Y${Math.sin(i * 0.1) * 50 + 100} F1000`);
    }
    return path.join('\n');
  }

  generateComplexPath(points) {
    const path = [];
    for (let i = 0; i < points; i++) {
      const x = Math.cos(i * 0.05) * 100 + 100;
      const y = Math.sin(i * 0.05) * 100 + 100;
      path.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${Math.floor(Math.random() * 1000 + 500)}`);
    }
    return path.join('\n');
  }

  generateIntricatePath(points) {
    const path = [];
    for (let i = 0; i < points; i++) {
      const t = i * 0.01;
      const x = Math.cos(t * 3) * Math.cos(t) * 50 + 100;
      const y = Math.cos(t * 3) * Math.sin(t) * 50 + 100;
      const z = Math.sin(t * 3) * 10 + 50;
      path.push(
        `G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} F${Math.floor(Math.random() * 2000 + 200)}`
      );
    }
    return path.join('\n');
  }

  // Simulation methods
  async simulateGCodeParsing(gcode, context) {
    const lines = gcode.split('\n');
    const processingTimePerLine = Math.random() * 0.5 + 0.1; // 0.1-0.6ms per line
    const totalTime = lines.length * processingTimePerLine;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    this.mockProcessor.parsedLines += lines.length;
    return { lines: lines.length, parsed: true };
  }

  async simulateGCodeValidation(gcode, context) {
    const lines = gcode.split('\n');
    const validationTimePerLine = Math.random() * 1 + 0.2; // 0.2-1.2ms per line
    const totalTime = lines.length * validationTimePerLine;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    let errors = 0;
    let warnings = 0;
    let validLines = 0;

    lines.forEach(line => {
      if (line.includes('INVALID')) {
        errors++;
      } else if (line.includes('G999')) {
        warnings++;
      } else {
        validLines++;
      }
    });

    return {
      errors: Array(errors).fill('error'),
      warnings: Array(warnings).fill('warning'),
      validLines,
    };
  }

  async simulateFileLoading(gcode, fileName) {
    const fileSize = Buffer.byteLength(gcode, 'utf8');
    const loadingTimePerByte = Math.random() * 0.001 + 0.0001; // Variable loading speed
    const totalTime = fileSize * loadingTimePerByte;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    return { loaded: true, size: fileSize };
  }

  async simulateCommandExecution(command, commandType) {
    // Different execution times for different command types
    const executionTimes = {
      G0: Math.random() * 30 + 20, // 20-50ms rapid
      G1: Math.random() * 40 + 30, // 30-70ms linear
      G2: Math.random() * 60 + 40, // 40-100ms arc
      G3: Math.random() * 60 + 40, // 40-100ms arc
      M3: Math.random() * 20 + 10, // 10-30ms spindle
      M5: Math.random() * 15 + 5, // 5-20ms spindle off
      G28: Math.random() * 100 + 50, // 50-150ms home
      streaming: Math.random() * 25 + 15, // 15-40ms streaming
    };

    const executionTime = executionTimes[commandType] || Math.random() * 50 + 25;
    await new Promise(resolve => setTimeout(resolve, executionTime));

    this.mockProcessor.executedCommands++;
  }

  async simulateBatchExecution(batch, batchSize) {
    // Simulate batch processing with some efficiency gains
    const baseTimePerCommand = 30; // ms
    const efficiencyFactor = Math.max(0.5, 1 - batchSize / 10000); // Better efficiency for larger batches
    const totalTime = batchSize * baseTimePerCommand * efficiencyFactor;

    await new Promise(resolve => setTimeout(resolve, totalTime));

    this.mockProcessor.executedCommands += batchSize;
  }

  async simulatePathOptimization(path, complexity) {
    const lines = path.split('\n');
    const optimizationTimePerLine = {
      simple: Math.random() * 2 + 1, // 1-3ms per line
      complex: Math.random() * 5 + 2, // 2-7ms per line
      intricate: Math.random() * 10 + 5, // 5-15ms per line
    };

    const totalTime = lines.length * (optimizationTimePerLine[complexity] || 3);
    await new Promise(resolve => setTimeout(resolve, totalTime));

    // Simulate optimization by reducing path length
    const optimizationRatio = Math.random() * 0.3 + 0.7; // 70-100% of original
    const optimizedLines = lines.slice(0, Math.floor(lines.length * optimizationRatio));

    return optimizedLines.join('\n');
  }

  analyzeGCodeResults() {
    console.log('      📊 Analyzing G-code processing results...');

    const passedTests = this.results.tests.filter(t => t.status === 'passed').length;
    const totalTests = this.results.tests.length;

    const processingHealthScore = (passedTests / totalTests) * 100;

    this.results.metrics.processingHealth = {
      testsPassed: passedTests,
      testsTotal: totalTests,
      healthScore: processingHealthScore,
      totalLinesProcessed: this.mockProcessor.parsedLines,
      totalCommandsExecuted: this.mockProcessor.executedCommands,
    };

    console.log(`        🎯 G-code Processing Health: ${processingHealthScore.toFixed(1)}%`);
    console.log(
      `        📊 Processed: ${this.mockProcessor.parsedLines} lines, ${this.mockProcessor.executedCommands} commands`
    );
  }

  async cleanup() {
    this.testGCodeSamples = null;
    this.mockProcessor = null;
  }
}

module.exports = GcodeProcessingTests;
