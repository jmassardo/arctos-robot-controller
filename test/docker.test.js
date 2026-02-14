const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Dockerfile exists and contains required stages', () => {
  const dockerfilePath = path.join(__dirname, '../Dockerfile');
  assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile should exist');

  const content = fs.readFileSync(dockerfilePath, 'utf8');
  assert.ok(
    content.includes('FROM node:18-alpine AS builder'),
    'Dockerfile should have builder stage'
  );
  assert.ok(
    content.includes('FROM node:18-alpine AS production'),
    'Dockerfile should have production stage'
  );
  assert.ok(content.includes('USER arctos'), 'Dockerfile should use non-root user');
  assert.ok(content.includes('HEALTHCHECK'), 'Dockerfile should include health check');
  assert.ok(content.includes('EXPOSE 5000'), 'Dockerfile should expose port 5000');
});

test('Development Dockerfile exists and is properly configured', () => {
  const dockerfileDevPath = path.join(__dirname, '../Dockerfile.dev');
  assert.ok(fs.existsSync(dockerfileDevPath), 'Dockerfile.dev should exist');

  const content = fs.readFileSync(dockerfileDevPath, 'utf8');
  assert.ok(content.includes('FROM node:18-alpine'), 'Dockerfile.dev should use Node 18 Alpine');
  assert.ok(content.includes('EXPOSE 5000 3000'), 'Dockerfile.dev should expose both ports');
  assert.ok(content.includes('npm'), 'Dockerfile.dev should use npm command');
  assert.ok(content.includes('dev'), 'Dockerfile.dev should use development command');
});

test('Docker Compose files exist and are valid YAML', () => {
  const composePath = path.join(__dirname, '../docker-compose.yml');
  const composeDevPath = path.join(__dirname, '../docker-compose.dev.yml');

  assert.ok(fs.existsSync(composePath), 'docker-compose.yml should exist');
  assert.ok(fs.existsSync(composeDevPath), 'docker-compose.dev.yml should exist');

  // Basic YAML structure checks
  const composeContent = fs.readFileSync(composePath, 'utf8');
  assert.ok(composeContent.includes('version:'), 'docker-compose.yml should have version');
  assert.ok(composeContent.includes('services:'), 'docker-compose.yml should have services');
  assert.ok(
    composeContent.includes('arctos-robot-controller:'),
    'docker-compose.yml should define main service'
  );
  assert.ok(
    composeContent.includes('healthcheck:'),
    'docker-compose.yml should have health checks'
  );
  assert.ok(composeContent.includes('volumes:'), 'docker-compose.yml should define volumes');
  assert.ok(composeContent.includes('networks:'), 'docker-compose.yml should define networks');
});

test('.dockerignore exists and excludes appropriate files', () => {
  const dockerignorePath = path.join(__dirname, '../.dockerignore');
  assert.ok(fs.existsSync(dockerignorePath), '.dockerignore should exist');

  const content = fs.readFileSync(dockerignorePath, 'utf8');
  assert.ok(content.includes('node_modules'), '.dockerignore should exclude node_modules');
  assert.ok(content.includes('.git'), '.dockerignore should exclude .git');
  assert.ok(content.includes('test'), '.dockerignore should exclude test files');
  assert.ok(content.includes('coverage'), '.dockerignore should exclude coverage reports');
});

test('Docker environment file exists', () => {
  const envDockerPath = path.join(__dirname, '../.env.docker');
  assert.ok(fs.existsSync(envDockerPath), '.env.docker should exist as template');

  const content = fs.readFileSync(envDockerPath, 'utf8');
  assert.ok(content.includes('NODE_ENV=production'), '.env.docker should set NODE_ENV');
  assert.ok(content.includes('PORT=5000'), '.env.docker should set PORT to 5000');
  assert.ok(content.includes('JWT_SECRET'), '.env.docker should include JWT_SECRET');
});

test('Docker build scripts exist and are executable', () => {
  const buildScriptPath = path.join(__dirname, '../scripts/docker-build.sh');
  const deployScriptPath = path.join(__dirname, '../scripts/docker-deploy.sh');

  assert.ok(fs.existsSync(buildScriptPath), 'docker-build.sh should exist');
  assert.ok(fs.existsSync(deployScriptPath), 'docker-deploy.sh should exist');

  // Check if scripts are executable (Unix systems)
  if (process.platform !== 'win32') {
    const buildStats = fs.statSync(buildScriptPath);
    const deployStats = fs.statSync(deployScriptPath);

    assert.ok((buildStats.mode & parseInt('111', 8)) > 0, 'docker-build.sh should be executable');
    assert.ok((deployStats.mode & parseInt('111', 8)) > 0, 'docker-deploy.sh should be executable');
  }
});

test('Nginx configuration exists', () => {
  const nginxConfigPath = path.join(__dirname, '../docker/nginx.conf');
  assert.ok(fs.existsSync(nginxConfigPath), 'nginx.conf should exist');

  const content = fs.readFileSync(nginxConfigPath, 'utf8');
  assert.ok(content.includes('upstream arctos_backend'), 'nginx.conf should define upstream');
  assert.ok(content.includes('location /socket.io/'), 'nginx.conf should handle Socket.IO');
  assert.ok(
    content.includes('proxy_set_header Upgrade'),
    'nginx.conf should handle WebSocket upgrades'
  );
});

test('Package.json includes Docker scripts', () => {
  const pkg = require('../package.json');

  assert.ok(pkg.scripts['docker:build'], 'package.json should have docker:build script');
  assert.ok(pkg.scripts['docker:compose'], 'package.json should have docker:compose script');
  assert.ok(
    pkg.scripts['docker:compose-dev'],
    'package.json should have docker:compose-dev script'
  );
  assert.ok(pkg.scripts['docker:logs'], 'package.json should have docker:logs script');
  assert.ok(pkg.scripts['docker:stop'], 'package.json should have docker:stop script');
});

test('Health check endpoint is available in server.js', () => {
  const serverPath = path.join(__dirname, '../server.js');
  const content = fs.readFileSync(serverPath, 'utf8');

  assert.ok(content.includes('/api/health'), 'server.js should have /api/health endpoint');
  assert.ok(content.includes("status: 'healthy'"), 'Health endpoint should return healthy status');
  assert.ok(content.includes('version:'), 'Health endpoint should include version');
  assert.ok(content.includes('uptime:'), 'Health endpoint should include uptime');
});
