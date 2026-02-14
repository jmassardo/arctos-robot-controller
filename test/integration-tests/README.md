# Integration Test Documentation

## Overview

The Arctos Robot Controller integration test suite provides comprehensive
testing of component interactions, API integrations, database operations, and
data flow between systems. These tests ensure that all integrated components
work together correctly in realistic scenarios.

## Test Architecture

### Test Suites

1. **API Contract Tests** (`api-contracts/`)
   - REST API endpoint validation
   - Request/response schema testing
   - Authentication and authorization flows
   - Error handling verification
   - Rate limiting enforcement

2. **Database Integration Tests** (`database-integration/`)
   - CRUD operations through data access layers
   - Transaction integrity and rollback scenarios
   - Data consistency across related tables
   - Connection pooling and timeout scenarios
   - Backup and restore procedures

3. **Socket.IO Integration Tests** (`socket-integration/`)
   - Real-time WebSocket communication
   - Event broadcasting to multiple clients
   - Authentication over WebSocket connections
   - Error handling and reconnection scenarios
   - Performance under concurrent connections

4. **Authentication Flow Tests** (`auth-flow/`)
   - Complete user registration and login workflows
   - JWT token lifecycle management
   - Two-factor authentication (2FA) setup and verification
   - Password change and session management
   - Role-based access control (RBAC)

5. **Hardware Integration Tests** (`hardware-integration/`)
   - MKS42D controller communication
   - MKS57D servo manager operations
   - G-code translation and execution
   - CAN bus, Serial, and RS485 protocols
   - Hardware safety limits and emergency stop

## Running Integration Tests

### Prerequisites

1. **Install Dependencies**:

   ```bash
   npm install
   cd client && npm install
   ```

2. **Environment Setup**:
   - Tests run in isolated test environment
   - Test database and configuration files are automatically created
   - No production data is affected

### Basic Usage

```bash
# Run all integration tests sequentially
npm run test:integration

# Run tests in parallel (faster but more resource intensive)
npm run test:integration:parallel

# Run with verbose output
npm run test:integration:verbose

# Run specific test suite
node test/integration-tests/integration-test-runner.js --suite=api-contracts

# Run tests with custom timeout (in seconds)
npm run test:integration -- --timeout=600
```

### Advanced Options

```bash
# Run integration tests with custom configuration
node test/integration-tests/integration-test-runner.js [options]

Options:
  --parallel          Run test suites in parallel
  --verbose           Show detailed test output
  --no-report         Skip report generation
  --retry             Retry failed tests once
  --timeout=300       Set timeout in seconds (default: 300)
  --suite=name        Run specific test suite only
```

## Test Configuration

### Environment Variables

```bash
# Test database configuration
TEST_DB_PATH=/path/to/test/database.db
TEST_CONFIG_DIR=/path/to/test/config
TEST_DATA_DIR=/path/to/test/data

# Server configuration for tests
TEST_PORT=5001
TEST_HOST=localhost
JWT_SECRET=test-jwt-secret

# Hardware simulation settings
HARDWARE_SIMULATION_MODE=true
CAN_MOCK_INTERFACE=test-can0
```

### Test Data Management

Tests use isolated test data that is automatically:

- Created before each test suite
- Cleaned up after each test
- Stored in temporary directories
- Never affects production data

## Writing Integration Tests

### Test Structure

```javascript
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  getTestHelper,
} = require('../integration-test-helpers');

describe('Your Integration Test Suite', () => {
  let helper;
  let authenticatedUser;

  before(async () => {
    helper = await setupIntegrationTestEnvironment();
    authenticatedUser = await helper.registerAndLoginUser('operator');
  });

  after(async () => {
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await helper.cleanupTestData();
    await helper.setupTestRobotConfig();
  });

  it('should test specific integration scenario', async () => {
    const client = helper.createAuthenticatedRequest('operator');

    const response = await client
      .post('/api/endpoint')
      .send({ data: 'test' })
      .expect(200);

    const data = helper.assertApiResponse(response);
    assert.strictEqual(data.success, true);
  });
});
```

### Helper Methods

The `IntegrationTestHelper` provides utilities for:

```javascript
// HTTP client management
const client = helper.createHttpClient();
const authClient = helper.createAuthenticatedRequest('admin');

// Socket.IO testing
const socket = helper.createAuthenticatedSocket('operator');
await helper.waitForSocketConnection(socket);
const eventData = await helper.waitForSocketEvent(socket, 'eventName');

// User management
const userData = await helper.registerAndLoginUser('admin');
const authData = helper.getAuthenticatedClient('operator');

// Test data setup
await helper.setupTestRobotConfig();
await helper.setupTestPositions(10);
const testData = await helper.createTestDataBatch('positions', 5);

// Assertions and validation
helper.assertApiResponse(response, 200);
helper.assertSocketEvent(eventData, ['field1', 'field2']);

// Performance testing
const { response, responseTime } =
  await helper.measureApiResponseTime(requestFunc);
const results = await helper.generateConcurrentRequests(requestFunc, 10);
```

## Test Reports

Integration tests generate comprehensive reports:

### JSON Report

- **Location**: `test/test-results/integration/integration-test-results.json`
- **Content**: Detailed test results with metadata
- **Usage**: CI/CD integration and automated analysis

### HTML Report

- **Location**: `test/test-results/integration/integration-test-report.html`
- **Content**: Visual dashboard with charts and detailed results
- **Usage**: Human-readable test results review

### Text Summary

- **Location**: `test/test-results/integration/integration-test-summary.txt`
- **Content**: Concise text summary of results
- **Usage**: Console logs and email reports

## Test Scenarios

### API Integration Testing

