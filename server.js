const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');

const { MKS42DController, GCodeTranslator } = require('./lib/mks42d');
const MKS57DManager = require('./lib/mks57d-manager');
const { GCodeParser, GCodeManager } = require('./lib/gcode-parser');
const { GCodeManager: AdvancedGCodeManager } = require('./lib/gcode-manager');
const { DatabaseManager, models } = require('./lib/database');
const { DataMigration } = require('./lib/migration');
const DataExportManager = require('./lib/exportManager');

// Import macro system modules
const { MacroProcessor } = require('./lib/macroProcessor');
const { VariableManager } = require('./lib/variableManager');
const { MacroLibrary } = require('./lib/macroLibrary');

// Import new security and authentication modules
const {
  logger,
  performanceMiddleware,
  requestLoggingMiddleware,
  errorLoggingMiddleware,
} = require('./lib/logger');
const {
  authService,
  authenticateToken,
  requireRole,
  registerValidation,
  loginValidation,
  changePasswordValidation,
} = require('./lib/auth');
const {
  rateLimits,
  securityHeaders,
  validationRules,
  handleValidationErrors,
  sanitizeInput,
  securityMonitoring,
  ipAccessControl,
} = require('./lib/security');
const { body } = require('express-validator');
const { getMonitorInstance } = require('./lib/system-monitor');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://localhost:5000']
        : ['http://localhost:3000', 'http://localhost:5000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  allowEIO3: true, // Allow Engine.IO v3 compatibility
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || (process.env.NODE_ENV === 'production' ? 5000 : 3001);
const isElectron = process.env.ELECTRON || process.versions.electron;

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const result = authService.verifyAccessToken(token);
    if (!result.success) {
      return next(new Error('Invalid or expired token'));
    }

    // Attach user data to socket
    socket.user = result.user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

// Log server startup
logger.info('Arctos Robot Controller server starting...', {
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  electron: !!isElectron,
});

// Security middleware - applied first
app.use(securityHeaders);
app.use(ipAccessControl);
app.use(securityMonitoring);

// Performance and request logging
app.use(performanceMiddleware);
app.use(requestLoggingMiddleware);

// CORS configuration with enhanced security
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : process.env.NODE_ENV === 'production'
    ? ['https://localhost:5000']
    : ['http://localhost:3000', 'http://localhost:5000'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (same-origin, Electron, curl)
      // In production, these are logged by the security monitoring middleware
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.security('Blocked CORS request from unauthorized origin', {
          origin,
          severity: 'medium',
        });
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Add Vary: Origin header
app.use((req, res, next) => {
  res.setHeader('Vary', 'Origin');
  next();
});

// Body parsing with size limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Serve static files from React build
if (process.env.NODE_ENV === 'production' || isElectron) {
  app.use(express.static(path.join(__dirname, 'client/build')));
}

// Configuration storage
const CONFIG_FILE = path.join(__dirname, 'config', 'robot-config.json');
const POSITIONS_FILE = path.join(__dirname, 'data', 'saved-positions.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'position-groups.json');

// Ensure config and data directories exist
fs.ensureDirSync(path.join(__dirname, 'config'));
fs.ensureDirSync(path.join(__dirname, 'data'));

// Default configuration
const defaultConfig = {
  robotType: 'arctos',
  communicationProtocol: 'can',
  serialConfig: {
    port: '/dev/ttyUSB0',
    baudRate: 115200,
  },
  canConfig: {
    interface: 'can0',
    baseCanId: 256,
  },
  axes: {
    count: 6,
    limits: {
      axis1: { min: -180, max: 180 },
      axis2: { min: -90, max: 90 },
      axis3: { min: -180, max: 180 },
      axis4: { min: -180, max: 180 },
      axis5: { min: -90, max: 90 },
      axis6: { min: -180, max: 180 },
    },
  },
  manipulators: {
    count: 2,
    gripper1: { min: 0, max: 100 },
    gripper2: { min: 0, max: 100 },
  },
  mks42d: {
    enabled: true,
    simulationMode: true,
    controllers: [
      { id: 1, name: 'Base Controller', axes: ['X', 'Y'], type: 'axis' },
      { id: 2, name: 'Z-Axis Controller', axes: ['Z'], type: 'axis' },
      { id: 3, name: 'Gripper Controller', axes: ['E'], type: 'gripper' },
    ],
    stepsPerMM: { x: 80, y: 80, z: 400, e: 93 },
    maxSpeed: { x: 3000, y: 3000, z: 1500, e: 2000 },
    homingSpeed: 1000,
  },
};

// Load or create configuration
let robotConfig = defaultConfig;
if (fs.existsSync(CONFIG_FILE)) {
  try {
    robotConfig = fs.readJsonSync(CONFIG_FILE);
  } catch (error) {
    console.error('Error loading config:', error);
    robotConfig = defaultConfig;
  }
}

// Load saved positions
let savedPositions = [];
if (fs.existsSync(POSITIONS_FILE)) {
  try {
    savedPositions = fs.readJsonSync(POSITIONS_FILE);
  } catch (error) {
    console.error('Error loading saved positions:', error);
    savedPositions = [];
  }
}

// Load position groups
let positionGroups = [];
if (fs.existsSync(GROUPS_FILE)) {
  try {
    positionGroups = fs.readJsonSync(GROUPS_FILE);
  } catch (error) {
    console.error('Error loading position groups:', error);
    positionGroups = [];
  }
}

// Initialize MKS42D controller and G-code translator
let mks42d = null;
let gcodeTranslator = null;

if (robotConfig.mks42d && robotConfig.mks42d.enabled) {
  try {
    mks42d = new MKS42DController({
      interface: robotConfig.canConfig.interface,
      controllers: robotConfig.mks42d.controllers,
      simulationMode: robotConfig.mks42d.simulationMode,
    });

    gcodeTranslator = new GCodeTranslator(mks42d, {
      stepsPerMM: robotConfig.mks42d.stepsPerMM,
      maxSpeed: robotConfig.mks42d.maxSpeed,
      homingSpeed: robotConfig.mks42d.homingSpeed,
    });

    // Set up event listeners
    mks42d.on('connected', () => {
      console.log('MKS42D: Controller connected');
      io.emit('mks42dStatus', { status: 'connected' });
    });

    mks42d.on('disconnected', () => {
      console.log('MKS42D: Controller disconnected');
      io.emit('mks42dStatus', { status: 'disconnected' });
    });

    mks42d.on('positionUpdated', data => {
      io.emit('positionUpdated', data);
    });

    mks42d.on('homeStarted', data => {
      io.emit('homeStatus', { status: 'started', ...data });
    });

    mks42d.on('commandAck', data => {
      if (data.success) {
        io.emit('homeStatus', { status: 'completed', controllerId: data.controllerId });
      }
    });

    // Connect to CAN interface
    mks42d.connect().then(success => {
      if (success) {
        console.log('MKS42D: Successfully initialized');
      } else {
        console.error('MKS42D: Failed to initialize');
      }
    });
  } catch (error) {
    console.error('Error initializing MKS42D:', error);
  }
}

// Initialize MKS57D Manager
let mks57dManager = null;

async function initializeMKS57D() {
  if (robotConfig.communicationProtocol === 'can') {
    try {
      mks57dManager = new MKS57DManager({
        canConfig: robotConfig.canConfig,
        controllerAddresses: robotConfig.controllerAddresses || [1, 2, 3, 4, 5, 6],
      });

      const success = await mks57dManager.initialize();
      if (success) {
        console.log('MKS57D Manager initialized successfully');
      } else {
        console.warn('MKS57D Manager initialization failed');
        mks57dManager = null;
      }
    } catch (error) {
      console.error('Failed to initialize MKS57D Manager:', error);
      mks57dManager = null;
    }
  }
}

// Initialize MKS57D on startup if CAN is configured
if (robotConfig.communicationProtocol === 'can') {
  initializeMKS57D();
}

// Initialize Advanced G-code Manager
let gcodeManager = null;
async function initializeGCodeManager() {
  try {
    gcodeManager = new AdvancedGCodeManager({
      programsDir: path.join(__dirname, 'data', 'gcode-programs'),
      maxPrograms: 100,
      maxFileSize: 5 * 1024 * 1024, // 5MB
    });

    await gcodeManager.init();
    logger.info('Advanced G-code Manager initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Advanced G-code Manager', { error: error.message });
    gcodeManager = null;
  }
}

// Initialize Data Export Manager
let exportManager = null;
async function initializeExportManager() {
  try {
    exportManager = new DataExportManager();
    logger.info('Data Export Manager initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Data Export Manager', { error: error.message });
    exportManager = null;
  }
}

// Initialize G-code manager on startup
initializeGCodeManager();

// Initialize Export manager on startup
initializeExportManager();

// Initialize Macro System
let macroProcessor = null;
let macroLibrary = null;

async function initializeMacroSystem() {
  try {
    macroProcessor = new MacroProcessor();
    macroLibrary = new MacroLibrary();

    logger.info('Macro system initialized successfully', {
      builtinMacros: macroProcessor.macros.size,
      libraryCategories: macroLibrary.categories.size,
    });
  } catch (error) {
    logger.error('Failed to initialize macro system', { error: error.message });
    macroProcessor = null;
    macroLibrary = null;
  }
}

// Initialize macro system on startup
initializeMacroSystem();

// Health check endpoint for Docker/load balancers (unauthenticated - minimal info)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Detailed health check (authenticated, for monitoring dashboards)
app.get('/api/health/detailed', authenticateToken, requireRole(['admin']), (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || require('./package.json').version,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage(),
  });
});

// Authentication Routes (public endpoints)
// ====================================

// User registration (admin only in production, open in development)
app.post(
  '/api/auth/register',
  rateLimits.auth,
  registerValidation,
  handleValidationErrors,
  process.env.ALLOW_OPEN_REGISTRATION === 'true' ? [] : [authenticateToken, requireRole('admin')],
  async (req, res) => {
    try {
      const { username, email, password, role } = req.body;

      const newUser = await authService.createUser({
        username,
        email,
        password,
        role: role || 'operator',
      });

      logger.audit('User registered', req.user, {
        newUser: { id: newUser.id, username: newUser.username, role: newUser.role },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: newUser,
      });
    } catch (error) {
      logger.error('User registration failed', {
        error: error.message,
        username: req.body.username,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// User login
app.post(
  '/api/auth/login',
  rateLimits.auth,
  loginValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;

      const result = await authService.authenticateUser(username, password);

      if (result.success) {
        logger.audit('User login successful', result.user, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.json({
          success: true,
          message: 'Login successful',
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } else {
        logger.audit('User login failed', null, {
          username,
          reason: result.message,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.status(401).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('Login error', {
        error: error.message,
        username: req.body.username,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error during login',
      });
    }
  }
);

// Refresh token
app.post('/api/auth/refresh', rateLimits.auth, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
      });
    }

    const result = await authService.validateRefreshToken(refreshToken);

    if (result.success) {
      const newAccessToken = authService.generateAccessToken(result.user);
      const newRefreshToken = authService.generateRefreshToken(result.user);

      // Store new refresh token
      await authService.storeRefreshToken(result.user.id, newRefreshToken);

      // Revoke old refresh token
      await authService.revokeRefreshToken(refreshToken);

      logger.audit('Token refreshed', result.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Token refresh error', {
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error during token refresh',
    });
  }
});

// User logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }

    // Optionally revoke all user tokens
    if (req.body.logoutAll) {
      await authService.revokeAllUserTokens(req.user.id);
    }

    logger.audit('User logout', req.user, {
      logoutAll: req.body.logoutAll,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error during logout',
    });
  }
});

// Get current user profile
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive',
      });
    }

    const { password, ...userProfile } = user;

    res.json({
      success: true,
      user: userProfile,
    });
  } catch (error) {
    logger.error('Profile fetch error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error fetching profile',
    });
  }
});

