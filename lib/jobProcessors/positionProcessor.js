const { logger } = require('../logger');

/**
 * Position Sequence Processor
 * Handles execution of position sequences with real-time progress tracking
 */
class PositionSequenceProcessor {
  constructor(hardwareManager, websocket) {
    this.hardware = hardwareManager;
    this.websocket = websocket;
    this.name = 'PositionSequenceProcessor';
  }

  /**
   * Process position sequence job
   */
  async process(job) {
    const { positions, options } = job.data;
    const jobId = job.id;

    logger.info(`Starting position sequence job ${jobId}:`, {
      positionCount: positions.length,
      options: options,
    });

    try {
      // Validate job data
      this.validateJobData(positions, options);

      // Initialize job progress
      await job.progress(0);

      const results = {
        success: true,
        positionsExecuted: 0,
        totalPositions: positions.length,
        executionTime: 0,
        errors: [],
      };

      const startTime = Date.now();

      // Execute each position in sequence
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];

        try {
          // Check for job cancellation
          const currentJob = await job.queue.getJob(jobId);
          if (!currentJob || currentJob.opts.removeOnComplete === -1) {
            throw new Error('Job cancelled by user');
          }

          logger.debug(`Executing position ${i + 1}/${positions.length}:`, position);

          // Execute position move
          await this.executePosition(position, options);

          results.positionsExecuted++;

          // Update progress
          const progress = Math.round(((i + 1) / positions.length) * 100);
          await job.progress(progress);

          // Send real-time update via WebSocket
          if (this.websocket) {
            this.websocket.emit('job:progress', {
              jobId: jobId,
              queueName: 'positions',
              progress: progress,
              currentPosition: position,
              positionsExecuted: results.positionsExecuted,
              totalPositions: positions.length,
              estimatedTimeRemaining: this.calculateTimeRemaining(
                startTime,
                i + 1,
                positions.length
              ),
            });
          }

          // Pause between positions if specified
          if (options.pauseBetween > 0) {
            await this.delay(options.pauseBetween);
          }
        } catch (positionError) {
          logger.error(`Error executing position ${i + 1}:`, positionError);
          results.errors.push({
            positionIndex: i,
            position: position,
            error: positionError.message,
          });

          // Decide whether to continue or abort based on error handling options
          if (options.stopOnError !== false) {
            throw positionError;
          }
        }
      }

      // Handle repeat count
      if (options.repeatCount > 1) {
        for (let repeat = 1; repeat < options.repeatCount; repeat++) {
          logger.info(`Starting repeat ${repeat + 1}/${options.repeatCount} of position sequence`);

          // Re-execute the sequence with updated progress calculation
          for (let i = 0; i < positions.length; i++) {
            const position = positions[i];

            await this.executePosition(position, options);
            results.positionsExecuted++;

            const totalExecutions = positions.length * options.repeatCount;
            const currentExecution = repeat * positions.length + (i + 1);
            const progress = Math.round((currentExecution / totalExecutions) * 100);

            await job.progress(progress);

            if (this.websocket) {
              this.websocket.emit('job:progress', {
                jobId: jobId,
                queueName: 'positions',
                progress: progress,
                currentPosition: position,
                repeatNumber: repeat + 1,
                totalRepeats: options.repeatCount,
                positionsExecuted: results.positionsExecuted,
              });
            }

            if (options.pauseBetween > 0) {
              await this.delay(options.pauseBetween);
            }
          }

          // Pause between repeats if specified
          if (options.pauseBetweenRepeats > 0) {
            await this.delay(options.pauseBetweenRepeats);
          }
        }
      }

      results.executionTime = Date.now() - startTime;
      results.totalPositions = positions.length * (options.repeatCount || 1);

      logger.info(`Position sequence job ${jobId} completed successfully:`, results);

      // Send final completion update
      if (this.websocket) {
        this.websocket.emit('job:position_sequence_completed', {
          jobId: jobId,
          results: results,
        });
      }

      return results;
    } catch (error) {
      logger.error(`Position sequence job ${jobId} failed:`, error);

      // Send error update
      if (this.websocket) {
        this.websocket.emit('job:position_sequence_failed', {
          jobId: jobId,
          error: error.message,
        });
      }

      throw new Error(`Position sequence failed: ${error.message}`);
    }
  }

  /**
   * Validate job data
   */
  validateJobData(positions, options) {
    if (!Array.isArray(positions) || positions.length === 0) {
      throw new Error('Positions must be a non-empty array');
    }

    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      if (!position || typeof position !== 'object') {
        throw new Error(`Invalid position at index ${i}: must be an object`);
      }

      // Validate required position fields
      const requiredFields = ['name'];
      for (const field of requiredFields) {
        if (!position[field]) {
          throw new Error(`Invalid position at index ${i}: missing field '${field}'`);
        }
      }
    }

    // Validate options
    const validatedOptions = {
      speed: options.speed || 'normal',
      pauseBetween: Math.max(0, options.pauseBetween || 0),
      pauseBetweenRepeats: Math.max(0, options.pauseBetweenRepeats || 0),
      repeatCount: Math.max(1, options.repeatCount || 1),
      stopOnError: options.stopOnError !== false,
    };

    // Validate speed setting
    const validSpeeds = ['slow', 'normal', 'fast'];
    if (!validSpeeds.includes(validatedOptions.speed)) {
      throw new Error(
        `Invalid speed setting: ${validatedOptions.speed}. Must be one of: ${validSpeeds.join(', ')}`
      );
    }

    Object.assign(options, validatedOptions);
  }

  /**
   * Execute a single position
   */
  async executePosition(position, options) {
    if (!this.hardware) {
      logger.warn('No hardware manager available, simulating position execution');
      await this.simulatePositionExecution(position, options);
      return;
    }

    // Convert speed setting to hardware speed value
    const speedMap = {
      slow: 0.3,
      normal: 1.0,
      fast: 2.0,
    };

    const speed = speedMap[options.speed] || 1.0;

    try {
      // Execute the position move through the hardware manager
      if (typeof this.hardware.moveToPosition === 'function') {
        await this.hardware.moveToPosition(position, { speed });
      } else if (typeof this.hardware.executePosition === 'function') {
        await this.hardware.executePosition(position, { speed });
      } else {
        logger.warn('Hardware manager missing position execution method, simulating');
        await this.simulatePositionExecution(position, options);
      }
    } catch (error) {
      logger.error(`Failed to execute position ${position.name}:`, error);
      throw error;
    }
  }

  /**
   * Simulate position execution (fallback when no hardware available)
   */
  async simulatePositionExecution(position, options) {
    const speedMap = {
      slow: 3000,
      normal: 1500,
      fast: 800,
    };

    const executionTime = speedMap[options.speed] || 1500;

    logger.debug(`Simulating execution of position ${position.name} (${executionTime}ms)`);
    await this.delay(executionTime);
  }

  /**
   * Calculate estimated time remaining
   */
  calculateTimeRemaining(startTime, completedItems, totalItems) {
    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / completedItems;
    const remainingItems = totalItems - completedItems;

    return Math.round(remainingItems * avgTimePerItem);
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

module.exports = PositionSequenceProcessor;
