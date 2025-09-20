const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, query, param, validationResult } = require('express-validator');
const { logger } = require('./logger');

// Rate limiting configurations
const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.security('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        user: req.user ? req.user.username : 'anonymous'
      });
      
      res.status(429).json({
        success: false,
        error: message
      });
    }
  });
};

// Different rate limits for different endpoints
const rateLimits = {
  // Strict rate limiting for authentication endpoints
  auth: createRateLimit(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    'Too many authentication attempts. Please try again in 15 minutes.',
    true // Skip successful requests
  ),
  
  // General API rate limiting
  api: createRateLimit(
    1 * 60 * 1000, // 1 minute
    100, // 100 requests
    'Too many API requests. Please slow down.'
  ),
  
  // Strict rate limiting for robot control endpoints
  robotControl: createRateLimit(
    1 * 60 * 1000, // 1 minute
    60, // 60 requests per minute
    'Too many robot control requests. Please slow down.'
  ),
  
  // Emergency stop (more permissive to ensure safety)
  emergencyStop: createRateLimit(
    1 * 60 * 1000, // 1 minute
    100, // 100 requests per minute (very permissive for safety)
    'Emergency stop rate limit exceeded.'
  ),
  
  // Configuration changes
  config: createRateLimit(
    5 * 60 * 1000, // 5 minutes
    10, // 10 changes
    'Too many configuration changes. Please wait before making more changes.'
  ),
  
  // File operations
  fileOps: createRateLimit(
    1 * 60 * 1000, // 1 minute
    20, // 20 operations
    'Too many file operations. Please slow down.'
  )
};

// Security headers configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for some Electron functionality
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input validation rules
const validationRules = {
  // User registration validation
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
    body('role')
      .optional()
      .isIn(['admin', 'operator', 'viewer'])
      .withMessage('Role must be admin, operator, or viewer')
  ],
  
  // Login validation
  login: [
    body('username')
      .trim()
      .notEmpty()
      .isLength({ max: 100 })
      .withMessage('Username is required and must be less than 100 characters'),
    body('password')
      .notEmpty()
      .isLength({ max: 200 })
      .withMessage('Password is required')
  ],
  
  // Position validation
  position: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\-\s]+$/)
      .withMessage('Position name must be 1-100 characters and contain only alphanumeric characters, spaces, underscores, and hyphens'),
    body('axes')
      .isObject()
      .withMessage('Axes must be an object'),
    body('manipulators')
      .optional()
      .isObject()
      .withMessage('Manipulators must be an object'),
    body('delay')
      .optional()
      .isInt({ min: 0, max: 60000 })
      .withMessage('Delay must be between 0 and 60000 milliseconds')
  ],
  
  // G-code validation
  gcode: [
    body('gcode')
      .notEmpty()
      .isLength({ max: 100000 })
      .withMessage('G-code is required and must be less than 100KB')
  ],
  
  // G-code execute validation
  gcodeExecute: [
    body('gcode')
      .notEmpty()
      .isLength({ max: 100000 })
      .withMessage('G-code is required and must be less than 100KB')
      .custom((value) => {
        // Basic G-code syntax validation
        const lines = value.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (line && !line.match(/^[GM]\d+|;|%/)) {
            throw new Error('Invalid G-code format');
          }
        }
        return true;
      })
  ],
  
  // Configuration validation
  config: [
    body('robotType')
      .optional()
      .isIn(['arctos', 'generic', 'custom', 'mks57d', 'mks42d'])
      .withMessage('Invalid robot type'),
    body('communicationProtocol')
      .optional()
      .isIn(['serial', 'can', 'rs485'])
      .withMessage('Invalid communication protocol')
  ],
  
  // Manual control validation
  manualMove: [
    body('axis')
      .optional()
      .isIn(['X', 'Y', 'Z', 'A', 'B', 'C', 'x', 'y', 'z', 'a', 'b', 'c'])
      .withMessage('Invalid axis'),
    body('value')
      .optional()
      .isNumeric()
      .withMessage('Value must be numeric'),
    body('manipulator')
      .optional()
      .isString()
      .withMessage('Manipulator must be a string'),
    body('direction')
      .optional()
      .isInt({ min: -1, max: 1 })
      .withMessage('Direction must be -1, 0, or 1'),
    body('amount')
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage('Amount must be between 0 and 1000')
  ],
  
  // Home axes validation
  homeAxes: [
    body('axes')
      .optional()
      .isArray()
      .withMessage('Axes must be an array'),
    body('axes.*')
      .optional()
      .isIn(['X', 'Y', 'Z', 'A', 'B', 'C', 'x', 'y', 'z', 'a', 'b', 'c'])
      .withMessage('Invalid axis in axes array')
  ],
  
  // Position replay validation
  positionReplay: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Position ID must be a positive integer')
  ],
  
  // Save position validation
  savePosition: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Position name is required and must be less than 100 characters'),
    body('axes')
      .optional()
      .isObject()
      .withMessage('Axes must be an object'),
    body('manipulators')
      .optional()
      .isObject()
      .withMessage('Manipulators must be an object')
  ],
  
  // Edit position validation
  editPosition: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Position ID must be a positive integer'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Position name must be less than 100 characters'),
    body('axes')
      .optional()
      .isObject()
      .withMessage('Axes must be an object'),
    body('manipulators')
      .optional()
      .isObject()
      .withMessage('Manipulators must be an object')
  ],
  
  // Reorder positions validation
  reorderPositions: [
    body('orderedIds')
      .isArray()
      .withMessage('Ordered IDs must be an array'),
    body('orderedIds.*')
      .isInt({ min: 1 })
      .withMessage('Each ID must be a positive integer')
  ],
  
  // Create group validation
  createGroup: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Group name is required and must be less than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],
  
  // Edit group validation
  editGroup: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Group ID must be a positive integer'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Group name must be less than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],
  
  // ID parameter validation
  id: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('ID must be a positive integer')
  ],
  
  // Group validation
  group: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\-\s]+$/)
      .withMessage('Group name must be 1-100 characters and contain only alphanumeric characters, spaces, underscores, and hyphens'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],

  // G-code program validation
  createGcodeProgram: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\-\s\.]+$/)
      .withMessage('Program name must be 1-100 characters and contain only alphanumeric characters, spaces, dots, underscores, and hyphens'),
    body('content')
      .isString()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('G-code content is required and must be less than 1MB'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],

  updateGcodeProgram: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_\-\s\.]+$/)
      .withMessage('Program name must be 1-100 characters and contain only alphanumeric characters, spaces, dots, underscores, and hyphens'),
    body('content')
      .optional()
      .isString()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('G-code content must be less than 1MB'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters')
  ],

  validateGcode: [
    body('gcode')
      .isString()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('G-code content is required and must be less than 1MB')
  ],

  setBreakpoints: [
    body('breakpoints')
      .isArray({ max: 1000 })
      .withMessage('Breakpoints must be an array with maximum 1000 entries'),
    body('breakpoints.*')
      .isInt({ min: 1, max: 1000000 })
      .withMessage('Each breakpoint must be a line number between 1 and 1,000,000')
  ],

  setStepMode: [
    body('enabled')
      .isBoolean()
      .withMessage('Enabled must be a boolean value')
  ]
};

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.security('Input validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      body: req.body,
      user: req.user ? req.user.username : 'anonymous',
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      details: errors.array()
    });
  }
  next();
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters from strings
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/[<>]/g, '') // Remove HTML tags
      .trim(); // Remove leading/trailing whitespace
  };
  
  // Recursively sanitize object properties
  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };
  
  // Sanitize request body and query parameters
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

