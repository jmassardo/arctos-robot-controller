const cron = require('node-cron');
const { logger } = require('./logger');

/**
 * Job Scheduler
 * Handles scheduled and recurring job execution using cron expressions
 */
class JobScheduler {
  constructor(jobQueueManager) {
    this.jobQueue = jobQueueManager;
    this.scheduledJobs = new Map();
    this.isInitialized = false;

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }

  /**
   * Initialize job scheduler
   */
  async initialize() {
    try {
      this.isInitialized = true;
      logger.info('Job Scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Job Scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule a job with cron expression
   */
  scheduleJob(name, cronExpression, queueName, jobType, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Job Scheduler not initialized');
    }

    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    if (this.scheduledJobs.has(name)) {
      throw new Error(`Scheduled job '${name}' already exists`);
    }

    const scheduledJob = {
      name: name,
      cronExpression: cronExpression,
      queueName: queueName,
      jobType: jobType,
      jobData: jobData,
      options: options,
      isActive: true,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      createdAt: new Date(),
      createdBy: options.userId || 'system',
    };

    // Create cron task
    const task = cron.schedule(
      cronExpression,
      async () => {
        if (scheduledJob.isActive) {
          try {
            await this.executeScheduledJob(scheduledJob);
          } catch (error) {
            logger.error(`Scheduled job '${name}' execution failed:`, error);
          }
        }
      },
      {
        scheduled: false,
        timezone: options.timezone || 'UTC',
      }
    );

    scheduledJob.task = task;
    scheduledJob.nextRun = this.calculateNextRun(cronExpression, options.timezone);

    this.scheduledJobs.set(name, scheduledJob);

    // Start the scheduled job
    task.start();

    logger.info(`Scheduled job created: ${name}`, {
      cronExpression: cronExpression,
      queueName: queueName,
      jobType: jobType,
      nextRun: scheduledJob.nextRun,
    });

    return {
      name: name,
      scheduled: true,
      nextRun: scheduledJob.nextRun,
    };
  }

  /**
   * Schedule a delayed job (one-time execution after delay)
   */
  scheduleDelayedJob(name, delayMs, queueName, jobType, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Job Scheduler not initialized');
    }

    if (this.scheduledJobs.has(name)) {
      throw new Error(`Scheduled job '${name}' already exists`);
    }

    const scheduledJob = {
      name: name,
      delayMs: delayMs,
      queueName: queueName,
      jobType: jobType,
      jobData: jobData,
      options: options,
      isActive: true,
      lastRun: null,
      nextRun: new Date(Date.now() + delayMs),
      runCount: 0,
      isOneTime: true,
      createdAt: new Date(),
      createdBy: options.userId || 'system',
    };

    // Create timeout for delayed execution
    const timeout = setTimeout(async () => {
      if (scheduledJob.isActive) {
        try {
          await this.executeScheduledJob(scheduledJob);
          // Remove one-time scheduled job after execution
          this.removeScheduledJob(name);
        } catch (error) {
          logger.error(`Delayed job '${name}' execution failed:`, error);
          this.removeScheduledJob(name);
        }
      }
    }, delayMs);

    scheduledJob.timeout = timeout;
    this.scheduledJobs.set(name, scheduledJob);

    logger.info(`Delayed job scheduled: ${name}`, {
      delayMs: delayMs,
      queueName: queueName,
      jobType: jobType,
      executeAt: scheduledJob.nextRun,
    });

    return {
      name: name,
      scheduled: true,
      executeAt: scheduledJob.nextRun,
    };
  }

  /**
   * Execute a scheduled job
   */
  async executeScheduledJob(scheduledJob) {
    const startTime = Date.now();

    try {
      logger.info(`Executing scheduled job: ${scheduledJob.name}`);

      // Add job to queue
      const job = await this.jobQueue.addJob(
        scheduledJob.queueName,
        scheduledJob.jobType,
        scheduledJob.jobData,
        {
          ...scheduledJob.options,
          scheduledJobName: scheduledJob.name,
          isScheduled: true,
        }
      );

      // Update scheduled job statistics
      scheduledJob.lastRun = new Date();
      scheduledJob.runCount++;

      if (scheduledJob.cronExpression) {
        scheduledJob.nextRun = this.calculateNextRun(
          scheduledJob.cronExpression,
          scheduledJob.options.timezone
        );
      }

      const executionTime = Date.now() - startTime;

      logger.info(`Scheduled job executed successfully: ${scheduledJob.name}`, {
        jobId: job.id,
        executionTime: executionTime,
        runCount: scheduledJob.runCount,
        nextRun: scheduledJob.nextRun,
      });

      return job;
    } catch (error) {
      logger.error(`Scheduled job execution failed: ${scheduledJob.name}`, error);
      throw error;
    }
  }

  /**
   * Remove/cancel a scheduled job
   */
  removeScheduledJob(name) {
    const scheduledJob = this.scheduledJobs.get(name);
    if (!scheduledJob) {
      throw new Error(`Scheduled job '${name}' not found`);
    }

    // Stop cron task or timeout
    if (scheduledJob.task) {
      scheduledJob.task.stop();
      scheduledJob.task.destroy();
    }

    if (scheduledJob.timeout) {
      clearTimeout(scheduledJob.timeout);
    }

    this.scheduledJobs.delete(name);

    logger.info(`Scheduled job removed: ${name}`);

    return true;
  }

  /**
   * Update a scheduled job
   */
  updateScheduledJob(name, updates) {
    const scheduledJob = this.scheduledJobs.get(name);
    if (!scheduledJob) {
      throw new Error(`Scheduled job '${name}' not found`);
    }

    // Handle cron expression update
    if (updates.cronExpression && updates.cronExpression !== scheduledJob.cronExpression) {
      if (!cron.validate(updates.cronExpression)) {
        throw new Error(`Invalid cron expression: ${updates.cronExpression}`);
      }

      // Stop old task
      if (scheduledJob.task) {
        scheduledJob.task.stop();
        scheduledJob.task.destroy();
      }

      // Create new task
      const task = cron.schedule(
        updates.cronExpression,
        async () => {
          if (scheduledJob.isActive) {
            try {
              await this.executeScheduledJob(scheduledJob);
            } catch (error) {
              logger.error(`Scheduled job '${name}' execution failed:`, error);
            }
          }
        },
        {
          scheduled: scheduledJob.isActive,
          timezone: updates.timezone || scheduledJob.options.timezone || 'UTC',
        }
      );

      scheduledJob.task = task;
      scheduledJob.cronExpression = updates.cronExpression;
      scheduledJob.nextRun = this.calculateNextRun(
        updates.cronExpression,
        updates.timezone || scheduledJob.options.timezone
      );
    }

    // Update other properties
    if (updates.jobData) {
      scheduledJob.jobData = { ...scheduledJob.jobData, ...updates.jobData };
    }

    if (updates.options) {
      scheduledJob.options = { ...scheduledJob.options, ...updates.options };
    }

    if (typeof updates.isActive !== 'undefined') {
      scheduledJob.isActive = updates.isActive;
      if (scheduledJob.task) {
        if (updates.isActive) {
          scheduledJob.task.start();
        } else {
          scheduledJob.task.stop();
        }
      }
    }

    logger.info(`Scheduled job updated: ${name}`);

    return scheduledJob;
  }

  /**
   * Get scheduled job details
   */
  getScheduledJob(name) {
    const scheduledJob = this.scheduledJobs.get(name);
    if (!scheduledJob) {
      return null;
    }

    return {
      name: scheduledJob.name,
      cronExpression: scheduledJob.cronExpression,
      delayMs: scheduledJob.delayMs,
      queueName: scheduledJob.queueName,
      jobType: scheduledJob.jobType,
      jobData: scheduledJob.jobData,
      options: scheduledJob.options,
      isActive: scheduledJob.isActive,
      isOneTime: scheduledJob.isOneTime,
      lastRun: scheduledJob.lastRun,
      nextRun: scheduledJob.nextRun,
      runCount: scheduledJob.runCount,
      createdAt: scheduledJob.createdAt,
      createdBy: scheduledJob.createdBy,
    };
  }

  /**
   * List all scheduled jobs
   */
  listScheduledJobs() {
    return Array.from(this.scheduledJobs.values()).map(job => ({
      name: job.name,
      cronExpression: job.cronExpression,
      delayMs: job.delayMs,
      queueName: job.queueName,
      jobType: job.jobType,
      isActive: job.isActive,
      isOneTime: job.isOneTime,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      runCount: job.runCount,
      createdAt: job.createdAt,
      createdBy: job.createdBy,
    }));
  }

  /**
   * Pause a scheduled job
   */
  pauseScheduledJob(name) {
    const scheduledJob = this.scheduledJobs.get(name);
    if (!scheduledJob) {
      throw new Error(`Scheduled job '${name}' not found`);
    }

    scheduledJob.isActive = false;

    if (scheduledJob.task) {
      scheduledJob.task.stop();
    }

    logger.info(`Scheduled job paused: ${name}`);

    return true;
  }

  /**
   * Resume a scheduled job
   */
  resumeScheduledJob(name) {
    const scheduledJob = this.scheduledJobs.get(name);
    if (!scheduledJob) {
      throw new Error(`Scheduled job '${name}' not found`);
    }

    scheduledJob.isActive = true;

    if (scheduledJob.task) {
      scheduledJob.task.start();
      scheduledJob.nextRun = this.calculateNextRun(
        scheduledJob.cronExpression,
        scheduledJob.options.timezone
      );
    }

    logger.info(`Scheduled job resumed: ${name}`);

    return true;
  }

  /**
   * Get scheduled job statistics
   */
  getScheduledJobStats() {
    const jobs = Array.from(this.scheduledJobs.values());

    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(job => job.isActive).length,
      pausedJobs: jobs.filter(job => !job.isActive).length,
      oneTimeJobs: jobs.filter(job => job.isOneTime).length,
      recurringJobs: jobs.filter(job => !job.isOneTime).length,
      totalRuns: jobs.reduce((sum, job) => sum + job.runCount, 0),
    };
  }

