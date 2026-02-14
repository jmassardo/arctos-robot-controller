#!/usr/bin/env node

/**
 * Manual Security Testing Suite
 * Arctos Robot Controller - Security Test Engineer Implementation
 *
 * Performs comprehensive security testing without external dependencies
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityTester {
  constructor(baseUrl = 'http://localhost:5001') {
    this.baseUrl = baseUrl;
    this.testResults = [];
    this.vulnerabilities = [];
    this.sessionToken = null;
  }

  // Helper method to make HTTP requests
  makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SecurityTester/1.0',
          ...headers,
        },
      };

      if (this.sessionToken) {
        options.headers['Authorization'] = `Bearer ${this.sessionToken}`;
      }

      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
            data: this.tryParseJSON(body),
          });
        });
      });

      req.on('error', err => {
        reject(err);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  tryParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return str;
    }
  }

  recordTest(testName, passed, details) {
    const result = {
      test: testName,
      passed,
      details,
      timestamp: new Date().toISOString(),
    };
    this.testResults.push(result);

    if (!passed) {
      this.vulnerabilities.push({
        test: testName,
        severity: details.severity || 'medium',
        description: details.description || 'Test failed',
        ...details,
      });
    }

    console.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? 'PASS' : 'FAIL'}`);
    if (details.message) {
      console.log(`   ${details.message}`);
    }
  }

  // OWASP Top 10 Testing

  async testAuthentication() {
    console.log('\n🔐 Testing Authentication Security...');

    try {
      // Test 1: Default admin credentials
      const loginResponse = await this.makeRequest('POST', '/auth/login', {
        username: 'admin',
        password: 'admin123!',
      });

      this.recordTest(
        'Default Admin Login',
        loginResponse.statusCode === 200 && loginResponse.data?.success,
        {
          message: 'Default admin credentials work - SECURITY RISK',
          severity: 'medium',
          recommendation: 'Force password change on first login',
        }
      );

      if (loginResponse.data?.accessToken) {
        this.sessionToken = loginResponse.data.accessToken;
      }

      // Test 2: Brute force protection
      console.log('   Testing brute force protection...');
      const attempts = [];
      for (let i = 0; i < 7; i++) {
        const attempt = await this.makeRequest('POST', '/auth/login', {
          username: 'admin',
          password: 'wrongpassword' + i,
        });
        attempts.push(attempt.statusCode);
      }

      const lockoutTriggered = attempts.slice(-2).every(code => code === 429);
      this.recordTest('Brute Force Protection', lockoutTriggered, {
        message: `Account lockout ${lockoutTriggered ? 'active' : 'not detected'}`,
        severity: lockoutTriggered ? 'low' : 'high',
      });
    } catch (error) {
      this.recordTest('Authentication Tests', false, {
        message: `Error testing authentication: ${error.message}`,
        severity: 'high',
      });
    }
  }

  async testAuthorizationBypass() {
    console.log('\n🛡️  Testing Authorization Controls...');

    try {
      // Test protected endpoints without authentication
      const protectedEndpoints = ['/api/config', '/api/positions', '/api/robot/move', '/api/users'];

      for (const endpoint of protectedEndpoints) {
        const response = await this.makeRequest('GET', endpoint, null, {
          Authorization: '', // Remove auth header
        });

        const properlyProtected = response.statusCode === 401 || response.statusCode === 403;
        this.recordTest(`Authorization Check: ${endpoint}`, properlyProtected, {
          message: `Endpoint ${properlyProtected ? 'properly protected' : 'exposed without auth'}`,
          severity: properlyProtected ? 'low' : 'high',
        });
      }

      // Test role-based access control
      if (this.sessionToken) {
        const adminOnlyResponse = await this.makeRequest('GET', '/api/users');
        this.recordTest('Admin Role Access', adminOnlyResponse.statusCode === 200, {
          message: 'Admin access to user management',
          severity: 'low',
        });
      }
    } catch (error) {
      this.recordTest('Authorization Tests', false, {
        message: `Error testing authorization: ${error.message}`,
        severity: 'high',
      });
    }
  }

  async testInputValidation() {
    console.log('\n💉 Testing Input Validation & Injection...');

    try {
      // SQL Injection attempts
      const sqlPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
      ];

      for (const payload of sqlPayloads) {
        const response = await this.makeRequest('POST', '/auth/login', {
          username: payload,
          password: 'test',
        });

        const blocked = response.statusCode >= 400;
        this.recordTest(`SQL Injection Protection: ${payload.substring(0, 10)}...`, blocked, {
          message: `SQL injection attempt ${blocked ? 'blocked' : 'processed'}`,
          severity: blocked ? 'low' : 'critical',
        });
      }

      // XSS attempts
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
      ];

      if (this.sessionToken) {
        for (const payload of xssPayloads) {
          const response = await this.makeRequest('POST', '/api/positions', {
            name: payload,
            position: { x: 0, y: 0, z: 0 },
          });

          // Check if XSS payload was sanitized
          if (response.statusCode === 200) {
            const getResponse = await this.makeRequest('GET', '/api/positions');
            const positions = getResponse.data || [];
            const hasUnsafeScript = positions.some(
              p => (p.name && p.name.includes('<script>')) || p.name.includes('javascript:')
            );

            this.recordTest(`XSS Protection: ${payload.substring(0, 15)}...`, !hasUnsafeScript, {
              message: `XSS payload ${hasUnsafeScript ? 'not sanitized' : 'properly sanitized'}`,
              severity: hasUnsafeScript ? 'high' : 'low',
            });
          }
        }
      }

      // Command injection attempts
      const cmdPayloads = ['; ls -la', '| cat /etc/passwd', '&& rm -rf /'];

      for (const payload of cmdPayloads) {
        const response = await this.makeRequest('POST', '/api/config', {
          robotType: payload,
          communication: 'serial',
        });

        const blocked = response.statusCode >= 400;
        this.recordTest(`Command Injection Protection: ${payload}`, blocked, {
          message: `Command injection attempt ${blocked ? 'blocked' : 'processed'}`,
          severity: blocked ? 'low' : 'high',
        });
      }
    } catch (error) {
      this.recordTest('Input Validation Tests', false, {
        message: `Error testing input validation: ${error.message}`,
        severity: 'high',
      });
    }
  }

  async testSecurityHeaders() {
    console.log('\n🔒 Testing Security Headers...');

    try {
      const response = await this.makeRequest('GET', '/');
      const headers = response.headers;

      const securityHeaders = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': ['DENY', 'SAMEORIGIN'],
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': true,
        'content-security-policy': true,
      };

      for (const [header, expectedValue] of Object.entries(securityHeaders)) {
        const headerValue = headers[header];
        let passed = false;

        if (Array.isArray(expectedValue)) {
          passed = expectedValue.some(val => headerValue?.includes(val));
        } else if (typeof expectedValue === 'boolean') {
          passed = !!headerValue;
        } else {
          passed = headerValue === expectedValue;
        }

        this.recordTest(`Security Header: ${header}`, passed, {
          message: `Header ${passed ? 'present' : 'missing'}: ${headerValue || 'none'}`,
          severity: passed ? 'low' : 'medium',
        });
      }
    } catch (error) {
      this.recordTest('Security Headers Test', false, {
        message: `Error testing security headers: ${error.message}`,
        severity: 'medium',
      });
    }
  }

  async testRateLimiting() {
    console.log('\n⚡ Testing Rate Limiting...');

    try {
      // Test rate limiting on auth endpoints
      const requests = [];
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        requests.push(
          this.makeRequest('POST', '/auth/login', {
            username: 'test',
            password: 'test',
          })
        );
      }

      const responses = await Promise.all(requests.map(p => p.catch(e => ({ error: e }))));
      const rateLimited = responses.some(r => r.statusCode === 429);
      const duration = Date.now() - startTime;

      this.recordTest('Rate Limiting', rateLimited, {
        message: `Rate limiting ${rateLimited ? 'active' : 'not detected'} (${duration}ms for 20 requests)`,
        severity: rateLimited ? 'low' : 'medium',
      });
    } catch (error) {
      this.recordTest('Rate Limiting Test', false, {
        message: `Error testing rate limiting: ${error.message}`,
        severity: 'medium',
      });
    }
  }

  async testSessionManagement() {
    console.log('\n🔑 Testing Session Management...');

    try {
      if (!this.sessionToken) {
        this.recordTest('Session Management', false, {
          message: 'No session token available for testing',
          severity: 'high',
        });
        return;
      }

      // Test token validation
      const validTokenResponse = await this.makeRequest('GET', '/api/config');
      this.recordTest('Valid Token Access', validTokenResponse.statusCode === 200, {
        message: 'Valid JWT token provides access',
        severity: 'low',
      });

      // Test invalid token
      const invalidTokenResponse = await this.makeRequest('GET', '/api/config', null, {
        Authorization: 'Bearer invalid_token_here',
      });

      this.recordTest(
        'Invalid Token Rejection',
        invalidTokenResponse.statusCode === 401 || invalidTokenResponse.statusCode === 403,
        {
          message: `Invalid tokens ${invalidTokenResponse.statusCode >= 400 ? 'properly rejected' : 'accepted'}`,
          severity: invalidTokenResponse.statusCode >= 400 ? 'low' : 'high',
        }
      );
    } catch (error) {
      this.recordTest('Session Management Test', false, {
        message: `Error testing session management: ${error.message}`,
        severity: 'high',
      });
    }
  }

  async testRobotControlSecurity() {
    console.log('\n🤖 Testing Robot Control Security...');

    try {
      if (!this.sessionToken) {
        console.log('   Skipping robot control tests - no authentication');
        return;
      }

      // Test emergency stop security
      const emergencyResponse = await this.makeRequest('POST', '/api/robot/emergency-stop', {
        reason: 'Security test',
      });

      this.recordTest('Emergency Stop Access', emergencyResponse.statusCode === 200, {
        message: 'Emergency stop accessible to authenticated users',
        severity: 'medium',
        recommendation: 'Consider additional authentication for emergency stop',
      });

      // Test robot movement limits
      const extremeMovementResponse = await this.makeRequest('POST', '/api/robot/move', {
        x: 999999,
        y: 999999,
        z: 999999,
      });

      const limitsEnforced = extremeMovementResponse.statusCode >= 400;
      this.recordTest('Movement Limit Enforcement', limitsEnforced, {
        message: `Extreme movement values ${limitsEnforced ? 'rejected' : 'accepted'}`,
        severity: limitsEnforced ? 'low' : 'high',
      });

      // Test G-code validation
      const maliciousGcode = `
        G1 X999999 Y999999 Z999999
        M104 S999
        G28
      `;

      const gcodeResponse = await this.makeRequest('POST', '/api/gcode/execute', {
        gcode: maliciousGcode,
      });

      const gcodeValidated = gcodeResponse.statusCode >= 400;
      this.recordTest('G-code Validation', gcodeValidated, {
        message: `Potentially dangerous G-code ${gcodeValidated ? 'rejected' : 'accepted'}`,
        severity: gcodeValidated ? 'low' : 'high',
      });
    } catch (error) {
      this.recordTest('Robot Control Security Test', false, {
        message: `Error testing robot control security: ${error.message}`,
        severity: 'high',
      });
    }
  }

  async testFileSystemSecurity() {
    console.log('\n📁 Testing File System Security...');

    try {
      // Test path traversal in file operations
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
      ];

      for (const payload of pathTraversalPayloads) {
        // This would test file upload/download if implemented
        // For now, test if path traversal is handled in config loading
        const response = await this.makeRequest('GET', '/api/config', null, {
          'X-Config-Path': payload,
        });

        const blocked = !response.body.includes('root:') && !response.body.includes('password');
        this.recordTest(`Path Traversal Protection: ${payload}`, blocked, {
          message: `Path traversal attempt ${blocked ? 'blocked' : 'may have succeeded'}`,
          severity: blocked ? 'low' : 'critical',
        });
      }
    } catch (error) {
      this.recordTest('File System Security Test', false, {
        message: `Error testing file system security: ${error.message}`,
        severity: 'medium',
      });
    }
  }

  async runAllTests() {
    console.log('🔒 ARCTOS ROBOT CONTROLLER - SECURITY TEST SUITE');
    console.log('================================================================================');
    console.log(`🎯 Target: ${this.baseUrl}`);
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log(
      '================================================================================\n'
    );

    const testSuites = [
      'testAuthentication',
      'testAuthorizationBypass',
      'testInputValidation',
      'testSecurityHeaders',
      'testRateLimiting',
      'testSessionManagement',
      'testRobotControlSecurity',
      'testFileSystemSecurity',
    ];

    for (const testSuite of testSuites) {
      try {
        await this[testSuite]();
      } catch (error) {
        console.error(`❌ Error running ${testSuite}: ${error.message}`);
      }
    }

    this.generateReport();
  }

  generateReport() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;

    const criticalVulns = this.vulnerabilities.filter(v => v.severity === 'critical').length;
    const highVulns = this.vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumVulns = this.vulnerabilities.filter(v => v.severity === 'medium').length;
    const lowVulns = this.vulnerabilities.filter(v => v.severity === 'low').length;

    console.log(
      '\n================================================================================'
    );
    console.log('🏁 SECURITY TEST RESULTS');
    console.log('================================================================================');
    console.log(
      `📊 Tests: ${passedTests}/${totalTests} passed (${Math.round((passedTests / totalTests) * 100)}%)`
    );
    console.log(`🚨 Vulnerabilities: ${this.vulnerabilities.length} total`);
    console.log(`   💀 Critical: ${criticalVulns}`);
    console.log(`   🔴 High: ${highVulns}`);
    console.log(`   🟡 Medium: ${mediumVulns}`);
    console.log(`   🟢 Low: ${lowVulns}`);

    let securityScore = Math.max(
      0,
      100 - (criticalVulns * 40 + highVulns * 20 + mediumVulns * 10 + lowVulns * 5)
    );
    let riskLevel = securityScore >= 80 ? 'LOW' : securityScore >= 60 ? 'MEDIUM' : 'HIGH';

    console.log(`🎯 Security Score: ${securityScore}/100`);
    console.log(`⚠️  Risk Level: ${riskLevel}`);
    console.log(`⏱️  Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`);
    console.log('================================================================================');

    if (this.vulnerabilities.length > 0) {
      console.log('\n🚨 VULNERABILITIES FOUND:');
      this.vulnerabilities.forEach((vuln, i) => {
        const severity = vuln.severity.toUpperCase();
        const icon =
          severity === 'CRITICAL'
            ? '💀'
            : severity === 'HIGH'
              ? '🔴'
              : severity === 'MEDIUM'
                ? '🟡'
                : '🟢';
        console.log(`${i + 1}. ${icon} ${severity}: ${vuln.test}`);
        if (vuln.description) {
          console.log(`   ${vuln.description}`);
        }
        if (vuln.recommendation) {
          console.log(`   Recommendation: ${vuln.recommendation}`);
        }
      });
    }

    // Save detailed report
    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests,
        securityScore,
        riskLevel,
        vulnerabilities: {
          total: this.vulnerabilities.length,
          critical: criticalVulns,
          high: highVulns,
          medium: mediumVulns,
          low: lowVulns,
        },
      },
      testResults: this.testResults,
      vulnerabilities: this.vulnerabilities,
      timestamp: new Date().toISOString(),
      target: this.baseUrl,
    };

    const reportPath = path.join(__dirname, 'security-test-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📋 Detailed report saved to: ${reportPath}`);
  }
}

// Run the security tests
if (require.main === module) {
  const tester = new SecurityTester();
  tester.startTime = Date.now();

  tester.runAllTests().catch(error => {
    console.error('❌ Security testing failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityTester;
