const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
fs.ensureDirSync(logsDir);

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;

    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }

    return logMessage;
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'arctos-robot-controller' },
  transports: [
    // Error log - only errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),

    // Combined log - all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true,
    }),

    // Audit log - user actions and security events
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 20,
      tailable: true,
    }),

    // Performance log - timing and metrics
    new winston.transports.File({
      filename: path.join(logsDir, 'performance.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let logMessage = `${timestamp} [${level}] ${message}`;
          if (Object.keys(meta).length > 0 && meta.service !== 'arctos-robot-controller') {
            logMessage += ` ${JSON.stringify(meta)}`;
          }
          return logMessage;
        })
      ),
    })
  );
}

// Specialized logging functions
class Logger {
  constructor() {
    this.winston = logger;
  }

  // Standard log levels
  error(message, meta = {}) {
    logger.error(message, meta);
  }

  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  info(message, meta = {}) {
    logger.info(message, meta);
  }

  debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  // Audit logging for security and user actions
  audit(action, user, details = {}) {
    const auditData = {
      category: 'audit',
      action,
      user: user
        ? {
            id: user.id,
            username: user.username,
            role: user.role,
          }
        : null,
      timestamp: new Date().toISOString(),
      ip: details.ip,
      userAgent: details.userAgent,
      ...details,
    };

    logger.info(`AUDIT: ${action}`, auditData);
  }

  // Security event logging
  security(event, details = {}) {
    const securityData = {
      category: 'security',
      event,
      timestamp: new Date().toISOString(),
      severity: details.severity || 'medium',
      ...details,
    };

    logger.warn(`SECURITY: ${event}`, securityData);
  }

  // Performance logging
  performance(operation, duration, details = {}) {
    const perfData = {
      category: 'performance',
      operation,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.info(`PERF: ${operation} completed in ${duration}ms`, perfData);
  }

  // Robot operation logging
  robot(action, data = {}) {
    const robotData = {
      category: 'robot',
      action,
      timestamp: new Date().toISOString(),
      ...data,
    };

    logger.info(`ROBOT: ${action}`, robotData);
  }

  // Hardware communication logging
  hardware(controller, operation, details = {}) {
    const hardwareData = {
      category: 'hardware',
      controller,
      operation,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.info(`HARDWARE: ${controller} - ${operation}`, hardwareData);
  }

  // G-code execution logging
  gcode(event, details = {}) {
    const gcodeData = {
      category: 'gcode',
      event,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.info(`GCODE: ${event}`, gcodeData);
  }

  // API request logging
  api(method, endpoint, user, response = {}) {
    const apiData = {
      category: 'api',
      method,
      endpoint,
      user: user
        ? {
            id: user.id,
            username: user.username,
            role: user.role,
          }
        : 'anonymous',
      response: {
        status: response.status,
        success: response.success,
        error: response.error,
      },
      timestamp: new Date().toISOString(),
    };

    const logLevel = response.status >= 400 ? 'warn' : 'info';
    logger[logLevel](`API: ${method} ${endpoint}`, apiData);
  }

  // Database operation logging
  database(operation, table, details = {}) {
    const dbData = {
      category: 'database',
      operation,
      table,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.info(`DB: ${operation} on ${table}`, dbData);
  }

  // Configuration change logging
  config(action, changes = {}) {
    const configData = {
      category: 'configuration',
      action,
      changes,
      timestamp: new Date().toISOString(),
    };

    logger.info(`CONFIG: ${action}`, configData);
  }
}

// Performance timing middleware
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log slow requests (> 1000ms)
    if (duration > 1000) {
      loggerInstance.performance(`Slow API Request: ${req.method} ${req.path}`, duration, {
        method: req.method,
        path: req.path,
        user: req.user ? req.user.username : 'anonymous',
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

// Request logging middleware
const requestLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Capture original response methods
  const originalSend = res.send;
  const originalStatus = res.status;

  let responseStatus = 200;
  let responseData = null;

  // Override status method
  res.status = function (code) {
    responseStatus = code;
    return originalStatus.call(this, code);
  };

  // Override send method to capture response
  res.send = function (data) {
    responseData = data;

    const duration = Date.now() - startTime;

    // Log the request
    loggerInstance.api(req.method, req.path, req.user, {
      status: responseStatus,
      success: responseStatus < 400,
      duration: `${duration}ms`,
      error:
        responseStatus >= 400
          ? typeof data === 'object'
            ? data.message || data.error
            : data
          : null,
    });

    return originalSend.call(this, data);
  };

  next();
};

// Error logging middleware
const errorLoggingMiddleware = (err, req, res, next) => {
  loggerInstance.error('Unhandled error in request', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    user: req.user ? req.user.username : 'anonymous',
    body: req.body,
    query: req.query,
  });

  // Send error response
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};

// Create logger instance
const loggerInstance = new Logger();

// Override console methods in production to use structured logging
if (process.env.NODE_ENV === 'production') {
  console.log = (...args) => loggerInstance.info(args.join(' '));
  console.info = (...args) => loggerInstance.info(args.join(' '));
  console.warn = (...args) => loggerInstance.warn(args.join(' '));
  console.error = (...args) => loggerInstance.error(args.join(' '));
}

module.exports = {
  logger: loggerInstance,
  performanceMiddleware,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  Logger,
};
