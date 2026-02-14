/**
 * Enhanced Integration Test Environment Setup
 *
 * Comprehensive test environment initialization for all integration testing scenarios
 * Integration Test Engineer Implementation
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import application modules
const { DatabaseManager } = require('../../lib/database');
const { AuthService } = require('../../lib/auth');
const { MKS42DController } = require('../../lib/mks42d');
const { logger } = require('../../lib/logger');

// Test configuration
const TEST_CONFIG = {
  server: {
    host: 'localhost',
    port: 5001,
    timeout: 30000,
  },
  auth: {
    jwt: {
      secret: 'integration-test-jwt-secret-2025',
      expiresIn: '1h',
    },
  },
  database: {
    testDbPath: path.join(__dirname, '../test-data/integration-test.db'),
  },
  filesystem: {
    testDataDir: path.join(__dirname, '../test-data'),
    testConfigDir: path.join(__dirname, '../test-data/config'),
    testLogsDir: path.join(__dirname, '../test-data/logs'),
  },
  performance: {
    apiResponseTime: 200, // ms
    socketLatency: 50, // ms
    dbQueryTime: 100, // ms
  },
};

/**
 * Setup comprehensive integration test environment
 * Returns fully configured helper instance with all services
 */
async function setupIntegrationTestEnvironment(options = {}) {
  const {
    enableDatabase = true,
    enableAuth = true,
    enableHardwareSimulation = true,
    enableSocketIO = true,
    verbose = false,
  } = options;

  console.log('🚀 Initializing comprehensive integration test environment...');

  // Create test directories
  await fs.ensureDir(TEST_CONFIG.filesystem.testDataDir);
  await fs.ensureDir(TEST_CONFIG.filesystem.testConfigDir);
  await fs.ensureDir(TEST_CONFIG.filesystem.testLogsDir);

  // Initialize Express application
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO if enabled
  let io = null;
  if (enableSocketIO) {
    io = socketIo(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Basic socket authentication middleware
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, TEST_CONFIG.auth.jwt.secret);
        socket.user = decoded;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    io.on('connection', socket => {
      if (verbose) {
        console.log(`Socket connected: ${socket.user.username} (${socket.user.role})`);
      }

      socket.on('disconnect', () => {
        if (verbose) {
          console.log(`Socket disconnected: ${socket.user.username}`);
        }
      });

      // Basic ping/pong for connection testing
      socket.on('ping', data => {
        socket.emit('pong', { ...data, serverTime: Date.now() });
      });
    });
  }

  // Initialize Database Manager if enabled
  let dbManager = null;
  if (enableDatabase) {
    dbManager = new DatabaseManager({
      dialect: 'sqlite',
      storage: TEST_CONFIG.database.testDbPath,
      logging: verbose ? console.log : false,
    });

    await dbManager.initialize();
    await dbManager.sync({ force: true }); // Reset database for tests

    if (verbose) {
      console.log('✅ Database initialized for testing');
    }
  }

  // Initialize Auth Service if enabled
  let authService = null;
  if (enableAuth && dbManager) {
    authService = new AuthService({
      jwtSecret: TEST_CONFIG.auth.jwt.secret,
      jwtExpiresIn: TEST_CONFIG.auth.jwt.expiresIn,
      dbManager: dbManager,
    });

    if (verbose) {
      console.log('✅ Authentication service initialized');
    }
  }

  // Setup basic API routes for testing
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: !!dbManager,
        auth: !!authService,
        socket: !!io,
      },
    });
  });

  // Authentication middleware
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    jwt.verify(token, TEST_CONFIG.auth.jwt.secret, (err, user) => {
      if (err) {
        return res.status(403).json({ success: false, error: 'Invalid token' });
      }
      req.user = user;
      next();
    });
  };

  // Role-based authorization middleware
  const requireRole = roles => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const userRoles = Array.isArray(roles) ? roles : [roles];
      if (!userRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      next();
    };
  };

  // Test API routes
  if (enableAuth && authService && dbManager) {
    // User registration
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { username, email, password, role = 'operator' } = req.body;

        // Check if user exists
        const existingUser = await dbManager.models.User.findOne({
          where: { username },
        });

        if (existingUser) {
          return res.status(409).json({
            success: false,
            error: 'Username already exists',
          });
        }

        // Create user
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await dbManager.models.User.create({
          username,
          email,
          password: hashedPassword,
          role,
          isActive: true,
          createdAt: new Date().toISOString(),
        });

        // Remove password from response
        const userResponse = { ...user.toJSON() };
        delete userResponse.password;

        res.status(201).json({
          success: true,
          user: userResponse,
          message: 'User registered successfully',
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // User login
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        // Find user
        const user = await dbManager.models.User.findOne({
          where: { username },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials',
          });
        }

        // Generate tokens
        const payload = {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
        };

        const token = jwt.sign(payload, TEST_CONFIG.auth.jwt.secret, {
          expiresIn: TEST_CONFIG.auth.jwt.expiresIn,
        });

        const refreshToken = jwt.sign(payload, TEST_CONFIG.auth.jwt.secret, {
          expiresIn: '7d',
        });

        res.json({
          success: true,
          token,
          refreshToken,
          user: payload,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Get user profile
    app.get('/api/auth/profile', authenticateToken, async (req, res) => {
      try {
        const user = await dbManager.models.User.findByPk(req.user.id, {
          attributes: { exclude: ['password'] },
        });

        res.json({
          success: true,
          user: user.toJSON(),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // 2FA setup
    app.post('/api/auth/2fa/setup', authenticateToken, (req, res) => {
      const secret = require('speakeasy').generateSecret({
        name: `Arctos Robot Controller (${req.user.username})`,
        issuer: 'Arctos Integration Tests',
      });

      res.json({
        success: true,
        secret: secret.base32,
        qrCode: `otpauth://totp/Arctos%20Robot%20Controller%20(${req.user.username})?secret=${secret.base32}&issuer=Arctos%20Integration%20Tests`,
      });
    });

    // 2FA verification
    app.post('/api/auth/2fa/verify-setup', authenticateToken, (req, res) => {
      const { token, secret } = req.body;
      const speakeasy = require('speakeasy');

      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
      });

      if (verified) {
        // Generate backup codes
        const backupCodes = Array.from({ length: 10 }, () =>
          Math.random().toString(36).substring(2, 10).toUpperCase()
        );

        res.json({
          success: true,
          message: '2FA setup verified successfully',
          backupCodes,
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid 2FA token',
        });
      }
    });
  }

  // Configuration endpoints
  app.get('/api/config', authenticateToken, (req, res) => {
    const configPath = path.join(TEST_CONFIG.filesystem.testConfigDir, 'robot-config.json');

    fs.readJson(configPath)
      .then(config => {
        res.json({ success: true, config });
      })
      .catch(() => {
        // Return default config if file doesn't exist
        const defaultConfig = {
          robotType: 'test_robot',
          communicationProtocol: 'simulation',
          axes: { count: 6 },
          manipulators: { count: 2 },
        };
        res.json({ success: true, config: defaultConfig });
      });
  });

  app.post(
    '/api/config',
    authenticateToken,
    requireRole(['admin', 'operator']),
    async (req, res) => {
      try {
        const configPath = path.join(TEST_CONFIG.filesystem.testConfigDir, 'robot-config.json');
        await fs.writeJson(configPath, req.body, { spaces: 2 });

        // Broadcast configuration update via Socket.IO
        if (io) {
          io.emit('configUpdated', req.body);
        }

        res.json({
          success: true,
          message: 'Configuration updated successfully',
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  // Position management endpoints
  if (enableDatabase && dbManager) {
    app.get('/api/positions', authenticateToken, async (req, res) => {
      try {
        const positions = await dbManager.models.Position.findAll({
          order: [['created_at', 'DESC']],
        });

        res.json({
          success: true,
          positions: positions.map(p => p.toJSON()),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    app.post(
      '/api/positions',
      authenticateToken,
      requireRole(['admin', 'operator']),
      async (req, res) => {
        try {
          const positionData = {
            ...req.body,
            created_by: req.user.id,
            created_at: new Date().toISOString(),
          };

          const position = await dbManager.models.Position.create(positionData);

          // Broadcast position update via Socket.IO
          if (io) {
            io.emit('positionsUpdated', { action: 'created', position: position.toJSON() });
          }

          res.json({
            success: true,
            position: position.toJSON(),
            message: 'Position saved successfully',
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      }
    );

    app.delete(
      '/api/positions/:id',
      authenticateToken,
      requireRole(['admin', 'operator']),
      async (req, res) => {
        try {
          const position = await dbManager.models.Position.findByPk(req.params.id);

          if (!position) {
            return res.status(404).json({
              success: false,
              error: 'Position not found',
            });
          }

          await position.destroy();

          // Broadcast position update via Socket.IO
          if (io) {
            io.emit('positionsUpdated', { action: 'deleted', positionId: req.params.id });
          }

          res.json({
            success: true,
            message: 'Position deleted successfully',
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      }
    );
  }

  // Manual control endpoints
  app.post(
    '/api/manual/move',
    authenticateToken,
    requireRole(['admin', 'operator']),
    (req, res) => {
      const { axis, direction, distance, targetPosition } = req.body;

      // Simulate robot movement
      const newPosition = {
        axes: {
          axis1: targetPosition || (direction === 'positive' ? distance : -distance) || 0,
          axis2: 0,
          axis3: 0,
          axis4: 0,
          axis5: 0,
          axis6: 0,
        },
        timestamp: Date.now(),
      };

      // Broadcast position update via Socket.IO
      if (io) {
        io.emit('positionUpdate', { position: newPosition });
      }

      res.json({
        success: true,
        message: `Moved ${axis} ${direction || 'to position'}`,
        position: newPosition,
      });
    }
  );

  // Robot position endpoint
  app.get('/api/robot/position', authenticateToken, (req, res) => {
    // Return simulated current position
    res.json({
      success: true,
      position: {
        axes: { axis1: 0, axis2: 0, axis3: 0, axis4: 0, axis5: 0, axis6: 0 },
        manipulators: { gripper1: 0, gripper2: 0 },
        timestamp: Date.now(),
      },
    });
  });

  // G-Code endpoints
  app.post(
    '/api/gcode/upload',
    authenticateToken,
    requireRole(['admin', 'operator']),
    (req, res) => {
      // Simulate G-Code upload
      const program = {
        id: Date.now().toString(),
        name: req.body.name || 'Test Program',
        description: req.body.description || 'Integration test program',
        created_at: new Date().toISOString(),
        created_by: req.user.id,
      };

      res.json({
        success: true,
        program,
        message: 'G-Code program uploaded successfully',
      });
    }
  );

  app.post('/api/gcode/validate/:id', authenticateToken, (req, res) => {
    res.json({
      success: true,
      validation: {
        errors: [],
        warnings: [],
        lineCount: 10,
        estimatedDuration: 120, // seconds
      },
    });
  });

  app.post(
    '/api/gcode/execute/:id',
    authenticateToken,
    requireRole(['admin', 'operator']),
    (req, res) => {
      const executionId = Date.now().toString();

      // Broadcast G-Code status via Socket.IO
      if (io) {
        io.emit('gcodeStatus', { status: 'executing', progress: 0, executionId });

        // Simulate execution progress
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += 10;

          if (progress >= 100) {
            clearInterval(progressInterval);
            io.emit('gcodeStatus', { status: 'COMPLETED', progress: 100, executionId });
          } else {
            io.emit('gcodeStatus', { status: 'executing', progress, executionId });
          }
        }, 100);
      }

      res.json({
        success: true,
        executionId,
        message: 'G-Code execution started',
      });
    }
  );

  app.get('/api/gcode/status/:executionId', authenticateToken, (req, res) => {
    // Simulate execution status
    res.json({
      success: true,
      status: {
        state: 'COMPLETED',
        progress: 100,
        executionId: req.params.executionId,
      },
    });
  });

  app.get('/api/gcode/history', authenticateToken, (req, res) => {
    res.json({
      success: true,
      history: [],
    });
  });

  // User management endpoints (admin only)
  if (enableAuth && dbManager) {
    app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
      try {
        const users = await dbManager.models.User.findAll({
          attributes: { exclude: ['password'] },
          order: [['created_at', 'DESC']],
        });

        res.json({
          success: true,
          users: users.map(u => u.toJSON()),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    app.post('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
      try {
        const { username, email, password, role } = req.body;

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await dbManager.models.User.create({
          username,
          email,
          password: hashedPassword,
          role,
          isActive: true,
          createdAt: new Date().toISOString(),
        });

        const userResponse = { ...user.toJSON() };
        delete userResponse.password;

        res.status(201).json({
          success: true,
          user: userResponse,
          message: 'User created successfully',
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });
  }

  // Start server
  await new Promise((resolve, reject) => {
    server.listen(TEST_CONFIG.server.port, TEST_CONFIG.server.host, err => {
      if (err) {
        reject(err);
      } else {
        if (verbose) {
          console.log(
            `✅ Test server running on http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`
          );
        }
        resolve();
      }
    });
  });

  // Create enhanced helper instance
  const helper = {
    server,
    app,
    io,
    dbManager,
    authService,
    testConfig: TEST_CONFIG,
    testDataDir: TEST_CONFIG.filesystem.testDataDir,

    // Enhanced helper methods
    createTestUser: async (username, password, role = 'operator') => {
      if (!dbManager) {
        throw new Error('Database manager not initialized');
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const userData = {
        username,
        email: `${username}@integration-test.local`,
        password: hashedPassword,
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const user = await dbManager.models.User.create(userData);
      return user;
    },

    generateAuthToken: user => {
      const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
      };

      return jwt.sign(payload, TEST_CONFIG.auth.jwt.secret, {
        expiresIn: TEST_CONFIG.auth.jwt.expiresIn,
      });
    },

    generateTestTOTP: secret => {
      return require('speakeasy').totp({
        secret: secret,
        encoding: 'base32',
      });
    },

    createAuthenticatedSocket: async (token, timeout = 10000) => {
      const { io: SocketIOClient } = require('socket.io-client');

      return new Promise((resolve, reject) => {
        const socket = SocketIOClient(
          `http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`,
          {
            auth: { token },
            transports: ['websocket'],
          }
        );

        const timer = setTimeout(() => {
          socket.disconnect();
          reject(new Error(`Socket authentication timeout after ${timeout}ms`));
        }, timeout);

        socket.on('connect', () => {
          clearTimeout(timer);
          resolve(socket);
        });

        socket.on('connect_error', error => {
          clearTimeout(timer);
          reject(new Error(`Socket connection failed: ${error.message}`));
        });
      });
    },

    waitForSocketConnection: async (socket, timeout = 5000) => {
      if (socket.connected) return true;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Socket connection timeout'));
        }, timeout);

        socket.on('connect', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    },

    waitForSocketEvent: async (socket, eventName, timeout = 5000) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Socket event '${eventName}' timeout after ${timeout}ms`));
        }, timeout);

        socket.once(eventName, data => {
          clearTimeout(timer);
          resolve(data);
        });
      });
    },

    delay: ms => new Promise(resolve => setTimeout(resolve, ms)),

    resetTestData: async () => {
      if (dbManager) {
        const models = Object.values(dbManager.models);
        await dbManager.sequelize.query('PRAGMA foreign_keys = OFF;');

        try {
          for (const model of models.reverse()) {
            await model.destroy({ where: {}, force: true });
          }
        } finally {
          await dbManager.sequelize.query('PRAGMA foreign_keys = ON;');
        }
      }
    },

    setupDefaultRobotConfig: async () => {
      const configPath = path.join(TEST_CONFIG.filesystem.testConfigDir, 'robot-config.json');
      const defaultConfig = {
        robotType: 'integration_test_robot',
        communicationProtocol: 'simulation',
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
      };

      await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
      return defaultConfig;
    },
  };

  console.log('✅ Comprehensive integration test environment ready');
  return helper;
}

/**
 * Teardown integration test environment
 */
async function teardownIntegrationTestEnvironment() {
  console.log('🧹 Tearing down integration test environment...');

  try {
    // Clean up test directories
    await fs.remove(TEST_CONFIG.filesystem.testDataDir);
    console.log('✅ Integration test environment cleanup completed');
  } catch (error) {
    console.warn('Warning: Failed to clean up integration test environment:', error.message);
  }
}

module.exports = {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  TEST_CONFIG,
};
