# Performance Testing Integration Guide

## NPM Scripts Integration

Add the following scripts to `package.json` for seamless performance testing
integration:

```json
{
  "scripts": {
    "test:performance": "node test/performance-tests/performance-test-runner.js",
    "test:performance:verbose": "node test/performance-tests/performance-test-runner.js --verbose",
    "test:performance:parallel": "node test/performance-tests/performance-test-runner.js --parallel",
    "test:performance:custom": "node test/performance-tests/performance-test-runner.js --output=./custom-perf-results",

    "test:perf:latency": "node -e \"const Test = require('./test/performance-tests/robot-control-latency.test.js'); new Test().run().then(r => console.log('Latency Tests:', r.success ? 'PASSED' : 'FAILED'))\"",
    "test:perf:realtime": "node -e \"const Test = require('./test/performance-tests/realtime-communication.test.js'); new Test().run().then(r => console.log('Realtime Tests:', r.success ? 'PASSED' : 'FAILED'))\"",
    "test:perf:load": "node -e \"const Test = require('./test/performance-tests/concurrent-user-load.test.js'); new Test().run().then(r => console.log('Load Tests:', r.success ? 'PASSED' : 'FAILED'))\"",
    "test:perf:gcode": "node -e \"const Test = require('./test/performance-tests/gcode-processing.test.js'); new Test().run().then(r => console.log('G-code Tests:', r.success ? 'PASSED' : 'FAILED'))\"",
    "test:perf:api": "node -e \"const Test = require('./test/performance-tests/api-response-time.test.js'); new Test().run().then(r => console.log('API Tests:', r.success ? 'PASSED' : 'FAILED'))\""
  }
}
```

## CI/CD Pipeline Integration

### GitHub Actions Example

```yaml
name: Performance Tests
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm install
          cd client && npm install

      - name: Build application
        run: npm run build

      - name: Run performance tests
        run: npm run test:performance:verbose

      - name: Upload performance reports
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: performance-reports
          path: test-results/performance/

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const path = './test-results/performance/executive-summary.md';
            if (fs.existsSync(path)) {
              const summary = fs.readFileSync(path, 'utf8');
              github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `## 📊 Performance Test Results\n\n${summary}`
              });
            }
```

## Docker Integration

### Performance Testing Container

```dockerfile
# Dockerfile.performance
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm install && cd client && npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create performance test script
RUN echo '#!/bin/sh' > /app/run-performance-tests.sh && \
    echo 'npm run test:performance:verbose' >> /app/run-performance-tests.sh && \
    chmod +x /app/run-performance-tests.sh

# Default command
CMD ["/app/run-performance-tests.sh"]
```

### Docker Compose for Performance Testing

```yaml
# docker-compose.perf.yml
version: '3.8'
services:
  performance-tests:
    build:
      context: .
      dockerfile: Dockerfile.performance
    volumes:
      - ./performance-results:/app/test-results/performance
    environment:
      - NODE_ENV=production
    command:
      node test/performance-tests/performance-test-runner.js
      --output=/app/test-results/performance --verbose

  performance-monitor:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    depends_on:
      - performance-tests
```

## Monitoring Integration

### Prometheus Metrics Endpoint

```javascript
// lib/performance-metrics.js
const client = require('prom-client');

const performanceMetrics = {
  robotLatency: new client.Histogram({
    name: 'robot_command_latency_seconds',
    help: 'Latency of robot commands in seconds',
    labelNames: ['command_type', 'axis'],
  }),

  apiResponseTime: new client.Histogram({
    name: 'api_response_time_seconds',
    help: 'API response time in seconds',
    labelNames: ['method', 'endpoint', 'status_code'],
  }),

  concurrentUsers: new client.Gauge({
    name: 'concurrent_users_active',
    help: 'Number of currently active concurrent users',
  }),

  gcodeProcessingRate: new client.Gauge({
    name: 'gcode_processing_lines_per_second',
    help: 'G-code processing rate in lines per second',
  }),
};

module.exports = performanceMetrics;
```

### Performance Alert Rules

```yaml
# alerts/performance-alerts.yml
groups:
  - name: robot_performance
    rules:
      - alert: HighRobotLatency
        expr: histogram_quantile(0.95, robot_command_latency_seconds) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: 'High robot command latency detected'
          description: '95th percentile robot command latency is {{ $value }}s'

      - alert: SlowApiResponse
        expr: histogram_quantile(0.95, api_response_time_seconds) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'API response time degradation'
          description: '95th percentile API response time is {{ $value }}s'

      - alert: LowGcodeProcessingRate
        expr: gcode_processing_lines_per_second < 500
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: 'G-code processing rate below threshold'
          description: 'G-code processing rate is {{ $value }} lines/second'