  /**
   * Calculate next run time for cron expression
   */
  calculateNextRun(cronExpression, timezone = 'UTC') {
    try {
      // This is a simplified implementation
      // In a real scenario, you'd use a proper cron parser
      const task = cron.schedule(cronExpression, () => {}, {
        scheduled: false,
        timezone: timezone,
      });

      // Since node-cron doesn't provide next run time directly,
      // we'll estimate it based on current time
      const now = new Date();

      // For simplicity, assume next run is within next hour
      // Real implementation would properly parse cron expression
      return new Date(now.getTime() + 60 * 60 * 1000);
    } catch (error) {
      logger.error('Error calculating next run time:', error);
      return null;
    }
  }

  /**
   * Validate cron expression
   */
  validateCronExpression(cronExpression) {
    return cron.validate(cronExpression);
  }

  /**
   * Get supported cron expression examples
   */
  getCronExamples() {
    return {
      every_minute: '* * * * *',
      every_5_minutes: '*/5 * * * *',
      every_hour: '0 * * * *',
      every_day_midnight: '0 0 * * *',
      every_week_sunday: '0 0 * * 0',
      every_month_first: '0 0 1 * *',
      weekdays_9am: '0 9 * * 1-5',
      every_15_seconds: '*/15 * * * * *',
    };
  }

