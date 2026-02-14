const { logger } = require('../logger');

/**
 * G-Code Execution Processor
 * Handles execution of G-code programs with real-time progress tracking
 */
class GCodeExecutionProcessor {
  constructor(gcodeExecutor, websocket) {
    this.executor = gcodeExecutor;
    this.websocket = websocket;
    this.name = 'GCodeExecutionProcessor';
  }

  /**
   * Process G-code execution job
   */
  async process(job) {
    const { program, options } = job.data;
    const jobId = job.id;

    logger.info(`Starting G-code execution job ${jobId}:`, {
      programSize: program ? program.length : 0,
      options: options,
    });

    try {
      // Validate job data
      this.validateJobData(program, options);

      // Initialize job progress
      await job.progress(0);

      const results = {
        success: true,
        linesExecuted: 0,
        totalLines: 0,
        executionTime: 0,
        errors: [],
        warnings: [],
      };

      const startTime = Date.now();

      // Execute G-code program
      if (this.executor && typeof this.executor.execute === 'function') {
        // Use real G-code executor
        const executionResult = await this.executeWithRealExecutor(job, program, options, results);
        Object.assign(results, executionResult);
      } else {
        // Simulate G-code execution
        logger.warn('No G-code executor available, simulating execution');
        const simulationResult = await this.simulateGCodeExecution(job, program, options, results);
        Object.assign(results, simulationResult);
      }

      results.executionTime = Date.now() - startTime;

      logger.info(`G-code execution job ${jobId} completed successfully:`, results);

      // Send final completion update
      if (this.websocket) {
        this.websocket.emit('job:gcode_completed', {
          jobId: jobId,
          results: results,
        });
      }

      return results;
    } catch (error) {
      logger.error(`G-code execution job ${jobId} failed:`, error);

      // Send error update
      if (this.websocket) {
        this.websocket.emit('job:gcode_failed', {
          jobId: jobId,
          error: error.message,
        });
      }

      throw new Error(`G-code execution failed: ${error.message}`);
    }
  }

