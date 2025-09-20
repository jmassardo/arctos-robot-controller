const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');

// Import security middleware
const {
  rateLimits,
  validateInput,
  securityMiddleware,
  threatDetection
} = require('../lib/security');

// Mock Express app for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  return app;
}

test('Rate Limiting Middleware', async (t) => {
  await t.test('should limit login attempts', async () => {
    const app = createTestApp();
    app.use('/auth/login', rateLimits.auth);
    app.post('/auth/login', (req, res) => {
      res.json({ success: true });
    });

    // Make requests up to the limit
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/auth/login')
        .expect(200);
    }

    // 6th request should be rate limited
    const response = await request(app)
      .post('/auth/login')
      .expect(429);

    assert.ok(response.body.error.includes('Too many'));
  });

  await t.test('should limit API requests', async () => {
    const app = createTestApp();
    app.use('/api/test', rateLimits.api);
    app.get('/api/test', (req, res) => {
      res.json({ success: true });
    });

    // Make requests up to the limit (100 requests per 15 minutes)
    for (let i = 0; i < 100; i++) {
      await request(app)
        .get('/api/test')
        .expect(200);
    }

    // 101st request should be rate limited
    const response = await request(app)
      .get('/api/test')
      .expect(429);

    assert.ok(response.body.error.includes('Too many'));
  });

  await t.test('should limit robot control requests more strictly', async () => {
    const app = createTestApp();
    app.use('/api/robot', rateLimits.robotControl);
    app.post('/api/robot/move', (req, res) => {
      res.json({ success: true });
    });

    // Make requests up to the limit (30 per minute)
    for (let i = 0; i < 30; i++) {
      await request(app)
        .post('/api/robot/move')
        .send({ x: 100 })
        .expect(200);
    }

    // 31st request should be rate limited
    const response = await request(app)
      .post('/api/robot/move')
      .send({ x: 100 })
      .expect(429);

    assert.ok(response.body.error.includes('Too many'));
  });
});

test('Input Validation Middleware', async (t) => {
  await t.test('should validate robot configuration input', async () => {
    const app = createTestApp();
    app.post('/api/config', validateInput.robotConfig, (req, res) => {
      res.json({ success: true });
    });

    // Valid configuration should pass
    const validConfig = {
      robotType: 'mks57d',
      communicationProtocol: 'serial',
      axes: { count: 6 }
    };

    await request(app)
      .post('/api/config')
      .send(validConfig)
      .expect(200);

    // Invalid configuration should fail
    const invalidConfig = {
      robotType: '', // Empty string
      communicationProtocol: 'invalid-protocol',
      axes: { count: 'not-a-number' }
    };

    const response = await request(app)
      .post('/api/config')
      .send(invalidConfig)
      .expect(400);

    assert.ok(response.body.errors);
    assert.ok(response.body.errors.length > 0);
  });

  await t.test('should validate position data input', async () => {
    const app = createTestApp();
    app.post('/api/positions', validateInput.positionData, (req, res) => {
      res.json({ success: true });
    });

    // Valid position data should pass
    const validPosition = {
      name: 'Home Position',
      axes: { x: 100, y: 200, z: 300 },
      manipulators: { gripper: 50 },
      delay: 1000
    };

    await request(app)
      .post('/api/positions')
      .send(validPosition)
      .expect(200);

    // Invalid position data should fail
    const invalidPosition = {
      name: '', // Empty name
      axes: { x: 'not-a-number' },
      manipulators: { gripper: -10 }, // Invalid range
      delay: 'invalid-delay'
    };

    const response = await request(app)
      .post('/api/positions')
      .send(invalidPosition)
      .expect(400);

    assert.ok(response.body.errors);
  });

  await t.test('should validate G-code input', async () => {
    const app = createTestApp();
    app.post('/api/gcode/execute', validateInput.gCode, (req, res) => {
      res.json({ success: true });
    });

    // Valid G-code should pass
    const validGCode = {
      gcode: 'G1 X100 Y200 F1000\\nG1 Z50\\nM3'
    };

    await request(app)
      .post('/api/gcode/execute')
      .send(validGCode)
      .expect(200);

    // Invalid G-code should fail
    const invalidGCode = {
      gcode: 'INVALID COMMAND\\nG1 X' // Incomplete command
    };

    const response = await request(app)
      .post('/api/gcode/execute')
      .send(invalidGCode)
      .expect(400);

    assert.ok(response.body.errors);
  });

  await t.test('should validate user creation input', async () => {
    const app = createTestApp();
    app.post('/auth/register', validateInput.userCreation, (req, res) => {
      res.json({ success: true });
    });

    // Valid user data should pass
    const validUser = {
      username: 'newuser123',
      password: 'StrongPassword123!',
      email: 'user@example.com',
      role: 'operator'
    };

    await request(app)
      .post('/auth/register')
      .send(validUser)
      .expect(200);

    // Invalid user data should fail
    const invalidUser = {
      username: 'us', // Too short
      password: '123', // Too weak
      email: 'invalid-email',
      role: 'invalid-role'
    };

    const response = await request(app)
      .post('/auth/register')
      .send(invalidUser)
      .expect(400);

    assert.ok(response.body.errors);
    assert.ok(response.body.errors.length > 0);
  });
});

