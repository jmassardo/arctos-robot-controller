const test = require('node:test');
const assert = require('node:assert');
const { MKS42DController, GCodeTranslator } = require('../lib/mks42d');

test('MKS42DController initialization and basic operations', async () => {
  const controller = new MKS42DController({
    interface: 'can0',
    simulationMode: true,
    controllers: [
      { id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }
    ]
  });
  
  assert.ok(controller, 'MKS42DController should be created successfully');
  
  // Test connection
  const connected = await controller.connect();
  assert.strictEqual(connected, true, 'Connection should succeed');
  
  // Test GoHome command
  const homeResults = await controller.goHome([1]);
  assert.ok(Array.isArray(homeResults), 'GoHome should return an array');
  assert.strictEqual(homeResults.length, 1, 'Should return one result');
  assert.strictEqual(homeResults[0].success, true, 'GoHome should succeed');
  assert.strictEqual(homeResults[0].controllerId, 1, 'Should return correct controller ID');
  
  // Test move command
  const moveResults = await controller.moveAbsolute(1, 0, 1000, 500);
  assert.ok(Array.isArray(moveResults), 'moveAbsolute should return an array');
  assert.strictEqual(moveResults[0].success, true, 'Move command should succeed');
  
  // Test position reading
  const position = await controller.getPosition(1);
  assert.ok(position, 'getPosition should return a position object');
  assert.ok(typeof position === 'object', 'Position should be an object');
  assert.ok('x' in position, 'Position should have x property');
  assert.ok('y' in position, 'Position should have y property');
  
  // Test stop command
  const stopResults = await controller.stop([1]);
  assert.ok(Array.isArray(stopResults), 'stop should return an array');
  assert.strictEqual(stopResults[0].success, true, 'Stop command should succeed');
  
  controller.disconnect();
});

test('GCodeTranslator functionality', async () => {
  const controller = new MKS42DController({
    interface: 'can0',
    simulationMode: true,
    controllers: [
      { id: 1, name: 'XY Controller', axes: ['X', 'Y'], type: 'axis' },
      { id: 2, name: 'Z Controller', axes: ['Z'], type: 'axis' },
      { id: 3, name: 'Gripper', axes: ['E'], type: 'gripper' }
    ]
  });
  
  await controller.connect();
  
  const translator = new GCodeTranslator(controller, {
    stepsPerMM: { x: 80, y: 80, z: 400, e: 93 },
    maxSpeed: { x: 3000, y: 3000, z: 1500, e: 2000 }
  });
  
  assert.ok(translator, 'GCodeTranslator should be created successfully');
  
  // Test G-code parsing and execution
  const gcode = `G28
G90
G21  
G1 X10 Y20 Z5 F1000
M106
G4 P1000
M107
M2`;
  
  const results = await translator.executeGCode(gcode);
  
  assert.ok(Array.isArray(results), 'executeGCode should return an array');
  assert.strictEqual(results.length, 8, 'Should process 8 commands');
  
  // Check that all commands succeeded
  const successCount = results.filter(r => r.success).length;
  assert.strictEqual(successCount, results.length, 'All commands should succeed');
  
  controller.disconnect();
});

test('MKS42DController error handling', async () => {
  const controller = new MKS42DController({
    interface: 'can0',
    simulationMode: true,
    controllers: []
  });
  
  await controller.connect();
  
  // Test with empty controllers - should handle gracefully
  const results = await controller.goHome([99]); // Non-existent controller
  assert.ok(Array.isArray(results), 'Should return an array even for non-existent controllers');
  
  controller.disconnect();
});