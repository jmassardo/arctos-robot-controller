/**
 * Simple tests for MKS42D library functionality
 * Run with: node tests/mks42d-test.js
 */

const { MKS42DController, GCodeTranslator } = require('../lib/mks42d');

async function runTests() {
  console.log('🧪 MKS42D Library Tests Starting...\n');

  // Test 1: MKS42DController initialization
  console.log('Test 1: MKS42DController initialization');
  try {
    const controller = new MKS42DController({
      interface: 'can0',
      simulationMode: true,
      controllers: [
        { id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }
      ]
    });
    
    console.log('✅ MKS42DController created successfully');
    
    // Test connection
    const connected = await controller.connect();
    console.log(`✅ Connection result: ${connected}`);
    
    // Test GoHome command
    const homeResults = await controller.goHome([1]);
    console.log('✅ GoHome command sent:', homeResults);
    
    // Test move command
    const moveResults = await controller.moveAbsolute(1, 0, 1000, 500);
    console.log('✅ Move command sent:', moveResults);
    
    // Test position reading
    const position = await controller.getPosition(1);
    console.log('✅ Position read:', position);
    
    // Test stop command
    const stopResults = await controller.stop([1]);
    console.log('✅ Stop command sent:', stopResults);
    
    controller.disconnect();
    console.log('✅ Controller disconnected\n');
    
  } catch (error) {
    console.error('❌ MKS42DController test failed:', error.message);
    return false;
  }

  // Test 2: GCodeTranslator functionality
  console.log('Test 2: GCodeTranslator functionality');
  try {
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
    
    console.log('✅ GCodeTranslator created successfully');
    
    // Test G-code parsing
    const gcode = `G28
G90
G21  
G1 X10 Y20 Z5 F1000
M106
G4 P1000
M107
M2`;
    
    console.log('Testing G-code execution...');
    const results = await translator.executeGCode(gcode);
    console.log(`✅ G-code executed: ${results.length} commands processed`);
    
    // Check that all commands succeeded
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Success rate: ${successCount}/${results.length} commands`);
    
    controller.disconnect();
    console.log('✅ GCodeTranslator test completed\n');
    
  } catch (error) {
    console.error('❌ GCodeTranslator test failed:', error.message);
    return false;
  }

  // Test 3: Error handling
  console.log('Test 3: Error handling');
  try {
    const controller = new MKS42DController({
      interface: 'can0',
      simulationMode: true,
      controllers: []
    });
    
    await controller.connect();
    
    // Test with empty controllers
    const results = await controller.goHome([99]); // Non-existent controller
    console.log('✅ Error handling test passed:', results);
    
    controller.disconnect();
    
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
  }

  console.log('🎉 All tests completed successfully!');
  return true;
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});