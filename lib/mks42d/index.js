/**
 * MKS42D Library Main Export
 * 
 * This library provides CAN communication support for MKS42D stepper controllers
 * including G-code translation and multi-controller coordination.
 */

const MKS42DController = require('./MKS42DController');
const GCodeTranslator = require('./GCodeTranslator');

module.exports = {
  MKS42DController,
  GCodeTranslator
};