// Change password
app.post(
  '/api/auth/change-password',
  authenticateToken,
  changePasswordValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Verify current password
      const user = await authService.getUserById(req.user.id);
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);

      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect',
        });
      }

      // Update password
      await authService.updateUser(req.user.id, { password: newPassword });

      logger.audit('Password changed', req.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('Password change error', {
        error: error.message,
        user: req.user.username,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error changing password',
      });
    }
  }
);

// Two-Factor Authentication Routes
// ===============================

// Setup 2FA for current user
app.post(
  '/api/auth/2fa/setup',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.auth,
  async (req, res) => {
    try {
      const result = await authService.setup2FA(req.user.id);

      if (result.success) {
        logger.audit('2FA setup initiated', {
          user: req.user.username,
          userId: req.user.id,
        });

        res.json({
          success: true,
          message: '2FA setup initiated',
          setup: result.setup,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('2FA setup failed', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to setup 2FA',
      });
    }
  }
);

// Verify 2FA setup
app.post(
  '/api/auth/2fa/verify-setup',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.auth,
  body('token').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Token must be 6 digits'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { token } = req.body;
      const result = await authService.verify2FASetup(req.user.id, token);

      if (result.success) {
        logger.audit('2FA enabled', {
          user: req.user.username,
          userId: req.user.id,
          enabledAt: result.enabledAt,
        });

        res.json({
          success: true,
          message: result.message,
          enabledAt: result.enabledAt,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('2FA setup verification failed', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to verify 2FA setup',
      });
    }
  }
);

// Verify 2FA token (for login)
app.post(
  '/api/auth/2fa/verify',
  rateLimits.auth,
  body('userId').isInt().withMessage('User ID must be a number'),
  body('token').isLength({ min: 6, max: 8 }).withMessage('Token must be 6-8 characters'),
  body('isBackupCode').optional().isBoolean().withMessage('isBackupCode must be boolean'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId, token, isBackupCode } = req.body;
      const result = await authService.verify2FAToken(userId, token, isBackupCode);

      if (result.success) {
        logger.audit('2FA verification successful', {
          userId,
          isBackupCode: !!isBackupCode,
          backupCodesRemaining: result.backupCodesRemaining,
        });

        res.json({
          success: true,
          message: result.message,
          backupCodesRemaining: result.backupCodesRemaining,
        });
      } else {
        logger.audit('2FA verification failed', {
          userId,
          isBackupCode: !!isBackupCode,
        });

        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('2FA verification error', {
        error: error.message,
        userId: req.body.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to verify 2FA token',
      });
    }
  }
);

// Disable 2FA
app.post('/api/auth/2fa/disable', authenticateToken, rateLimits.auth, async (req, res) => {
  try {
    // Users can disable their own 2FA, admins can disable for others
    const targetUserId = req.body.userId || req.user.id;

    // Check permissions
    if (targetUserId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    const adminUserId = targetUserId !== req.user.id ? req.user.id : null;
    const result = await authService.disable2FA(targetUserId, adminUserId);

    if (result.success) {
      logger.audit('2FA disabled', {
        targetUserId,
        disabledBy: req.user.username,
        disabledAt: result.disabledAt,
      });

      res.json({
        success: true,
        message: result.message,
        disabledAt: result.disabledAt,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('2FA disable failed', {
      error: error.message,
      user: req.user.username,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to disable 2FA',
    });
  }
});

// Regenerate backup codes
app.post(
  '/api/auth/2fa/backup-codes',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.auth,
  async (req, res) => {
    try {
      const result = await authService.regenerateBackupCodes(req.user.id);

      if (result.success) {
        logger.audit('2FA backup codes regenerated', {
          user: req.user.username,
          userId: req.user.id,
        });

        res.json({
          success: true,
          message: result.message,
          backupCodes: result.backupCodes,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      logger.error('2FA backup code generation failed', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate backup codes',
      });
    }
  }
);

// Get 2FA status
app.get('/api/auth/2fa/status', authenticateToken, rateLimits.api, async (req, res) => {
  try {
    const result = await authService.get2FAStatus(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        status: result.status,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error('Failed to get 2FA status', {
      error: error.message,
      user: req.user.username,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get 2FA status',
    });
  }
});

// Get 2FA recovery instructions
app.get('/api/auth/2fa/recovery', authenticateToken, rateLimits.api, async (req, res) => {
  try {
    const instructions = authService.twoFactorAuth.getRecoveryInstructions();
    const recommendations = authService.twoFactorAuth.getSecurityRecommendations();

    res.json({
      success: true,
      recovery: instructions,
      recommendations: recommendations,
    });
  } catch (error) {
    logger.error('Failed to get 2FA recovery instructions', {
      error: error.message,
      user: req.user.username,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get recovery instructions',
    });
  }
});

// User Management Routes (admin only)
// ===================================

// Get all users
app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    const usersWithoutPasswords = users.map(({ password, ...user }) => user);

    res.json({
      success: true,
      users: usersWithoutPasswords,
    });
  } catch (error) {
    logger.error('Users fetch error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error fetching users',
    });
  }
});

// Update user
app.put(
  '/api/users/:id',
  authenticateToken,
  requireRole('admin'),
  validationRules.id,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const updateData = req.body;

      // Don't allow updating password through this endpoint
      delete updateData.password;

      const updatedUser = await authService.updateUser(userId, updateData);

      logger.audit('User updated', req.user, {
        updatedUser: { id: updatedUser.id, username: updatedUser.username },
        changes: updateData,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      logger.error('User update error', {
        error: error.message,
        user: req.user.username,
        userId: req.params.id,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Delete user
app.delete(
  '/api/users/:id',
  authenticateToken,
  requireRole('admin'),
  validationRules.id,
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // Prevent admin from deleting themselves
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account',
        });
      }

      await authService.deleteUser(userId);

      logger.audit('User deleted', req.user, {
        deletedUserId: userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      logger.error('User deletion error', {
        error: error.message,
        user: req.user.username,
        userId: req.params.id,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Audit trail endpoint
app.get(
  '/api/audit/logs',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.api,
  async (req, res) => {
    try {
      const {
        category,
        level,
        user,
        dateFrom,
        dateTo,
        search,
        page = 1,
        limit = 50,
        export: exportLogs = false,
      } = req.query;

      logger.audit('Audit logs accessed', {
        user: req.user?.username,
        filters: { category, level, user, dateFrom, dateTo, search },
        page,
        limit,
      });

      // In a real implementation, you would read from log files or database
      // For now, we'll simulate reading from Winston log files
      const fs = require('fs-extra');
      const path = require('path');

      let logs = [];
      const logFiles = [
        'audit.log',
        'security.log',
        'performance.log',
        'robot.log',
        'combined.log',
      ];

      try {
        for (const logFile of logFiles) {
          const logPath = path.join(__dirname, 'logs', logFile);
          if (await fs.pathExists(logPath)) {
            const logContent = await fs.readFile(logPath, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());

            for (const line of lines) {
              try {
                const logEntry = JSON.parse(line);
                logs.push({
                  timestamp: logEntry.timestamp,
                  level: logEntry.level,
                  message: logEntry.message,
                  category: logEntry.category || 'general',
                  meta: logEntry.meta || {},
                });
              } catch (parseError) {
                // Skip lines that aren't JSON
                continue;
              }
            }
          }
        }
      } catch (fileError) {
        logger.error('Error reading log files', fileError);
        // Return some sample logs for demonstration
        logs = [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'User logged in successfully',
            category: 'audit',
            meta: { user: req.user?.username, ip: req.ip },
          },
          {
            timestamp: new Date(Date.now() - 60000).toISOString(),
            level: 'warn',
            message: 'Failed login attempt detected',
            category: 'security',
            meta: { ip: '192.168.1.100', userAgent: 'Mozilla/5.0...' },
          },
          {
            timestamp: new Date(Date.now() - 120000).toISOString(),
            level: 'info',
            message: 'Robot position saved',
            category: 'robot',
            meta: { user: req.user?.username, positionName: 'Home Position' },
          },
        ];
      }

      // Apply filters
      if (category && category !== 'all') {
        logs = logs.filter(log => log.category === category);
      }
      if (level && level !== 'all') {
        logs = logs.filter(log => log.level === level);
      }
      if (user && user !== 'all') {
        logs = logs.filter(log => log.meta.user === user || log.meta.userId === user);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        logs = logs.filter(
          log =>
            log.message.toLowerCase().includes(searchLower) ||
            JSON.stringify(log.meta).toLowerCase().includes(searchLower)
        );
      }
      if (dateFrom) {
        logs = logs.filter(log => new Date(log.timestamp) >= new Date(dateFrom));
      }
      if (dateTo) {
        logs = logs.filter(log => new Date(log.timestamp) <= new Date(dateTo));
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Handle export
      if (exportLogs === 'true') {
        const csvHeader = 'Timestamp,Category,Level,Message,User,IP,Endpoint,Method,Status\n';
        const csvRows = logs.map(log =>
          [
            log.timestamp,
            log.category,
            log.level,
            `"${log.message.replace(/"/g, '""')}"`,
            log.meta.user || '',
            log.meta.ip || '',
            log.meta.endpoint || '',
            log.meta.method || '',
            log.meta.statusCode || '',
          ].join(',')
        );

        const csv = csvHeader + csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
        return res.send(csv);
      }

      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 50;
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;

      const paginatedLogs = logs.slice(startIndex, endIndex);
      const totalPages = Math.ceil(logs.length / limitNum);

      res.json({
        success: true,
        logs: paginatedLogs,
        total: logs.length,
        page: pageNum,
        limit: limitNum,
        totalPages,
      });
    } catch (error) {
      logger.error('Error fetching audit logs', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// API Routes
app.get('/api/config', authenticateToken, async (req, res) => {
  try {
    logger.api('GET', '/api/config', req.user, { success: true });
    res.json({
      success: true,
      config: robotConfig,
    });
  } catch (error) {
    logger.error('Configuration fetch error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration',
    });
  }
});

app.post(
  '/api/config',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.config,
  validationRules.config,
  handleValidationErrors,
  async (req, res) => {
    try {
      const oldConfig = { ...robotConfig };
      robotConfig = { ...robotConfig, ...req.body };
      fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });

      // Reinitialize MKS42D if config changed
      const mks42dConfigChanged =
        JSON.stringify(oldConfig.mks42d) !== JSON.stringify(robotConfig.mks42d);
      const canConfigChanged =
        JSON.stringify(oldConfig.canConfig) !== JSON.stringify(robotConfig.canConfig);

      if (
        (mks42dConfigChanged || canConfigChanged) &&
        robotConfig.mks42d &&
        robotConfig.mks42d.enabled
      ) {
        try {
          // Disconnect existing controller
          if (mks42d) {
            mks42d.disconnect();
          }

          // Create new controller with updated config
          mks42d = new MKS42DController({
            interface: robotConfig.canConfig.interface,
            controllers: robotConfig.mks42d.controllers,
            simulationMode: robotConfig.mks42d.simulationMode,
          });

          gcodeTranslator = new GCodeTranslator(mks42d, {
            stepsPerMM: robotConfig.mks42d.stepsPerMM,
            maxSpeed: robotConfig.mks42d.maxSpeed,
            homingSpeed: robotConfig.mks42d.homingSpeed,
          });

          // Reconnect
          await mks42d.connect();
          console.log('MKS42D: Reinitialized with new configuration');
        } catch (error) {
          console.error('Error reinitializing MKS42D:', error);
        }
      }

      const oldProtocol = oldConfig.communicationProtocol;

      // Reinitialize MKS57D manager if communication protocol changed to CAN
      if (oldProtocol !== robotConfig.communicationProtocol) {
        if (mks57dManager) {
          await mks57dManager.shutdown();
          mks57dManager = null;
        }

        if (robotConfig.communicationProtocol === 'can') {
          await initializeMKS57D();
        }
      }

      logger.config('Configuration updated', {
        user: req.user.username,
        changes: req.body,
        ip: req.ip,
      });

      res.json({ success: true, config: robotConfig });

      // Broadcast config update to all clients
      io.emit('configUpdated', robotConfig);
    } catch (error) {
      logger.error('Configuration update error', {
        error: error.message,
        user: req.user.username,
        changes: req.body,
        ip: req.ip,
      });

      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Robot Profiles API endpoints
const PROFILES_FILE = path.join(__dirname, 'data', 'robot-profiles.json');
let robotProfiles = [];
let activeProfileId = null;

// Load robot profiles on startup
if (fs.existsSync(PROFILES_FILE)) {
  try {
    const profileData = fs.readJsonSync(PROFILES_FILE);
    robotProfiles = profileData.profiles || [];
    activeProfileId = profileData.activeProfile || null;
  } catch (error) {
    console.error('Error loading robot profiles:', error);
    robotProfiles = [];
    activeProfileId = null;
  }
}

// Get robot profiles
app.get('/api/robot-profiles', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    logger.api('GET', '/api/robot-profiles', req.user, { success: true });
    res.json({
      success: true,
      profiles: robotProfiles,
      activeProfile: activeProfileId,
    });
  } catch (error) {
    logger.error('Robot profiles fetch error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch robot profiles',
    });
  }
});

// Save robot profile
app.post(
  '/api/robot-profiles',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.config,
  async (req, res) => {
    try {
      const profile = req.body;

      // Validate profile structure
      if (!profile.id || !profile.name || !profile.type) {
        return res.status(400).json({
          success: false,
          error: 'Profile must have id, name, and type',
        });
      }

      // Update or add profile
      const existingIndex = robotProfiles.findIndex(p => p.id === profile.id);
      if (existingIndex >= 0) {
        robotProfiles[existingIndex] = profile;
      } else {
        robotProfiles.push(profile);
      }

      // Save to file
      const profileData = {
        profiles: robotProfiles,
        activeProfile: activeProfileId,
      };
      fs.writeJsonSync(PROFILES_FILE, profileData, { spaces: 2 });

      logger.config('Robot profile saved', {
        user: req.user.username,
        profileId: profile.id,
        profileName: profile.name,
        ip: req.ip,
      });

      res.json({ success: true, profile });

      // Broadcast profile update to all clients
      io.emit('robotProfilesUpdated', { profiles: robotProfiles, activeProfile: activeProfileId });
    } catch (error) {
      logger.error('Robot profile save error', {
        error: error.message,
        user: req.user.username,
        profile: req.body.name || 'unnamed',
        ip: req.ip,
      });

      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Activate robot profile
app.post(
  '/api/robot-profiles/activate',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.config,
  async (req, res) => {
    try {
      const { profileId } = req.body;

      if (!profileId) {
        return res.status(400).json({
          success: false,
          error: 'Profile ID is required',
        });
      }

      const profile = robotProfiles.find(p => p.id === profileId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found',
        });
      }

      // Convert profile to robot config format
      const newConfig = {
        ...robotConfig,
        robotType: profile.type,
        communicationProtocol: profile.communication?.protocol || 'can',
        axes: {
          count: profile.dof || 6,
          limits: {},
        },
        // Map profile data to existing config structure
        workspace: profile.workspace,
        safety: profile.safety,
        kinematics: profile.kinematics,
      };

      // Generate axis limits based on robot type and DOF
      for (let i = 1; i <= (profile.dof || 6); i++) {
        newConfig.axes.limits[`axis${i}`] = { min: -180, max: 180 };
      }

      // Update active profile and config
      activeProfileId = profileId;
      robotConfig = newConfig;

      // Save both profile selection and config
      const profileData = {
        profiles: robotProfiles,
        activeProfile: activeProfileId,
      };
      fs.writeJsonSync(PROFILES_FILE, profileData, { spaces: 2 });
      fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });

      logger.config('Robot profile activated', {
        user: req.user.username,
        profileId: profileId,
        profileName: profile.name,
        ip: req.ip,
      });

      res.json({ success: true, config: robotConfig, profileId });

      // Broadcast updates to all clients
      io.emit('configUpdated', robotConfig);
      io.emit('robotProfilesUpdated', { profiles: robotProfiles, activeProfile: activeProfileId });
    } catch (error) {
      logger.error('Robot profile activation error', {
        error: error.message,
        user: req.user.username,
        profileId: req.body.profileId,
        ip: req.ip,
      });

      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.get('/api/positions', authenticateToken, async (req, res) => {
  try {
    logger.api('GET', '/api/positions', req.user, { success: true });
    res.json({
      success: true,
      positions: savedPositions,
    });
  } catch (error) {
    logger.error('Positions fetch error', {
      error: error.message,
      user: req.user.username,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch positions',
    });
  }
});

// Get current positions from controllers
app.get('/api/positions/current', authenticateToken, async (req, res) => {
  try {
    if (mks42d && robotConfig.mks42d.enabled) {
      const positions = await mks42d.getAllPositions();
      res.json({ success: true, positions });
    } else {
      // Return simulated positions
      res.json({
        success: true,
        positions: { 1: { x: 0, y: 0, z: 0, e: 0 } },
        mode: 'simulation',
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post(
  '/api/positions',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.savePosition,
  handleValidationErrors,
  async (req, res) => {
    try {
      let currentAxes = req.body.axes;
      let currentManipulators = req.body.manipulators;

      // If no axes/manipulators provided, try to construct from individual values
      if (!currentAxes && !currentManipulators) {
        // Handle individual axis values sent by client
        currentAxes = {};
        currentManipulators = {};

        // Map individual axis values to axes object
        if (req.body.x !== undefined) {
          currentAxes.X = req.body.x;
        }
        if (req.body.y !== undefined) {
          currentAxes.Y = req.body.y;
        }
        if (req.body.z !== undefined) {
          currentAxes.Z = req.body.z;
        }
        if (req.body.a !== undefined) {
          currentAxes.A = req.body.a;
        }
        if (req.body.b !== undefined) {
          currentAxes.B = req.body.b;
        }
        if (req.body.c !== undefined) {
          currentAxes.C = req.body.c;
        }

        // Map manipulator values
        if (req.body.gripper !== undefined) {
          currentManipulators.gripper1 = req.body.gripper;
        }
      }

      // If still no positions, try to get from controllers
      if (
        (!currentAxes || Object.keys(currentAxes).length === 0) &&
        mks42d &&
        robotConfig.mks42d.enabled
      ) {
        try {
          const controllerPositions = await mks42d.getAllPositions();
          // Convert controller positions to axes format
          currentAxes = {};
          currentManipulators = {};

          // Aggregate positions from all controllers based on their axis configuration
          for (const controller of mks42d.controllers) {
            const pos = controllerPositions[controller.id] || {
              x: 0,
              y: 0,
              z: 0,
              e: 0,
            };

            if (controller.axes.includes('X')) {
              currentAxes.X = pos.x;
            }
            if (controller.axes.includes('Y')) {
              currentAxes.Y = pos.y;
            }
            if (controller.axes.includes('Z')) {
              currentAxes.Z = pos.z;
            }
            if (controller.axes.includes('E')) {
              currentManipulators.gripper1 = pos.e;
            }
          }
        } catch (error) {
          console.warn('Failed to get current positions from controllers:', error);
          // Keep the values we already have
        }
      }

      // Ensure we have at least empty objects
      if (!currentAxes) {
        currentAxes = {};
      }
      if (!currentManipulators) {
        currentManipulators = {};
      }

      const newPosition = {
        id: Date.now(),
        name: req.body.name,
        axes: currentAxes,
        manipulators: currentManipulators,
        delay: req.body.delay || 0,
        groupId: req.body.groupId || null,
        timestamp: new Date().toISOString(),
      };

      savedPositions.push(newPosition);
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
      res.json({ success: true, position: newPosition });

      // Broadcast position update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Edit position endpoint
app.put(
  '/api/positions/:id',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.editPosition,
  handleValidationErrors,
  (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const positionIndex = savedPositions.findIndex(pos => pos.id === positionId);

      if (positionIndex === -1) {
        return res.status(404).json({ success: false, error: 'Position not found' });
      }

      // Update position with new data
      const updatedPosition = {
        ...savedPositions[positionIndex],
        ...req.body,
        id: positionId, // Ensure ID doesn't change
        timestamp: new Date().toISOString(),
      };

      savedPositions[positionIndex] = updatedPosition;
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });

      res.json({ success: true, position: updatedPosition });

      // Broadcast position update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Reorder positions endpoint
app.post(
  '/api/positions/reorder',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.reorderPositions,
  handleValidationErrors,
  (req, res) => {
    try {
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ success: false, error: 'orderedIds must be an array' });
      }

      // Reorder savedPositions based on the provided order
      const reorderedPositions = [];

      // First add positions in the specified order
      for (const id of orderedIds) {
        const position = savedPositions.find(pos => pos.id === parseInt(id));
        if (position) {
          reorderedPositions.push(position);
        }
      }

      // Then add any positions not in the ordered list (shouldn't happen, but safety check)
      for (const position of savedPositions) {
        if (!orderedIds.includes(position.id.toString())) {
          reorderedPositions.push(position);
        }
      }

      savedPositions = reorderedPositions;
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });

      res.json({ success: true });

      // Broadcast position update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.delete(
  '/api/positions/:id',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      savedPositions = savedPositions.filter(pos => pos.id !== positionId);
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });
      res.json({ success: true });

      // Broadcast position update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Group management endpoints
app.get('/api/groups', authenticateToken, rateLimits.api, (req, res) => {
  res.json(positionGroups);
});

app.post(
  '/api/groups',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.createGroup,
  handleValidationErrors,
  (req, res) => {
    try {
      const newGroup = {
        id: Date.now(),
        name: req.body.name,
        description: req.body.description || '',
        timestamp: new Date().toISOString(),
      };

      positionGroups.push(newGroup);
      fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });

      res.json({ success: true, group: newGroup });

      // Broadcast groups update to all clients
      io.emit('groupsUpdated', positionGroups);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.put(
  '/api/groups/:id',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.editGroup,
  handleValidationErrors,
  (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const groupIndex = positionGroups.findIndex(group => group.id === groupId);

      if (groupIndex === -1) {
        return res.status(404).json({ success: false, error: 'Group not found' });
      }

      const updatedGroup = {
        ...positionGroups[groupIndex],
        ...req.body,
        id: groupId, // Ensure ID doesn't change
        timestamp: new Date().toISOString(),
      };

      positionGroups[groupIndex] = updatedGroup;
      fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });

      res.json({ success: true, group: updatedGroup });

      // Broadcast groups update to all clients
      io.emit('groupsUpdated', positionGroups);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.delete(
  '/api/groups/:id',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  (req, res) => {
    try {
      const groupId = parseInt(req.params.id);

      // Remove the group
      positionGroups = positionGroups.filter(group => group.id !== groupId);
      fs.writeJsonSync(GROUPS_FILE, positionGroups, { spaces: 2 });

      // Remove group assignment from positions
      savedPositions = savedPositions.map(pos => ({
        ...pos,
        groupId: pos.groupId === groupId ? null : pos.groupId,
      }));
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });

      res.json({ success: true });

      // Broadcast updates to all clients
      io.emit('groupsUpdated', positionGroups);
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Assign position to group
app.post(
  '/api/groups/:groupId/positions/:positionId',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const positionId = parseInt(req.params.positionId);

      // Find the position
      const position = savedPositions.find(pos => pos.id === positionId);
      if (!position) {
        return res.status(404).json({ success: false, error: 'Position not found' });
      }

      // Find the group
      const group = positionGroups.find(g => g.id === groupId);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Group not found' });
      }

      // Update position's group assignment
      position.groupId = groupId;
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });

      res.json({ success: true });

      // Broadcast positions update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Remove position from group
app.delete(
  '/api/groups/:groupId/positions/:positionId',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  (req, res) => {
    try {
      const positionId = parseInt(req.params.positionId);

      // Find the position
      const position = savedPositions.find(pos => pos.id === positionId);
      if (!position) {
        return res.status(404).json({ success: false, error: 'Position not found' });
      }

      // Remove group assignment
      position.groupId = null;
      fs.writeJsonSync(POSITIONS_FILE, savedPositions, { spaces: 2 });

      res.json({ success: true });

      // Broadcast positions update to all clients
      io.emit('positionsUpdated', savedPositions);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Export Management Endpoints
// ===========================

// Get available fields for export
app.get('/api/export/fields/:dataType', authenticateToken, rateLimits.api, (req, res) => {
  try {
    const { dataType } = req.params;

    if (!exportManager) {
      return res.status(503).json({
        success: false,
        error: 'Export service not available',
      });
    }

    const fields = exportManager.getAvailableFields(dataType);
    const filters = exportManager.getAvailableFilters(dataType);

    res.json({
      success: true,
      dataType,
      fields,
      filters,
    });
  } catch (error) {
    logger.error('Failed to get export fields', {
      dataType: req.params.dataType,
      error: error.message,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Preview export data
app.get('/api/export/preview', authenticateToken, rateLimits.api, async (req, res) => {
  try {
    const { dataType, format, fields, filters } = req.query;

    if (!exportManager) {
      return res.status(503).json({
        success: false,
        error: 'Export service not available',
      });
    }

    // Parse query parameters
    const exportOptions = {
      fields: fields ? fields.split(',') : undefined,
      filters: filters ? JSON.parse(filters) : {},
      includeMetadata: true,
      prettyFormat: true,
    };

    const result = await exportManager.getExportPreview(dataType, format, exportOptions);

    res.json({
      success: true,
      preview: result.data,
      metadata: result.metadata,
    });
  } catch (error) {
    logger.error('Export preview failed', {
      query: req.query,
      error: error.message,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Generate and download export
app.post(
  '/api/export',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  [
    body('dataType').isIn(['positions', 'groups']).withMessage('Invalid data type'),
    body('format').isIn(['csv', 'json', 'xml']).withMessage('Invalid format'),
    body('fields').optional().isArray().withMessage('Fields must be an array'),
    body('filters').optional().isObject().withMessage('Filters must be an object'),
    body('formatting').optional().isObject().withMessage('Formatting must be an object'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { dataType, format, fields, filters, formatting } = req.body;

      if (!exportManager) {
        return res.status(503).json({
          success: false,
          error: 'Export service not available',
        });
      }

      const exportOptions = {
        fields,
        filters: filters || {},
        formatting: formatting || {},
        includeMetadata: true,
        prettyFormat: format !== 'csv', // CSV doesn't use pretty format
      };

      logger.info('Starting export', {
        dataType,
        format,
        user: req.user.username,
        options: exportOptions,
      });

      const result = await exportManager.exportData(dataType, format, exportOptions);

      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `${dataType}-export-${timestamp}.${format}`;

      // Set appropriate headers for download
      const mimeTypes = {
        csv: 'text/csv',
        json: 'application/json',
        xml: 'application/xml',
      };

      res.setHeader('Content-Type', mimeTypes[format] || 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Export-Metadata', JSON.stringify(result.metadata));

      logger.info('Export completed successfully', {
        dataType,
        format,
        recordCount: result.metadata.recordCount,
        user: req.user.username,
      });

      res.send(result.data);
    } catch (error) {
      logger.error('Export failed', {
        body: req.body,
        user: req.user.username,
        error: error.message,
      });
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Get current positions endpoint
app.get('/api/positions/current', authenticateToken, rateLimits.api, async (req, res) => {
  try {
    let currentPositions = {};

    // Get current positions from MKS57D manager if available
    if (mks57dManager) {
      try {
        currentPositions = await mks57dManager.getAllPositions();
        logger.robot('Retrieved current positions from MKS57D controllers', {
          user: req.user?.username,
        });
      } catch (error) {
        logger.error('Failed to get current positions', error);
        currentPositions = { error: 'Failed to read from controllers' };
      }
    } else {
      // Fallback - return default/last known positions
      currentPositions = {
        axis1: 0,
        axis2: 0,
        axis3: 0,
        axis4: 0,
        axis5: 0,
        axis6: 0,
        note: 'No MKS57D manager available - returning default positions',
      };
    }

    res.json({ success: true, positions: currentPositions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// G-code processing endpoint
app.post(
  '/api/gcode/execute',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.robotControl,
  validationRules.gcodeExecute,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { gcode } = req.body;
      logger.robot('Executing G-code', {
        gcodeLength: gcode?.length || 0,
        user: req.user?.username,
      });
      res.json({ success: true, message: 'G-code execution started' });
      io.emit('gcodeStatus', { status: 'executing', progress: 0 });

      // Parse and execute G-code using MKS57D manager if available
      if (mks57dManager && gcode) {
        try {
          const lines = gcode
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);
          let progress = 0;
          const progressIncrement = 100 / lines.length;

          for (const line of lines) {
            if (line.startsWith(';') || !line) {
              continue;
            } // Skip comments and empty lines

            try {
              await mks57dManager.executeGCode(line);
              console.log(`Executed G-code line: ${line}`);
            } catch (error) {
              console.error(`Failed to execute G-code line "${line}":`, error);
            }

            progress += progressIncrement;
            io.emit('gcodeStatus', {
              status: 'executing',
              progress: Math.min(100, Math.round(progress)),
            });

            // Small delay between commands
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          io.emit('gcodeStatus', { status: 'completed', progress: 100 });
        } catch (error) {
          console.error('G-code execution error:', error);
          io.emit('gcodeStatus', {
            status: 'error',
            progress: 0,
            error: error.message,
          });
        }
      } else if (gcodeTranslator && gcode) {
        // Use MKS42D G-code translator if available
        try {
          const results = await gcodeTranslator.executeGCode(gcode, progress => {
            io.emit('gcodeStatus', {
              status: 'executing',
              progress: Math.round(progress),
            });
          });

          // Check if any commands failed
          const failedCommands = results.filter(r => !r.success);
          if (failedCommands.length > 0) {
            console.warn(
              `G-code execution completed with ${failedCommands.length} failed commands`
            );
            failedCommands.forEach(cmd => {
              console.warn(`Failed line ${cmd.line}: ${cmd.command} - ${cmd.error}`);
            });
          }

          io.emit('gcodeStatus', { status: 'completed', progress: 100 });
        } catch (error) {
          console.error('G-code execution error:', error);
          io.emit('gcodeStatus', {
            status: 'error',
            progress: 0,
            error: error.message,
          });
        }
      } else {
        // Fallback simulation when no controllers available
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          io.emit('gcodeStatus', { status: 'executing', progress });

          if (progress >= 100) {
            clearInterval(interval);
            io.emit('gcodeStatus', { status: 'completed', progress: 100 });
          }
        }, 500);
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// G-code stop endpoint
app.post(
  '/api/gcode/stop',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.robotControl,
  async (req, res) => {
    try {
      logger.robot('G-code stop requested', {
        user: req.user?.username,
        userId: req.user?.id,
      });

      // Stop MKS57D manager if available
      if (mks57dManager) {
        try {
          await mks57dManager.stop();
          logger.robot('MKS57D manager stopped successfully');
        } catch (error) {
          logger.error('Error stopping MKS57D manager', error);
        }
      }

      // Stop MKS42D controller if available
      if (mks42d) {
        try {
          await mks42d.stop();
          logger.robot('MKS42D controller stopped successfully');
        } catch (error) {
          logger.error('Error stopping MKS42D controller', error);
        }
      }

      io.emit('gcodeStatus', { status: 'stopped', progress: 0 });
      res.json({ success: true, message: 'G-code execution stopped' });
    } catch (error) {
      logger.error('G-code stop failed', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Advanced G-code Management Routes
// ================================

// Create a new G-code program
app.post(
  '/api/gcode/programs',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.createGcodeProgram,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, content, description } = req.body;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = await gcodeManager.createProgram(name, content, {
        description,
        author: req.user.username,
        createdBy: req.user.id,
      });

      if (result.success) {
        logger.robot('G-code program created', {
          programId: result.program.id,
          name: result.program.name,
          user: req.user.username,
          size: result.program.size,
        });

        res.status(201).json({
          success: true,
          message: 'G-code program created successfully',
          program: result.program,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to create G-code program', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// List G-code programs
app.get(
  '/api/gcode/programs',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'modified',
        sortOrder: req.query.sortOrder || 'desc',
        search: req.query.search,
        valid: req.query.valid !== undefined ? req.query.valid === 'true' : undefined,
      };

      const result = gcodeManager.listPrograms(options);

      logger.audit('G-code programs listed', {
        user: req.user.username,
        count: result.programs.length,
        filters: options,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to list G-code programs', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get a specific G-code program
app.get(
  '/api/gcode/programs/:programId',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      const { programId } = req.params;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = gcodeManager.getProgram(programId);

      if (result.success) {
        logger.audit('G-code program accessed', {
          programId,
          user: req.user.username,
        });
        res.json(result);
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to get G-code program', {
        programId: req.params.programId,
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Update a G-code program
app.put(
  '/api/gcode/programs/:programId',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.updateGcodeProgram,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { programId } = req.params;
      const updates = req.body;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      // Add modification metadata
      updates.metadata = {
        ...updates.metadata,
        modifiedBy: req.user.username,
        lastModified: new Date().toISOString(),
      };

      const result = await gcodeManager.updateProgram(programId, updates);

      if (result.success) {
        logger.robot('G-code program updated', {
          programId,
          user: req.user.username,
          size: result.program.size,
        });
        res.json({
          success: true,
          message: 'G-code program updated successfully',
          program: result.program,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to update G-code program', {
        programId: req.params.programId,
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Delete a G-code program
app.delete(
  '/api/gcode/programs/:programId',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.api,
  async (req, res) => {
    try {
      const { programId } = req.params;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = await gcodeManager.deleteProgram(programId);

      if (result.success) {
        logger.robot('G-code program deleted', {
          programId,
          user: req.user.username,
        });
        res.json({
          success: true,
          message: 'G-code program deleted successfully',
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to delete G-code program', {
        programId: req.params.programId,
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Parse and validate a G-code program
app.post(
  '/api/gcode/programs/:programId/parse',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      const { programId } = req.params;
      const options = req.body.options || {};

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = await gcodeManager.parseProgram(programId, options);

      if (result.success) {
        logger.robot('G-code program parsed', {
          programId,
          user: req.user.username,
          valid: result.parseResult.success,
          errors: result.parseResult.errors.length,
          warnings: result.parseResult.warnings.length,
        });
        res.json(result);
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Failed to parse G-code program', {
        programId: req.params.programId,
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// G-code syntax validation (quick check)
app.post(
  '/api/gcode/validate',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.validateGcode,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { gcode } = req.body;

      const parser = new GCodeParser();
      const result = parser.validateSyntax(gcode);

      logger.robot('G-code validation performed', {
        user: req.user.username,
        lineCount: result.lineCount,
        valid: result.valid,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });

      res.json({
        success: true,
        validation: result,
      });
    } catch (error) {
      logger.error('G-code validation failed', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get G-code execution state
app.get(
  '/api/gcode/execution/state',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!gcodeManager) {
        return res.json({
          success: true,
          state: {
            running: false,
            paused: false,
            currentProgram: null,
            currentLine: 0,
            totalLines: 0,
            progress: 0,
            elapsedTime: 0,
            stepMode: false,
            breakpoints: [],
          },
        });
      }

      const state = gcodeManager.getExecutionState();
      res.json({ success: true, state });
    } catch (error) {
      logger.error('Failed to get G-code execution state', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Set execution breakpoints
app.post(
  '/api/gcode/execution/breakpoints',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.setBreakpoints,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { breakpoints } = req.body;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = gcodeManager.setBreakpoints(breakpoints);

      logger.robot('G-code breakpoints set', {
        user: req.user.username,
        breakpoints: result.breakpoints,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to set G-code breakpoints', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Toggle step mode
app.post(
  '/api/gcode/execution/step-mode',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.setStepMode,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { enabled } = req.body;

      if (!gcodeManager) {
        return res.status(503).json({
          success: false,
          error: 'G-code manager not available',
        });
      }

      const result = gcodeManager.setStepMode(enabled);

      logger.robot('G-code step mode toggled', {
        user: req.user.username,
        enabled: result.stepMode,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to set G-code step mode', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get G-code manager statistics
app.get(
  '/api/gcode/statistics',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!gcodeManager) {
        return res.json({
          success: true,
          statistics: {
            totalPrograms: 0,
            totalSize: 0,
            validPrograms: 0,
            programsWithErrors: 0,
            programsWithWarnings: 0,
            averageSize: 0,
            totalExecutions: 0,
            totalExecutionTime: 0,
          },
        });
      }

      const statistics = gcodeManager.getStatistics();

      logger.audit('G-code statistics accessed', {
        user: req.user.username,
        totalPrograms: statistics.totalPrograms,
      });

      res.json({ success: true, statistics });
    } catch (error) {
      logger.error('Failed to get G-code statistics', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// G-code validation endpoint
app.post(
  '/api/gcode/validate',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  validationRules.gcodeExecute,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { gcode } = req.body;

      if (!gcode || typeof gcode !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid G-code input',
        });
      }

      // Use the GCodeParser for validation
      const { GCodeParser } = require('./lib/gcode-parser');
      const parser = new GCodeParser({
        strictValidation: true,
        arcSegmentResolution: 1.0,
      });

      const result = await parser.parse(gcode);

      res.json({
        success: true,
        valid: result.success,
        errors: result.errors || [],
        warnings: result.warnings || [],
        statistics: result.statistics,
        coordinateSystemInfo: parser.getCoordinateSystemInfo(),
      });
    } catch (error) {
      logger.error('G-code validation failed', {
        error: error.message,
        user: req.user?.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get coordinate system information
app.get(
  '/api/gcode/coordinate-systems',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      // Initialize a parser to get default coordinate system info
      const { GCodeParser } = require('./lib/gcode-parser');
      const parser = new GCodeParser();

      const coordinateSystemInfo = parser.getCoordinateSystemInfo();

      res.json({
        success: true,
        coordinateSystemInfo,
      });
    } catch (error) {
      logger.error('Failed to get coordinate system info', {
        error: error.message,
        user: req.user?.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Set coordinate system offsets
app.post(
  '/api/gcode/coordinate-systems/:system/offset',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  validationRules.setCoordinateOffset,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { system } = req.params;
      const { offset } = req.body;

      if (!['G54', 'G55', 'G56', 'G57', 'G58', 'G59'].includes(system)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid coordinate system',
        });
      }

      // Store coordinate system offsets in robot config
      if (!robotConfig.coordinateSystemOffsets) {
        robotConfig.coordinateSystemOffsets = {};
      }

      robotConfig.coordinateSystemOffsets[system] = {
        x: offset.x || 0,
        y: offset.y || 0,
        z: offset.z || 0,
        a: offset.a || 0,
        b: offset.b || 0,
        c: offset.c || 0,
      };

      // Save to file
      fs.writeJsonSync(CONFIG_FILE, robotConfig, { spaces: 2 });

      logger.robot('Coordinate system offset set', {
        user: req.user.username,
        system,
        offset: robotConfig.coordinateSystemOffsets[system],
      });

      res.json({
        success: true,
        system,
        offset: robotConfig.coordinateSystemOffsets[system],
      });
    } catch (error) {
      logger.error('Failed to set coordinate system offset', {
        error: error.message,
        user: req.user?.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Database Management Routes
// ==========================

// Get database statistics and health
app.get(
  '/api/database/status',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!databaseManager) {
        return res.json({
          success: true,
          database: {
            enabled: false,
            type: 'json',
            message: 'Using JSON file storage',
          },
        });
      }

      const statistics = await databaseManager.getStatistics();

      res.json({
        success: true,
        database: {
          enabled: true,
          type: 'sqlite',
          statistics,
          health: 'operational',
        },
      });
    } catch (error) {
      logger.error('Failed to get database status', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Create database backup
app.post(
  '/api/database/backup',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!databaseManager) {
        return res.status(503).json({
          success: false,
          error: 'Database not available',
        });
      }

      const { name } = req.body;
      const backupPath = await databaseManager.createBackup(name);

      logger.audit('Database backup created', {
        user: req.user.username,
        backupPath,
        name,
      });

      res.json({
        success: true,
        message: 'Database backup created successfully',
        backupPath,
      });
    } catch (error) {
      logger.error('Failed to create database backup', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Database cleanup
app.post(
  '/api/database/cleanup',
  authenticateToken,
  requireRole(['admin']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!databaseManager) {
        return res.status(503).json({
          success: false,
          error: 'Database not available',
        });
      }

      const options = req.body.options || {};
      const cleanedCount = await databaseManager.cleanup(options);

      logger.audit('Database cleanup performed', {
        user: req.user.username,
        cleanedRecords: cleanedCount,
        options,
      });

      res.json({
        success: true,
        message: `Database cleanup completed: ${cleanedCount} records removed`,
        cleanedRecords: cleanedCount,
      });
    } catch (error) {
      logger.error('Failed to cleanup database', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// System Monitoring Routes
// ========================

// Get current system metrics
app.get(
  '/api/monitoring/metrics',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!systemMonitor) {
        return res.status(503).json({
          success: false,
          error: 'Monitoring service not available',
        });
      }

      const metrics = systemMonitor.getMetrics();

      res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      logger.error('Failed to get system metrics', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get system health status
app.get(
  '/api/monitoring/health',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!systemMonitor) {
        return res.status(503).json({
          success: false,
          error: 'Monitoring service not available',
        });
      }

      const health = systemMonitor.getHealthStatus();

      res.json({
        success: true,
        health,
      });
    } catch (error) {
      logger.error('Failed to get system health', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get active alerts
app.get(
  '/api/monitoring/alerts',
  authenticateToken,
  requireRole(['admin', 'operator', 'viewer']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!systemMonitor) {
        return res.status(503).json({
          success: false,
          error: 'Monitoring service not available',
        });
      }

      const alerts = systemMonitor.getAlerts();

      res.json({
        success: true,
        alerts,
      });
    } catch (error) {
      logger.error('Failed to get system alerts', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Clear robot errors
app.post(
  '/api/monitoring/robot/clear-errors',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  async (req, res) => {
    try {
      if (!systemMonitor) {
        return res.status(503).json({
          success: false,
          error: 'Monitoring service not available',
        });
      }

      systemMonitor.clearRobotErrors();

      logger.audit('Robot errors cleared', {
        user: req.user.username,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Robot errors cleared successfully',
      });
    } catch (error) {
      logger.error('Failed to clear robot errors', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Update robot status (internal API for robot controllers)
app.post(
  '/api/monitoring/robot/status',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.api,
  [
    body('connection_status').optional().isIn(['connected', 'disconnected', 'connecting']),
    body('execution_state').optional().isIn(['idle', 'executing', 'paused', 'stopped', 'error']),
    body('current_position').optional().isObject(),
    body('target_position').optional().isObject(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      if (!systemMonitor) {
        return res.status(503).json({
          success: false,
          error: 'Monitoring service not available',
        });
      }

      const statusUpdate = req.body;
      systemMonitor.updateRobotStatus(statusUpdate);

      logger.info('Robot status updated', {
        user: req.user.username,
        statusUpdate,
      });

      res.json({
        success: true,
        message: 'Robot status updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update robot status', {
        error: error.message,
        user: req.user.username,
      });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Manual control endpoint
app.post(
  '/api/manual/move',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.robotControl,
  validationRules.manualMove,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { axis, value, manipulator } = req.body;
      logger.robot('Manual movement requested', {
        axis,
        value,
        manipulator,
        user: req.user?.username,
      });

      if (mks42d && robotConfig.mks42d.enabled) {
        // Use MKS42D controllers for actual hardware communication
        if (axis) {
          // Find controllers that handle this axis
          const controllerIds = mks42d.controllers
            .filter(c => c.axes.includes(axis.toUpperCase()))
            .map(c => c.id);

          if (controllerIds.length > 0) {
            // Convert axis letter to number
            const axisNumber = { X: 0, Y: 1, Z: 2, E: 3 }[axis.toUpperCase()] || 0;

            // Send move command to all relevant controllers
            const results = [];
            for (const controllerId of controllerIds) {
              try {
                await mks42d.moveAbsolute(controllerId, axisNumber, value, 1000);
                results.push({ controllerId, success: true });
              } catch (error) {
                results.push({
                  controllerId,
                  success: false,
                  error: error.message,
                });
              }
            }

            io.emit('robotMovement', {
              axis,
              value,
              controllers: controllerIds,
              results,
              timestamp: Date.now(),
            });

            res.json({ success: true, controllers: controllerIds, results });
          } else {
            res.json({
              success: false,
              error: `No controllers configured for axis ${axis}`,
            });
          }
        } else if (manipulator) {
          // Handle manipulator movement (gripper)
          const gripperControllers = mks42d.controllers.filter(c => c.type === 'gripper');

          if (gripperControllers.length > 0) {
            const results = [];
            for (const controller of gripperControllers) {
              try {
                await mks42d.moveAbsolute(controller.id, 3, value, 500); // E-axis for gripper
                results.push({ controllerId: controller.id, success: true });
              } catch (error) {
                results.push({
                  controllerId: controller.id,
                  success: false,
                  error: error.message,
                });
              }
            }

            io.emit('robotMovement', {
              manipulator,
              value,
              controllers: gripperControllers.map(c => c.id),
              results,
              timestamp: Date.now(),
            });

            res.json({
              success: true,
              controllers: gripperControllers.map(c => c.id),
              results,
            });
          } else {
            res.json({
              success: false,
              error: 'No gripper controllers configured',
            });
          }
        }
      } else {
        // Fallback to simulation mode
        io.emit('robotMovement', {
          axis,
          value,
          manipulator,
          timestamp: Date.now(),
        });
        res.json({ success: true, mode: 'simulation' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Home endpoint
app.post(
  '/api/home',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.robotControl,
  validationRules.homeAxes,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { axes } = req.body; // Optional: specific axes to home
      logger.robot('Homing requested', {
        axes: axes || 'all axes',
        user: req.user?.username,
      });

      if (mks42d && robotConfig.mks42d.enabled) {
        let controllerIds = [];

        if (axes && axes.length > 0) {
          // Home specific axes
          axes.forEach(axis => {
            const axisControllers = mks42d.controllers
              .filter(c => c.axes.includes(axis.toUpperCase()))
              .map(c => c.id);
            controllerIds.push(...axisControllers);
          });
          // Remove duplicates
          controllerIds = [...new Set(controllerIds)];
        } else {
          // Home all controllers
          controllerIds = mks42d.controllers.map(c => c.id);
        }

        if (controllerIds.length > 0) {
          const results = await mks42d.goHome(controllerIds);
          io.emit('homeStatus', {
            status: 'started',
            controllers: controllerIds,
          });
          res.json({ success: true, controllers: controllerIds, results });
        } else {
          res.json({
            success: false,
            error: 'No controllers found for specified axes',
          });
        }
      } else {
        // Fallback to simulation
        io.emit('homeStatus', { status: 'started', mode: 'simulation' });
        setTimeout(() => {
          io.emit('homeStatus', { status: 'completed', mode: 'simulation' });
        }, 2000);
        res.json({ success: true, mode: 'simulation' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Emergency stop endpoint
app.post(
  '/api/emergency-stop',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.emergencyStop,
  async (req, res) => {
    try {
      logger.security('Emergency stop triggered', {
        user: req.user?.username,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      if (mks42d && robotConfig.mks42d.enabled) {
        // Use MKS42D controllers for actual emergency stop
        const results = await mks42d.stop();
        io.emit('emergencyStop', { timestamp: Date.now(), results });
        res.json({ success: true, message: 'Emergency stop activated', results });
      } else {
        // Fallback to simulation
        io.emit('emergencyStop', { timestamp: Date.now(), mode: 'simulation' });
        res.json({
          success: true,
          message: 'Emergency stop activated (simulation)',
        });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Position replay endpoint
app.post(
  '/api/replay/:id',
  authenticateToken,
  requireRole(['admin', 'operator']),
  rateLimits.robotControl,
  validationRules.positionReplay,
  handleValidationErrors,
  async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const position = savedPositions.find(pos => pos.id === positionId);

      if (!position) {
        return res.status(404).json({ success: false, error: 'Position not found' });
      }

      logger.robot('Replaying position', {
        positionName: position.name,
        positionId,
        user: req.user?.username,
      });

      if (mks42d && robotConfig.mks42d.enabled) {
        // Use MKS42D controllers for actual position replay
        io.emit('replayStatus', { status: 'starting', position: position.name });
        const results = [];
        // Move each axis to its saved position
        const axisEntries = Object.entries(position.axes);
        for (let i = 0; i < axisEntries.length; i++) {
          const [axis, value] = axisEntries[i];
          const axisUpper = axis.toUpperCase();
          const controllerIds = mks42d.controllers
            .filter(c => c.axes.includes(axisUpper))
            .map(c => c.id);
          if (controllerIds.length > 0) {
            const axisNumber = { X: 0, Y: 1, Z: 2, E: 3 }[axisUpper] || 0;
            for (let j = 0; j < controllerIds.length; j++) {
              const controllerId = controllerIds[j];
              try {
                await mks42d.moveAbsolute(controllerId, axisNumber, value, 1000);
                results.push({ axis, controllerId, success: true });
              } catch (error) {
                results.push({
                  axis,
                  controllerId,
                  success: false,
                  error: error.message,
                });
              }
            }
          }
        }
        // Handle manipulators
        const manipEntries = Object.entries(position.manipulators);
        for (let i = 0; i < manipEntries.length; i++) {
          const [manipulator, value] = manipEntries[i];
          const gripperControllers = mks42d.controllers.filter(c => c.type === 'gripper');
          for (let j = 0; j < gripperControllers.length; j++) {
            const controller = gripperControllers[j];
            try {
              await mks42d.moveAbsolute(controller.id, 3, value, 500);
              results.push({
                manipulator,
                controllerId: controller.id,
                success: true,
              });
            } catch (error) {
              results.push({
                manipulator,
                controllerId: controller.id,
                success: false,
                error: error.message,
              });
            }
          }
        }
        // Wait for position delay
        if (position.delay) {
          await new Promise(resolve => setTimeout(resolve, position.delay));
        }
        io.emit('robotMovement', {
          axes: position.axes,
          manipulators: position.manipulators,
          timestamp: Date.now(),
          results,
        });
        io.emit('replayStatus', {
          status: 'completed',
          position: position.name,
          results,
        });
        res.json({ success: true, results });
      } else {
        // Fallback to simulation mode
        io.emit('replayStatus', { status: 'starting', position: position.name });
        setTimeout(() => {
          io.emit('robotMovement', {
            axes: position.axes,
            manipulators: position.manipulators,
            timestamp: Date.now(),
            mode: 'simulation',
          });
          setTimeout(() => {
            io.emit('replayStatus', {
              status: 'completed',
              position: position.name,
              mode: 'simulation',
            });
          }, position.delay || 1000);
        }, 500);
        return res.json({ success: true, mode: 'simulation' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Socket.IO connection handling
io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // Track connected clients count for monitoring
  if (!global.activeSessions) {
    global.activeSessions = 0;
  }
  global.activeSessions++;

  // Send current configuration, positions, and groups to new client
  socket.emit('configUpdated', robotConfig);
  socket.emit('positionsUpdated', savedPositions);
  socket.emit('groupsUpdated', positionGroups);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Decrease active sessions count
    if (global.activeSessions > 0) {
      global.activeSessions--;
    }
  });

  // Handle real-time manual control
  socket.on('manualControl', data => {
    console.log('Real-time manual control:', data);
    // Broadcast manual control data to other clients for real-time updates
    socket.broadcast.emit('robotMovement', data);
  });

  // Handle emergency stop
  socket.on('emergencyStop', data => {
    logger.robot('Emergency stop requested via socket', {
      data,
      socketId: socket.id,
    });
    // Broadcast emergency stop to other clients for immediate response
    socket.broadcast.emit('emergencyStop', data);
  });

  // Handle monitoring dashboard requests
  socket.on('request-metrics', () => {
    if (systemMonitor) {
      socket.emit('metrics-update', systemMonitor.getMetrics());
      socket.emit('health-update', systemMonitor.getHealthStatus());
      socket.emit('alerts-update', systemMonitor.getAlerts());
    }
  });

  socket.on('request-health', () => {
    if (systemMonitor) {
      socket.emit('health-update', systemMonitor.getHealthStatus());
    }
  });

  socket.on('request-alerts', () => {
    if (systemMonitor) {
      socket.emit('alerts-update', systemMonitor.getAlerts());
    }
  });

  socket.on('clear-robot-errors', () => {
    if (systemMonitor) {
      systemMonitor.clearRobotErrors();
      socket.emit('robot-errors-cleared');
      // Broadcast to other clients
      socket.broadcast.emit('robot-errors-cleared');
    }
  });
});

// Add error handling middleware
app.use(errorLoggingMiddleware);

// Serve React app for all non-API routes in production or Electron
if (process.env.NODE_ENV === 'production' || isElectron) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Initialize Database and Migration System
let databaseManager = null;
let systemMonitor = null;

async function initializeDatabase() {
  try {
    logger.info('Initializing database system...');

    // Initialize database manager
    databaseManager = new DatabaseManager();

    // Check if migration is needed
    const migration = new DataMigration();
    const needsMigration = await migration.isMigrationNeeded();

    if (needsMigration) {
      logger.info('JSON data migration required, starting migration...');
      await migration.migrate();
      logger.info('Data migration completed successfully');
    } else {
      // Just initialize database
      await databaseManager.initialize();
      logger.info('Database initialized successfully');
    }

    // Close migration connection
    await migration.close();

    return true;
  } catch (error) {
    logger.error('Failed to initialize database', { error: error.message, stack: error.stack });
    databaseManager = null;
    return false;
  }
}

async function initializeMonitoring() {
  try {
    logger.info('Initializing monitoring system...');

    // Initialize system monitor with database and Socket.IO instances
    systemMonitor = getMonitorInstance(databaseManager, io);
    await systemMonitor.initialize();

    // Set global reference for Socket.IO
    global.io = io;

    // Start monitoring with 5-second intervals
    systemMonitor.startMonitoring(5000);

    logger.info('Monitoring system initialized successfully');
    return true;
  } catch (error) {
    logger.error('Failed to initialize monitoring system', {
      error: error.message,
      stack: error.stack,
      database: !!databaseManager,
      io: !!io,
    });
    systemMonitor = null;
    return false;
  }
}

// Start server and export for Electron
if (!module.parent || isElectron) {
  // TEMPORARILY SKIP DATABASE INITIALIZATION FOR DEBUGGING
  // initializeDatabase()
  //   .then(async dbSuccess => {
  //     if (!dbSuccess) {
  //       logger.warn('Database initialization failed, continuing with JSON fallback mode');
  //     }
      
      // Skip database initialization and go directly to server start
      const dbSuccess = false;
      logger.warn('Database initialization skipped for debugging, using JSON fallback mode');

      // Initialize monitoring system - TEMPORARILY DISABLED
      /*
    const monitoringSuccess = await initializeMonitoring();
    if (!monitoringSuccess) {
      logger.warn('Monitoring system initialization failed, continuing without monitoring');
    }
    */
      logger.info('Monitoring system temporarily disabled for debugging');
      systemMonitor = null;

      server.listen(PORT, () => {
        logger.info('Arctos Robot Controller server started successfully', {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          electron: !!isElectron,
          database: !!databaseManager,
          monitoring: !!systemMonitor,
        });
        console.log(`✓ Server running on port ${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✓ Electron mode: ${isElectron ? 'Yes' : 'No'}`);
        console.log(`✓ Database: ${databaseManager ? 'SQLite' : 'JSON fallback'}`);
        console.log(`✓ Monitoring: ${systemMonitor ? 'Enabled' : 'Disabled'}`);
        console.log('✓ Authentication: enabled');
      });
    // })
    // .catch(error => {
    //   logger.error('Server startup failed', { error: error.message });
    //   console.error('Failed to start server:', error);
    //   process.exit(1);
    // });
} else {
  // For testing/module use, provide initialization function
  module.exports.initializeDatabase = initializeDatabase;
}

// Export server instance for Electron integration
module.exports = server;
