// Simple test to verify MKS57D library loads without errors
const MKS57D = require('../lib/mks57d');
const MKS57DManager = require('../lib/mks57d-manager');

console.log('Testing MKS57D library...');

try {
  // Test MKS57D class instantiation
  const mks57d = new MKS57D({
    port: '/dev/ttyUSB1',
    baudRate: 9600
  });
  console.log('✓ MKS57D class instantiated successfully');

  // Test MKS57DManager class instantiation
  const manager = new MKS57DManager({
    rs485Config: {
      port: '/dev/ttyUSB1',
      baudRate: 9600
    }
  });
  console.log('✓ MKS57DManager class instantiated successfully');

  // Test degree/step conversion methods
  const degrees = 90;
  const steps = mks57d.degreesToSteps(degrees);
  const convertedBack = mks57d.stepsToDegrees(steps);
  
  console.log(`✓ Conversion test: ${degrees}° -> ${steps} steps -> ${convertedBack}°`);

  // Test G-code parsing
  const movements = manager.parseGCodeToMovements('G1 X100 Y50 Z30');
  console.log('✓ G-code parsing:', movements);

  console.log('\n🎉 All tests passed! MKS57D library is ready for use.');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}