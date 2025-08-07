const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Simple test to check server configuration and structure
test('server configuration directories setup', () => {
  // Test that the server.js defines the correct paths
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  
  // Check that server defines the necessary file paths
  assert.ok(serverContent.includes('CONFIG_FILE'), 'server should define CONFIG_FILE path');
  assert.ok(serverContent.includes('POSITIONS_FILE'), 'server should define POSITIONS_FILE path');
  assert.ok(serverContent.includes('GROUPS_FILE'), 'server should define GROUPS_FILE path');
  
  // Check that server ensures directories exist
  assert.ok(serverContent.includes('fs.ensureDirSync'), 'server should ensure directories exist');
});

test('default robot configuration structure', () => {
  // Load server.js to get the default config (without starting the server)
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  
  // Check that server has essential configuration
  assert.ok(serverContent.includes('robotType'), 'server should define robotType');
  assert.ok(serverContent.includes('communicationProtocol'), 'server should define communicationProtocol');
  assert.ok(serverContent.includes('serialConfig'), 'server should define serialConfig');
  assert.ok(serverContent.includes('canConfig'), 'server should define canConfig');
  assert.ok(serverContent.includes('axes'), 'server should define axes configuration');
});

test('API endpoint definitions', () => {
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  
  // Check that essential API endpoints are defined
  assert.ok(serverContent.includes('/api/config'), 'server should have config endpoint');
  assert.ok(serverContent.includes('/api/positions'), 'server should have positions endpoint');
  assert.ok(serverContent.includes('/api/gcode/execute'), 'server should have G-code execution endpoint');
  assert.ok(serverContent.includes('/api/manual/move'), 'server should have manual move endpoint');
  assert.ok(serverContent.includes('/api/home'), 'server should have home endpoint');
});

test('Socket.IO configuration', () => {
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  
  // Check that Socket.IO is properly configured
  assert.ok(serverContent.includes('socketIo'), 'server should use Socket.IO');
  assert.ok(serverContent.includes('io.on'), 'server should handle Socket.IO connections');
  assert.ok(serverContent.includes('connection'), 'server should handle connection events');
  assert.ok(serverContent.includes('disconnect'), 'server should handle disconnect events');
});