const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');

// Test the health endpoint specifically for Docker
test('Health endpoint responds correctly', async t => {
  // Skip if we can't test HTTP endpoints
  if (process.env.SKIP_HTTP_TESTS) {
    t.skip('HTTP tests disabled');
    return;
  }

  // This test assumes the server is running or we can start it temporarily
  const healthUrl = process.env.TEST_SERVER_URL || 'http://localhost:5000';

  try {
    const response = await makeHttpRequest(`${healthUrl}/api/health`);
    const data = JSON.parse(response);

    assert.ok(data.status, 'Health response should include status');
    assert.strictEqual(data.status, 'healthy', 'Status should be "healthy"');
    assert.ok(data.timestamp, 'Health response should include timestamp');
    assert.ok(data.version, 'Health response should include version');
    assert.ok(typeof data.uptime === 'number', 'Health response should include uptime as number');
    assert.ok(data.environment, 'Health response should include environment');
    assert.ok(data.memory, 'Health response should include memory usage');

    // Check memory object structure
    assert.ok(typeof data.memory.rss === 'number', 'Memory should include RSS');
    assert.ok(typeof data.memory.heapUsed === 'number', 'Memory should include heap used');
    assert.ok(typeof data.memory.heapTotal === 'number', 'Memory should include heap total');
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      t.skip('Server not running for HTTP tests');
      return;
    }
    throw error;
  }
});

test('Health endpoint is unauthenticated', async t => {
  if (process.env.SKIP_HTTP_TESTS) {
    t.skip('HTTP tests disabled');
    return;
  }

  const healthUrl = process.env.TEST_SERVER_URL || 'http://localhost:5000';

  try {
    // Health endpoint should work without authentication
    const response = await makeHttpRequest(`${healthUrl}/api/health`, {
      headers: {}, // No auth headers
    });

    const data = JSON.parse(response);
    assert.strictEqual(data.status, 'healthy', 'Health endpoint should work without auth');
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      t.skip('Server not running for HTTP tests');
      return;
    }
    throw error;
  }
});

// Test Docker build process (if Docker is available)
test('Docker build process validation', async t => {
  if (process.env.SKIP_DOCKER_TESTS || !(await isDockerAvailable())) {
    t.skip('Docker not available or Docker tests disabled');
    return;
  }

  // Test building the production Dockerfile
  const buildProcess = spawn('docker', ['build', '-t', 'arctos-test:latest', '.'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';

  buildProcess.stdout.on('data', data => {
    stdout += data.toString();
  });

  buildProcess.stderr.on('data', data => {
    stderr += data.toString();
  });

  const exitCode = await new Promise(resolve => {
    buildProcess.on('close', resolve);
  });

  if (exitCode !== 0) {
    console.error('Docker build failed:');
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    assert.fail(`Docker build failed with exit code ${exitCode}`);
  }

  assert.strictEqual(exitCode, 0, 'Docker build should succeed');
  assert.ok(
    stdout.includes('Successfully built') || stdout.includes('Successfully tagged'),
    'Docker build should complete successfully'
  );
});

test('Docker compose validation', async t => {
  if (process.env.SKIP_DOCKER_TESTS || !(await isDockerComposeAvailable())) {
    t.skip('Docker Compose not available or Docker tests disabled');
    return;
  }

  // Test docker-compose config validation
  const configProcess = spawn('docker-compose', ['config'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';

  configProcess.stdout.on('data', data => {
    stdout += data.toString();
  });

  configProcess.stderr.on('data', data => {
    stderr += data.toString();
  });

  const exitCode = await new Promise(resolve => {
    configProcess.on('close', resolve);
  });

  if (exitCode !== 0) {
    console.error('Docker compose config validation failed:');
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
  }

  assert.strictEqual(exitCode, 0, 'Docker compose configuration should be valid');
  assert.ok(stdout.includes('services:'), 'Docker compose should output valid configuration');
});

// Helper functions
function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, options, response => {
      let data = '';

      response.on('data', chunk => {
        data += chunk;
      });

      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${data}`));
        }
      });
    });

    request.on('error', error => {
      reject(error);
    });

    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function isDockerAvailable() {
  return new Promise(resolve => {
    const process = spawn('docker', ['--version'], { stdio: 'pipe' });
    process.on('close', code => {
      resolve(code === 0);
    });
    process.on('error', () => {
      resolve(false);
    });
  });
}

function isDockerComposeAvailable() {
  return new Promise(resolve => {
    const process = spawn('docker-compose', ['--version'], { stdio: 'pipe' });
    process.on('close', code => {
      resolve(code === 0);
    });
    process.on('error', () => {
      resolve(false);
    });
  });
}