// Security event detection middleware
const securityMonitoring = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const ip = req.ip;
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /burp/i,
    /owasp/i,
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i
  ];
  
  const requestString = `${req.method} ${req.path} ${JSON.stringify(req.body)} ${JSON.stringify(req.query)}`;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString) || pattern.test(userAgent)) {
      logger.security('Suspicious request detected', {
        pattern: pattern.toString(),
        method: req.method,
        path: req.path,
        ip,
        userAgent,
        body: req.body,
        query: req.query,
        severity: 'high'
      });
      
      return res.status(400).json({
        success: false,
        error: 'Request blocked for security reasons'
      });
    }
  }
  
  next();
};

// IP-based access control (optional - can be configured per environment)
const ipWhitelist = process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : null;

const ipAccessControl = (req, res, next) => {
  if (!ipWhitelist) {
    return next(); // No IP restrictions configured
  }
  
  const clientIP = req.ip;
  const isAllowed = ipWhitelist.some(allowedIP => {
    if (allowedIP.includes('/')) {
      // CIDR notation support (basic implementation)
      const [network, prefix] = allowedIP.split('/');
      // For simplicity, exact match only - could be enhanced with proper CIDR matching
      return clientIP === network;
    }
    return clientIP === allowedIP;
  });
  
  if (!isAllowed) {
    logger.security('IP address blocked', {
      ip: clientIP,
      path: req.path,
      method: req.method,
      severity: 'medium'
    });
    
    return res.status(403).json({
      success: false,
      error: 'Access denied from this IP address'
    });
  }
  
  next();
};

module.exports = {
  rateLimits,
  securityHeaders,
  validationRules,
  handleValidationErrors,
  sanitizeInput,
  securityMonitoring,
  ipAccessControl
};