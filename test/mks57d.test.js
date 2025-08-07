const test = require('node:test');
const assert = require('node:assert');
const MKS57D = require('../lib/mks57d');
const MKS57DManager = require('../lib/mks57d-manager');

test('MKS57D class instantiation', () => {
  // Test MKS57D class instantiation
  const mks57d = new MKS57D({
    interface: 'can0',
    baseCanId: 0x100
  });
  
  assert.ok(mks57d, 'MKS57D class should instantiate successfully');
  assert.ok(typeof mks57d.degreesToSteps === 'function', 'should have degreesToSteps method');
  assert.ok(typeof mks57d.stepsToDegrees === 'function', 'should have stepsToDegrees method');
});

test('MKS57DManager class instantiation', () => {
  // Test MKS57DManager class instantiation
  const manager = new MKS57DManager({
    canConfig: {
      interface: 'can0',
      baseCanId: 0x100
    }
  });
  
  assert.ok(manager, 'MKS57DManager class should instantiate successfully');
  assert.ok(typeof manager.parseGCodeToMovements === 'function', 'should have parseGCodeToMovements method');
});

test('degree/step conversion methods', () => {
  const mks57d = new MKS57D({
    interface: 'can0',
    baseCanId: 0x100
  });

  const degrees = 90;
  const steps = mks57d.degreesToSteps(degrees);
  const convertedBack = mks57d.stepsToDegrees(steps);
  
  assert.strictEqual(typeof steps, 'number', 'degreesToSteps should return a number');
  assert.strictEqual(typeof convertedBack, 'number', 'stepsToDegrees should return a number');
  assert.strictEqual(convertedBack, degrees, `conversion should be reversible: ${degrees}° -> ${steps} steps -> ${convertedBack}°`);
});

test('G-code parsing', () => {
  const manager = new MKS57DManager({
    canConfig: {
      interface: 'can0',
      baseCanId: 0x100
    }
  });

  const movements = manager.parseGCodeToMovements('G1 X100 Y50 Z30');
  
  assert.ok(movements, 'parseGCodeToMovements should return a result');
  assert.ok(typeof movements === 'object', 'movements should be an object');
  assert.strictEqual(movements.axis1, 100, 'should parse X100 as axis1: 100');
  assert.strictEqual(movements.axis2, 50, 'should parse Y50 as axis2: 50');
  assert.strictEqual(movements.axis3, 30, 'should parse Z30 as axis3: 30');
});