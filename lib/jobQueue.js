const Bull = require('bull');
const Redis = require('ioredis');
const { logger } = require('./logger');

/**
 * Job Queue Manager - Redis-backed job queuing with Bull.js
 * Handles position sequences, G-code execution, and maintenance tasks
 */
class JobQueueManager {
  constructor() {
    // Redis configuration
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    };

    this.redis = new Redis(this.redisConfig);
    this.queues = new Map();
    this.processors = new Map();
    this.isInitialized = false;
    this.websocket = null;

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }

  /**
   * Initialize job queues and processors
   */
  async initialize(websocket = null) {
    try {
      this.websocket = websocket;

      // Test Redis connection
      await this.redis.ping();
      logger.info('Redis connection established');

      await this.initializeQueues();
      this.setupEventHandlers();

      this.isInitialized = true;
      logger.info('Job Queue Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Job Queue Manager:', error);
      throw error;
    }
  }

  /**
   * Initialize all job queues
   */
  async initializeQueues() {
    // Position sequence queue
    this.queues.set(
      'positions',
      new Bull('position sequences', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            settings: { delay: 2000 },
          },
          delay: 1000,
        },
        settings: {
          stalledInterval: 30000,
          maxStalledCount: 1,
        },
      })
    );

    // G-code execution queue
    this.queues.set(
      'gcode',
      new Bull('gcode execution', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 10,
          attempts: 2,
          backoff: {
            type: 'fixed',
            settings: { delay: 5000 },
          },
        },
        settings: {
          stalledInterval: 60000,
          maxStalledCount: 1,
        },
      })
    );

    // Maintenance tasks queue
    this.queues.set(
      'maintenance',
      new Bull('maintenance tasks', {
        redis: this.redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 1,
        },
      })
    );

    logger.info('Job queues initialized:', Array.from(this.queues.keys()));
  }

  /**
   * Register a job processor for a queue
   */
  registerProcessor(queueName, processor) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    this.processors.set(queueName, processor);

    // Register the processor with the queue
    queue.process('*', async job => {
      return await processor.process(job);
    });

    logger.info(`Processor registered for queue: ${queueName}`);
  }

  /**
   * Add a job to a queue
   */
  async addJob(queueName, jobType, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Job Queue Manager not initialized');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobOptions = {
      ...options,
      timestamp: Date.now(),
      userId: jobData.userId || 'system',
    };

    try {
      const job = await queue.add(jobType, jobData, jobOptions);

      logger.info(`Job added to queue '${queueName}':`, {
        jobId: job.id,
        jobType: jobType,
        userId: jobData.userId,
      });

      // Emit job creation event
      if (this.websocket) {
        this.websocket.emit('job:created', {
          jobId: job.id,
          queueName: queueName,
          jobType: jobType,
          status: 'waiting',
          createdAt: new Date(),
        });
      }

      return job;
    } catch (error) {
      logger.error(`Failed to add job to queue '${queueName}':`, error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return await queue.getJob(jobId);
  }

  /**
   * Cancel/remove a job
   */
  async cancelJob(queueName, jobId) {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found in queue '${queueName}'`);
    }

    await job.remove();

    logger.info(`Job cancelled: ${jobId} from queue '${queueName}'`);

    // Emit job cancellation event
    if (this.websocket) {
      this.websocket.emit('job:cancelled', {
        jobId: jobId,
        queueName: queueName,
      });
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueName, jobId) {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found in queue '${queueName}'`);
    }

    await job.retry();

    logger.info(`Job retried: ${jobId} from queue '${queueName}'`);

    // Emit job retry event
    if (this.websocket) {
      this.websocket.emit('job:retried', {
        jobId: jobId,
        queueName: queueName,
      });
    }
  }

  /**
   * Get jobs from a queue with filtering
   */
  async getJobs(
    queueName,
    types = ['waiting', 'active', 'completed', 'failed', 'delayed'],
    start = 0,
    end = -1
  ) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.getJobs(types, start, end);

    return jobs.map(job => ({
      id: job.id,
      queueName: queueName,
      jobType: job.name,
      data: job.data,
      opts: job.opts,
      progress: job._progress,
      delay: job.delay,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
    }));
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    const delayed = await queue.getDelayed();

    return {
      queueName: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  }

  /**
   * Get statistics for all queues
   */
  async getAllQueueStats() {
    const stats = {};

    for (const queueName of this.queues.keys()) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return stats;
  }

  /**
   * Setup event handlers for all queues
   */
  setupEventHandlers() {
    for (const [queueName, queue] of this.queues) {
      // Job events
      queue.on('completed', (job, result) => {
        logger.info(`Job completed: ${job.id} in queue '${queueName}'`);
        if (this.websocket) {
          this.websocket.emit('job:completed', {
            jobId: job.id,
            queueName: queueName,
            result: result,
            completedAt: new Date(),
          });
        }
      });

      queue.on('failed', (job, err) => {
        logger.error(`Job failed: ${job.id} in queue '${queueName}':`, err);
        if (this.websocket) {
          this.websocket.emit('job:failed', {
            jobId: job.id,
            queueName: queueName,
            error: err.message,
            failedAt: new Date(),
          });
        }
      });

      queue.on('active', (job, jobPromise) => {
        logger.info(`Job started: ${job.id} in queue '${queueName}'`);
        if (this.websocket) {
          this.websocket.emit('job:active', {
            jobId: job.id,
            queueName: queueName,
            startedAt: new Date(),
          });
        }
      });

      queue.on('stalled', job => {
        logger.warn(`Job stalled: ${job.id} in queue '${queueName}'`);
        if (this.websocket) {
          this.websocket.emit('job:stalled', {
            jobId: job.id,
            queueName: queueName,
            stalledAt: new Date(),
          });
        }
      });

      queue.on('progress', (job, progress) => {
        if (this.websocket) {
          this.websocket.emit('job:progress', {
            jobId: job.id,
            queueName: queueName,
            progress: progress,
            updatedAt: new Date(),
          });
        }
      });

      // Queue events
      queue.on('error', error => {
        logger.error(`Queue error in '${queueName}':`, error);
      });
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);

    if (this.websocket) {
      this.websocket.emit('queue:paused', { queueName: queueName });
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);

    if (this.websocket) {
      this.websocket.emit('queue:resumed', { queueName: queueName });
    }
  }

  /**
   * Clean old jobs from a queue
   */
  async cleanQueue(queueName, grace = 5000, limit = 100, type = 'completed') {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.clean(grace, limit, type);
    logger.info(`Cleaned ${jobs.length} ${type} jobs from queue '${queueName}'`);

    return jobs.length;
  }

  /**
   * Get queue names
   */
  getQueueNames() {
    return Array.from(this.queues.keys());
  }

  /**
   * Check if queue exists
   */
  hasQueue(queueName) {
    return this.queues.has(queueName);
  }

  /**
   * Shutdown job queue manager
   */
  async shutdown() {
    try {
      logger.info('Shutting down Job Queue Manager...');

      // Close all queues
      for (const [queueName, queue] of this.queues) {
        await queue.close();
        logger.info(`Queue closed: ${queueName}`);
      }

      // Close Redis connection
      await this.redis.quit();
      logger.info('Redis connection closed');

      this.isInitialized = false;
      logger.info('Job Queue Manager shutdown complete');
    } catch (error) {
      logger.error('Error during Job Queue Manager shutdown:', error);
      throw error;
    }
  }
}

// Singleton instance
let jobQueueManager = null;

/**
 * Get the job queue manager instance
 */
function getJobQueueManager() {
  if (!jobQueueManager) {
    jobQueueManager = new JobQueueManager();
  }
  return jobQueueManager;
}

module.exports = {
  JobQueueManager,
  getJobQueueManager,
};