  /**
   * Parse cron expression to human-readable description
   */
  describeCronExpression(cronExpression) {
    // This would typically use a cron expression parser library
    // For now, providing a simple mapping for common patterns
    const descriptions = {
      '* * * * *': 'Every minute',
      '*/5 * * * *': 'Every 5 minutes',
      '0 * * * *': 'Every hour',
      '0 0 * * *': 'Daily at midnight',
      '0 0 * * 0': 'Weekly on Sunday at midnight',
      '0 0 1 * *': 'Monthly on the 1st at midnight',
      '0 9 * * 1-5': 'Weekdays at 9 AM',
    };

    return descriptions[cronExpression] || 'Custom schedule';
  }

  /**
   * Export scheduled jobs configuration
   */
  exportScheduledJobs() {
    const jobs = this.listScheduledJobs();

    return {
      exported_at: new Date().toISOString(),
      version: '1.0',
      jobs: jobs.map(job => ({
        name: job.name,
        cronExpression: job.cronExpression,
        delayMs: job.delayMs,
        queueName: job.queueName,
        jobType: job.jobType,
        jobData: job.jobData,
        options: job.options,
        isActive: job.isActive,
        createdBy: job.createdBy,
      })),
    };
  }

  /**
   * Import scheduled jobs from configuration
   */
  async importScheduledJobs(config) {
    if (!config.jobs || !Array.isArray(config.jobs)) {
      throw new Error('Invalid scheduled jobs configuration');
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    for (const jobConfig of config.jobs) {
      try {
        if (jobConfig.cronExpression) {
          this.scheduleJob(
            jobConfig.name,
            jobConfig.cronExpression,
            jobConfig.queueName,
            jobConfig.jobType,
            jobConfig.jobData,
            jobConfig.options
          );
        } else if (jobConfig.delayMs) {
          this.scheduleDelayedJob(
            jobConfig.name,
            jobConfig.delayMs,
            jobConfig.queueName,
            jobConfig.jobType,
            jobConfig.jobData,
            jobConfig.options
          );
        } else {
          throw new Error('Missing cronExpression or delayMs');
        }

        results.imported++;
      } catch (error) {
        logger.error(`Failed to import scheduled job '${jobConfig.name}':`, error);
        results.errors.push({
          jobName: jobConfig.name,
          error: error.message,
        });
        results.skipped++;
      }
    }

    logger.info('Scheduled jobs import completed:', results);

    return results;
  }

  /**
   * Shutdown job scheduler
   */
  async shutdown() {
    try {
      logger.info('Shutting down Job Scheduler...');

      // Stop all scheduled jobs
      for (const [name, scheduledJob] of this.scheduledJobs) {
        if (scheduledJob.task) {
          scheduledJob.task.stop();
          scheduledJob.task.destroy();
        }

        if (scheduledJob.timeout) {
          clearTimeout(scheduledJob.timeout);
        }

        logger.info(`Stopped scheduled job: ${name}`);
      }

      this.scheduledJobs.clear();
      this.isInitialized = false;

      logger.info('Job Scheduler shutdown complete');
    } catch (error) {
      logger.error('Error during Job Scheduler shutdown:', error);
      throw error;
    }
  }
}

module.exports = JobScheduler;