  /**
   * Execute G-code using real executor
   */
  async executeWithRealExecutor(job, program, options, results) {
    const jobId = job.id;

    try {
      const executionResult = await this.executor.execute(program, {
        feedRate: options.feedRate,
        spindleSpeed: options.spindleSpeed,
        safetyChecks: options.safetyChecks !== false,
        onProgress: async (progress, currentLine, totalLines) => {
          // Update job progress
          await job.progress(progress);

          results.linesExecuted = currentLine;
          results.totalLines = totalLines;

          // Send real-time update via WebSocket
          if (this.websocket) {
            this.websocket.emit('job:progress', {
              jobId: jobId,
              queueName: 'gcode',
              progress: progress,
              type: 'gcode',
              linesExecuted: currentLine,
              totalLines: totalLines,
              currentCommand: this.getCurrentCommand(program, currentLine),
            });
          }
        },
        onLine: (lineNumber, command, result) => {
          // Log individual line execution if verbose logging is enabled
          if (options.verboseLogging) {
            logger.debug(`G-code line ${lineNumber}: ${command} -> ${result}`);
          }
        },
        onWarning: warning => {
          logger.warn(`G-code warning in job ${jobId}:`, warning);
          results.warnings.push(warning);

          if (this.websocket) {
            this.websocket.emit('job:gcode_warning', {
              jobId: jobId,
              warning: warning,
            });
          }
        },
      });

      return {
        ...results,
        ...executionResult,
      };
    } catch (error) {
      logger.error(`G-code executor error in job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Simulate G-code execution (fallback when no executor available)
   */
  async simulateGCodeExecution(job, program, options, results) {
    const jobId = job.id;
    const lines = program.split('\n').filter(line => line.trim().length > 0);

    results.totalLines = lines.length;

    logger.debug(`Simulating G-code execution for ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for job cancellation
      const currentJob = await job.queue.getJob(jobId);
      if (!currentJob || currentJob.opts.removeOnComplete === -1) {
        throw new Error('Job cancelled by user');
      }

      // Simulate line execution time based on command type
      const executionTime = this.calculateSimulatedExecutionTime(line, options);
      await this.delay(executionTime);

      results.linesExecuted = i + 1;

      // Update progress
      const progress = Math.round(((i + 1) / lines.length) * 100);
      await job.progress(progress);

      // Send real-time update via WebSocket
      if (this.websocket) {
        this.websocket.emit('job:progress', {
          jobId: jobId,
          queueName: 'gcode',
          progress: progress,
          type: 'gcode',
          linesExecuted: results.linesExecuted,
          totalLines: results.totalLines,
          currentCommand: line.trim(),
        });
      }

      // Simulate occasional warnings
      if (Math.random() < 0.05) {
        // 5% chance of warning
        const warning = `Simulated warning at line ${i + 1}: ${line}`;
        results.warnings.push(warning);

        if (this.websocket) {
          this.websocket.emit('job:gcode_warning', {
            jobId: jobId,
            warning: warning,
          });
        }
      }
    }

    return results;
  }

  /**
   * Validate job data
   */
  validateJobData(program, options) {
    if (!program || typeof program !== 'string') {
      throw new Error('Program must be a valid G-code string');
    }

    if (program.trim().length === 0) {
      throw new Error('Program cannot be empty');
    }

    // Validate options
    const validatedOptions = {
      feedRate: Math.max(0, options.feedRate || 100),
      spindleSpeed: Math.max(0, options.spindleSpeed || 0),
      safetyChecks: options.safetyChecks !== false,
      verboseLogging: options.verboseLogging === true,
      dryRun: options.dryRun === true,
    };

    // Validate feed rate range
    if (validatedOptions.feedRate > 10000) {
      throw new Error('Feed rate cannot exceed 10000 mm/min');
    }

    // Validate spindle speed range
    if (validatedOptions.spindleSpeed > 50000) {
      throw new Error('Spindle speed cannot exceed 50000 RPM');
    }

    Object.assign(options, validatedOptions);

    // Basic G-code validation
    this.validateGCodeProgram(program);
  }

  /**
   * Basic G-code program validation
   */
  validateGCodeProgram(program) {
    const lines = program.split('\n');
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0 || line.startsWith(';') || line.startsWith('(')) {
        continue; // Skip empty lines and comments
      }

      // Check for basic G-code format
      if (!/^[GMXYZIFJPRS\d\s\.\-]+$/i.test(line)) {
        errors.push(`Line ${i + 1}: Invalid G-code format: ${line}`);
      }

      // Check for dangerous commands (if safety checks enabled)
      if (this.isDangerousCommand(line)) {
        errors.push(`Line ${i + 1}: Potentially dangerous command: ${line}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`G-code validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Check if a G-code command is potentially dangerous
   */
  isDangerousCommand(line) {
    const upperLine = line.toUpperCase();

    // List of potentially dangerous commands
    const dangerousPatterns = [
      /M30/, // Program stop and rewind
      /M2$/, // Program end
      /G28/, // Return to home position (could be dangerous if not expected)
      /M5/, // Spindle stop (could be unexpected)
    ];

    return dangerousPatterns.some(pattern => pattern.test(upperLine));
  }

  /**
   * Get current command from program at specific line
   */
  getCurrentCommand(program, lineNumber) {
    const lines = program.split('\n');
    if (lineNumber >= 0 && lineNumber < lines.length) {
      return lines[lineNumber].trim();
    }
    return '';
  }

  /**
   * Calculate simulated execution time for a G-code line
   */
  calculateSimulatedExecutionTime(line, options) {
    const upperLine = line.toUpperCase();

    // Base execution time
    let baseTime = 100; // 100ms default

    // Movement commands take longer
    if (/G[01]/.test(upperLine)) {
      baseTime = 300;
    }

    // Arc commands take longer
    if (/G[023]/.test(upperLine)) {
      baseTime = 400;
    }

    // Tool changes take much longer
    if (/M6/.test(upperLine) || /T\d+/.test(upperLine)) {
      baseTime = 2000;
    }

    // Spindle commands
    if (/M[345]/.test(upperLine)) {
      baseTime = 500;
    }

    // Apply feed rate modifier
    const feedRateModifier = (options.feedRate || 100) / 100;
    return Math.max(50, baseTime / feedRateModifier);
  }

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processor name
   */
  getName() {
    return this.name;
  }
}

module.exports = GCodeExecutionProcessor;
