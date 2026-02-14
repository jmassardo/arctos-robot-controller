# End-to-End Test Engineer - Execution Guide

## 🚀 Quick Start Guide

### Prerequisites

```bash
# Ensure Node.js 16+ is installed
node --version

# Install project dependencies
npm install
cd client && npm install && cd ..

# Install Playwright browsers (only needed once)
npx playwright install
```

### Run Complete E2E Test Suite

```bash
# Run all E2E tests with comprehensive runner
npm run test:e2e

# Alternative: Run with Playwright directly
npm run test:e2e:playwright
```

## 🧪 Individual Test Suite Execution

### Core Test Suites

```bash
# Authentication & Session Management
npm run test:e2e:auth

# Robot Control Workflows
npm run test:e2e:control

# Real-time Multi-user Communication
npm run test:e2e:realtime

# Cross-platform & Mobile Testing
npm run test:e2e:mobile

# Error Recovery & Edge Cases
npm run test:e2e:errors

# Security & Authorization
npm run test:e2e:security
```

### Browser-Specific Testing

```bash
# Test on specific browsers
npm run test:e2e:chrome
npm run test:e2e:firefox
npm run test:e2e:safari
```

## 🔍 Debugging & Development

### Interactive Testing

```bash
# Run tests with browser visible
npm run test:e2e:headed

# Debug tests step-by-step
npm run test:e2e:debug

# Use Playwright UI for test development
npm run test:e2e:ui
```

### Test Development Workflow

1. **Write Test**: Create test in appropriate spec file
2. **Debug**: Use `npm run test:e2e:debug` for step-through
3. **Validate**: Run specific test suite
4. **Cross-Browser**: Test on all target browsers
5. **Integration**: Run full suite before commit

## 📊 Reports & Results

### Generated Reports

- **HTML Report**: `playwright-report/index.html` - Visual test results
- **JSON Results**: `test-results/e2e/results.json` - Machine-readable data
- **JUnit XML**: `test-results/e2e/junit.xml` - CI/CD integration
- **Test Summary**: `test-results/e2e/test-summary.json` - Executive summary

### Viewing Reports

```bash
# Open HTML report
npx playwright show-report

# View in browser
open playwright-report/index.html
```

## ⚙️ Configuration

### Environment Variables

```bash
# Test URLs
export BASE_URL=http://localhost:3000
export API_URL=http://localhost:3001

# Test behavior
export E2E_PARALLEL=true
export E2E_CLEANUP_USERS=false
export E2E_SKIP_SERVER_START=false
export E2E_WARMUP_BROWSERS=true

# CI/CD specific
export CI=true
export NODE_ENV=test
```

### Custom Configuration

Edit `playwright.config.ts` for:

- Browser selection
- Test timeouts
- Retry logic
- Parallel execution
- Mobile device simulation

## 🚨 Troubleshooting

### Common Issues

**Tests fail with "Connection refused"**

```bash
# Ensure both servers are running
npm start &
cd client && npm start &

# Or use the comprehensive runner
npm run test:e2e
```

**Browser installation issues**

```bash
# Reinstall browsers
npx playwright install

# Check browser status
npx playwright doctor
```

**Timing issues / Flaky tests**

```bash
# Increase timeouts in playwright.config.ts
timeout: 60000,
expect: { timeout: 15000 }

# Run with retries
npx playwright test --retries=3
```

**Mobile tests not running**

```bash
# Ensure mobile projects are configured
npx playwright test --project=mobile-chrome
```

### Debug Mode

```bash
# Run single test with debugging
npx playwright test auth-workflows.spec.ts --debug

# Generate trace files
npx playwright test --trace=on

# Record video of failures
npx playwright test --video=retain-on-failure
```

## 🏗️ CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          npm ci
          cd client && npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
          NODE_ENV: test

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-results
          path: |
            playwright-report/
            test-results/e2e/
```

### Quality Gates

- **Minimum Pass Rate**: 95%
- **Performance Thresholds**: Load < 3s, Interaction < 500ms
- **Browser Coverage**: Chrome, Firefox, Safari must pass
- **Security Tests**: 100% security tests must pass

## 📈 Performance Considerations

### Parallel Execution

- **Desktop**: 4-6 workers recommended
- **CI**: 2-3 workers to avoid resource conflicts
- **Mobile**: Sequential execution recommended

### Resource Management

- **Memory**: Monitor with large G-Code files
- **Network**: Test with throttled connections
- **Storage**: Clean up test data regularly

### Test Data Management

- **Isolation**: Each test should be independent
- **Cleanup**: Automatic cleanup after test runs
- **Persistence**: Preserve data for debugging

## 🎯 Best Practices

### Writing Tests

- Use semantic `data-testid` attributes
- Implement proper wait strategies (not `sleep()`)
- Write readable test descriptions
- Group related tests in suites
- Mock external dependencies when possible

### Maintenance

- Regular browser updates
- Monitor test execution times
- Review and update selectors
- Maintain test data factories
- Update documentation

### Code Quality

- Follow consistent naming conventions
- Extract common utilities
- Implement page object patterns
- Use TypeScript for better IDE support
- Add JSDoc comments for complex logic

## 🔐 Security Testing

### Authentication Testing

- Session management validation
- Role-based access control
- Token expiration handling
- Multi-user session conflicts

### Input Validation

- XSS prevention testing
- SQL injection prevention
- File upload security
- Command injection prevention

### Data Protection

- Sensitive data masking
- Audit trail integrity
- CSP header enforcement
- HTTPS requirement validation

---

## 📞 Support & Resources

- **Playwright Documentation**: https://playwright.dev/
- **Test Results**: Check `test-results/e2e/` directory
- **Visual Reports**: Open `playwright-report/index.html`
- **Debug Logs**: Available in test output and report files

This comprehensive E2E testing framework ensures the Arctos Robot Controller
meets the highest standards of quality and reliability across all platforms and
user scenarios.