test('Security Headers Middleware', async (t) => {
  await t.test('should apply security headers', async () => {
    const app = createTestApp();
    app.use(securityMiddleware);
    app.get('/test', (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .get('/test')
      .expect(200);

    // Check for security headers
    assert.ok(response.headers['x-content-type-options']);
    assert.ok(response.headers['x-frame-options']);
    assert.ok(response.headers['x-xss-protection']);
    assert.ok(response.headers['strict-transport-security']);
    assert.ok(response.headers['content-security-policy']);
  });

  await t.test('should set appropriate CSP headers', async () => {
    const app = createTestApp();
    app.use(securityMiddleware);
    app.get('/test', (req, res) => {
      res.json({ success: true });
    });

    const response = await request(app)
      .get('/test')
      .expect(200);

    const csp = response.headers['content-security-policy'];
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"));
  });
});

test('Threat Detection Middleware', async (t) => {
  await t.test('should detect SQL injection attempts', async () => {
    const app = createTestApp();
    app.use(threatDetection);
    app.post('/api/test', (req, res) => {
      res.json({ success: true });
    });

    // SQL injection attempt
    const maliciousPayload = {
      username: "admin'; DROP TABLE users; --",
      search: "1' OR '1'='1"
    };

    const response = await request(app)
      .post('/api/test')
      .send(maliciousPayload)
      .expect(400);

    assert.ok(response.body.error.includes('security violation'));
  });

  await t.test('should detect XSS attempts', async () => {
    const app = createTestApp();
    app.use(threatDetection);
    app.post('/api/test', (req, res) => {
      res.json({ success: true });
    });

    // XSS attempt
    const maliciousPayload = {
      comment: '<script>alert("XSS")</script>',
      description: '<img src="x" onerror="alert(1)">'
    };

    const response = await request(app)
      .post('/api/test')
      .send(maliciousPayload)
      .expect(400);

    assert.ok(response.body.error.includes('security violation'));
  });

  await t.test('should detect command injection attempts', async () => {
    const app = createTestApp();
    app.use(threatDetection);
    app.post('/api/test', (req, res) => {
      res.json({ success: true });
    });

    // Command injection attempt
    const maliciousPayload = {
      filename: 'test.txt; rm -rf /',
      command: 'ls | cat /etc/passwd'
    };

    const response = await request(app)
      .post('/api/test')
      .send(maliciousPayload)
      .expect(400);

    assert.ok(response.body.error.includes('security violation'));
  });

  await t.test('should allow safe input', async () => {
    const app = createTestApp();
    app.use(threatDetection);
    app.post('/api/test', (req, res) => {
      res.json({ success: true });
    });

    // Safe payload
    const safePayload = {
      username: 'normaluser',
      description: 'This is a normal description',
      value: 42
    };

    await request(app)
      .post('/api/test')
      .send(safePayload)
      .expect(200);
  });
});

test('Input Sanitization', async (t) => {
  const { sanitizeInput } = require('../lib/security');

  await t.test('should sanitize HTML input', () => {
    const dirty = '<script>alert("xss")</script><p>Valid content</p>';
    const clean = sanitizeInput(dirty);
    
    assert.ok(!clean.includes('<script>'));
    assert.ok(clean.includes('Valid content'));
  });

  await t.test('should sanitize SQL injection attempts', () => {
    const dirty = "'; DROP TABLE users; --";
    const clean = sanitizeInput(dirty);
    
    assert.ok(!clean.includes('DROP TABLE'));
    assert.ok(!clean.includes('--'));
  });

  await t.test('should preserve safe content', () => {
    const safe = 'This is normal text with numbers 123 and symbols: @#$%';
    const clean = sanitizeInput(safe);
    
    assert.strictEqual(clean, safe);
  });
});

test('Security Configuration Validation', async (t) => {
  const { validateSecurityConfig } = require('../lib/security');

  await t.test('should validate rate limit configuration', () => {
    const validConfig = {
      windowMs: 900000, // 15 minutes
      max: 100,
      message: 'Too many requests'
    };

    const result = validateSecurityConfig.rateLimits(validConfig);
    assert.ok(result.valid);

    const invalidConfig = {
      windowMs: -1, // Invalid
      max: 'not-a-number',
      message: ''
    };

    const invalidResult = validateSecurityConfig.rateLimits(invalidConfig);
    assert.ok(!invalidResult.valid);
  });

  await t.test('should validate CORS configuration', () => {
    const validCors = {
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    };

    const result = validateSecurityConfig.cors(validCors);
    assert.ok(result.valid);

    const invalidCors = {
      origin: 'invalid-origin-format',
      credentials: 'not-boolean',
      methods: 'not-array'
    };

    const invalidResult = validateSecurityConfig.cors(invalidCors);
    assert.ok(!invalidResult.valid);
  });
});