```

## Performance Testing Best Practices

### 1. Test Environment Setup

```bash
#!/bin/bash
# setup-performance-env.sh

echo "🔧 Setting up performance testing environment..."

# Ensure clean state
npm run docker:clean
docker system prune -f

# Build latest images
npm run docker:build

# Start services in performance mode
NODE_ENV=performance npm run docker:compose

# Wait for services to be ready
echo "⏳ Waiting for services to initialize..."
sleep 30

# Verify services are running
curl -f http://localhost:5000/api/health || exit 1
curl -f http://localhost:3000/ || exit 1

echo "✅ Performance testing environment ready!"
```

### 2. Automated Performance Regression Detection

```javascript
// scripts/performance-regression-check.js
const fs = require('fs');
const path = require('path');

class PerformanceRegressionChecker {
  constructor() {
    this.baselineFile = 'performance-baseline.json';
    this.thresholdPercent = 20; // 20% degradation threshold
  }

  async checkRegression(currentResults) {
    const baseline = this.loadBaseline();
    if (!baseline) {
      console.log('📊 No baseline found, saving current results as baseline');
      this.saveBaseline(currentResults);
      return { hasRegression: false, message: 'Baseline established' };
    }

    const regressions = this.compareResults(baseline, currentResults);

    if (regressions.length > 0) {
      console.log('⚠️  Performance regressions detected:');
      regressions.forEach(regression => {
        console.log(
          `   ${regression.test}: ${regression.degradation.toFixed(1)}% slower`
        );
      });
      return { hasRegression: true, regressions };
    }

    console.log('✅ No performance regressions detected');
    return { hasRegression: false, message: 'Performance maintained' };
  }
}
```

### 3. Performance Dashboard Integration

```html
<!-- monitoring/performance-dashboard.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>Arctos Robot Controller - Performance Dashboard</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
      .dashboard {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding: 20px;
      }
      .metric-card {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
      }
      .status-good {
        background-color: #d4edda;
      }
      .status-warning {
        background-color: #fff3cd;
      }
      .status-critical {
        background-color: #f8d7da;
      }
    </style>
  </head>
  <body>
    <h1>🤖 Robot Performance Dashboard</h1>

    <div class="dashboard">
      <div class="metric-card" id="latency-metrics">
        <h3>⚡ Robot Control Latency</h3>
        <div id="latency-chart"></div>
      </div>

      <div class="metric-card" id="throughput-metrics">
        <h3>🚀 System Throughput</h3>
        <div id="throughput-chart"></div>
      </div>

      <div class="metric-card" id="users-metrics">
        <h3>👥 Concurrent Users</h3>
        <div id="users-chart"></div>
      </div>

      <div class="metric-card" id="resource-metrics">
        <h3>🧠 Resource Usage</h3>
        <div id="resource-chart"></div>
      </div>
    </div>

    <script>
      // Real-time performance metrics visualization
      function updateDashboard() {
        fetch('/api/performance/metrics')
          .then(response => response.json())
          .then(data => {
            updateLatencyChart(data.latency);
            updateThroughputChart(data.throughput);
            updateUsersChart(data.users);
            updateResourceChart(data.resources);
          });
      }

      // Update every 5 seconds
      setInterval(updateDashboard, 5000);
      updateDashboard(); // Initial load
    </script>
  </body>
</html>
```

## Usage Examples

### Quick Performance Check

```bash
# Run all performance tests
npm run test:performance

# Run specific test category
npm run test:perf:latency

# Run with verbose output
npm run test:performance:verbose
```

### Continuous Monitoring

```bash
# Set up performance monitoring
docker-compose -f docker-compose.perf.yml up -d

# View real-time performance dashboard
open http://localhost:3000/performance-dashboard

# Check Prometheus metrics
open http://localhost:9090
```

### Performance Debugging

```bash
# Run performance tests with detailed debugging
DEBUG=performance* npm run test:performance:verbose

# Generate performance flame graphs
npm run test:performance -- --profile

# Analyze memory usage
npm run test:performance -- --memory-analysis
```

This integration guide ensures that performance testing becomes a seamless part
of the development workflow, providing continuous performance validation and
early detection of performance regressions.