```javascript
// Test complete API workflow
it('should complete position creation workflow', async () => {
  const client = helper.createAuthenticatedRequest('operator');

  // 1. Create position
  const createResponse = await client
    .post('/api/positions')
    .send(positionData)
    .expect(200);

  // 2. Verify position exists
  const listResponse = await client.get('/api/positions').expect(200);

  // 3. Execute position replay
  const replayResponse = await client
    .post(`/api/replay/${positionId}`)
    .send({})
    .expect(200);

  // 4. Verify completion
  assert(replayResponse.body.success);
});
```

### Database Integration Testing

```javascript
// Test transaction rollback
it('should rollback failed transactions', async () => {
  const transaction = await dbManager.beginTransaction();

  try {
    await dbManager.createUser(userData, { transaction });
    await dbManager.createUser(duplicateUser, { transaction }); // Should fail
    await transaction.commit();
    assert.fail('Should not reach this point');
  } catch (error) {
    await transaction.rollback();

    // Verify rollback
    const users = await dbManager.searchUsers({ username: userData.username });
    assert.strictEqual(users.length, 0);
  }
});
```

### Real-time Communication Testing

```javascript
// Test Socket.IO broadcasting
it('should broadcast position updates to all clients', async () => {
  const [adminSocket, operatorSocket] = await Promise.all([
    helper.createAuthenticatedSocket('admin'),
    helper.createAuthenticatedSocket('operator'),
  ]);

  const [adminPromise, operatorPromise] = [
    helper.waitForSocketEvent(adminSocket, 'positionUpdate'),
    helper.waitForSocketEvent(operatorSocket, 'positionUpdate'),
  ];

  // Trigger update via API
  await client.post('/api/manual/move').send(moveData).expect(200);

  // Both clients should receive the update
  const [adminData, operatorData] = await Promise.all([
    adminPromise,
    operatorPromise,
  ]);

  assert.deepStrictEqual(adminData.position, operatorData.position);
});
```

## Performance Testing

Integration tests include performance validation:

```javascript
// Response time validation
const { response, responseTime } = await helper.measureApiResponseTime(() =>
  client.get('/api/positions').expect(200)
);

assert(responseTime < TEST_CONFIG.performance.apiResponseTime);

// Concurrent request testing
const results = await helper.generateConcurrentRequests(
  () => client.post('/api/manual/move').send(moveData).expect(200),
  10 // 10 concurrent requests
);

assert.strictEqual(results.successful, 10);
```

## Debugging Integration Tests

### Verbose Mode

```bash
npm run test:integration:verbose
```

### Individual Test Suite

```bash
node test/integration-tests/api-contracts/api-contract-tests.js
```

### Debug Output

```bash
DEBUG=integration:* npm run test:integration
```

### Test Server Logs

Test server logs are available in:

- `test/test-data/logs/test-server.log`
- Console output with `--verbose` flag

## Continuous Integration

### GitHub Actions Integration

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - run: npm ci
      - run: cd client && npm ci

      - name: Run Integration Tests
        run: npm run test:integration
        timeout-minutes: 15

      - name: Upload Test Reports
        uses: actions/upload-artifact@v2
        if: always()
        with:
          name: integration-test-reports
          path: test/test-results/integration/
```

### Test Quality Gates

Integration tests enforce quality gates:

- **95%+ Success Rate**: All critical paths must pass
- **Response Time Limits**: APIs must respond within thresholds
- **Error Handling**: All error scenarios must be handled gracefully
- **Security Validation**: Authentication and authorization must work correctly

## Troubleshooting

### Common Issues

1. **Port Conflicts**

   ```bash
   Error: listen EADDRINUSE :::5001
   ```

   **Solution**: Change TEST_PORT or kill conflicting processes

2. **Database Lock Errors**

   ```bash
   Error: database is locked
   ```

   **Solution**: Ensure proper cleanup between tests

3. **Socket Connection Timeouts**

   ```bash
   Error: Socket connection timeout
   ```

   **Solution**: Increase timeout or check server startup

4. **Permission Errors**
   ```bash
   Error: EACCES: permission denied
   ```
   **Solution**: Check file permissions in test directories

### Debug Steps

1. **Check Test Environment**:

   ```bash
   ls -la test/test-data/
   ps aux | grep node
   ```

2. **Verify Dependencies**:

   ```bash
   npm ls --depth=0
   cd client && npm ls --depth=0
   ```

3. **Run Single Test**:

   ```bash
   node --test test/integration-tests/api-contracts/api-contract-tests.js
   ```

4. **Check Server Logs**:
   ```bash
   tail -f test/test-data/logs/integration-test.log
   ```

## Contributing

When adding new integration tests:

1. **Follow Naming Conventions**:
   - Test files: `*-integration-tests.js`
   - Test suites: `describe('Component Integration Tests')`
   - Test cases: `it('should test specific integration scenario')`

2. **Use Test Helpers**:
   - Leverage existing helper methods
   - Add new helpers for common patterns
   - Ensure proper cleanup

3. **Add Documentation**:
   - Document new test scenarios
   - Update this README for new features
   - Include examples in code comments

4. **Performance Considerations**:
   - Keep tests focused and fast
   - Use appropriate timeouts
   - Clean up resources properly

5. **Error Handling**:
   - Test both success and failure paths
   - Validate error messages and codes
   - Ensure graceful degradation

## Test Coverage

Integration tests cover:

- ✅ All REST API endpoints
- ✅ Database operations and transactions
- ✅ Real-time WebSocket communication
- ✅ Complete authentication workflows
- ✅ Hardware communication protocols
- ✅ Error handling and recovery
- ✅ Performance under load
- ✅ Security and validation
- ✅ Configuration management
- ✅ Data consistency and integrity

For detailed coverage reports, see:

- `test/test-results/integration/integration-test-report.html`
- `test/test-results/integration/integration-test-results.json`
