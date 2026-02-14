# Arctos Robot Controller - User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Safety Guidelines](#safety-guidelines)
3. [User Interface Overview](#user-interface-overview)
4. [Manual Robot Control](#manual-robot-control)
5. [G-Code Program Execution](#g-code-program-execution)
6. [Position Management](#position-management)
7. [System Configuration](#system-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Getting Started

### First-Time Setup

**Prerequisites:**
- Robot controller hardware properly connected
- Network connection established
- User account created by system administrator

**Initial Login:**
1. Open your web browser and navigate to `http://localhost:3000`
2. Enter your username and password provided by your administrator
3. Click "Login" to access the robot control interface
4. If prompted, complete two-factor authentication setup for enhanced security

**Quick Start Checklist:**
- [ ] Verify robot status shows "Connected" in the header
- [ ] Check that all axes show current positions
- [ ] Confirm emergency stop button is easily accessible
- [ ] Test manual jog controls with small movements
- [ ] Save your first position for reference

### Understanding the Interface

The Arctos Robot Controller interface consists of four main tabs:

1. **Manual Control** - Direct robot movement and position saving
2. **G-Code Control** - Automated program execution
3. **Position Replay** - Sequential movement patterns
4. **Configuration** - System settings and limits

## Safety Guidelines

### ⚠️ CRITICAL SAFETY REQUIREMENTS

**Before Operating the Robot:**
- [ ] Ensure work area is clear of personnel
- [ ] Verify all safety barriers are in place
- [ ] Check emergency stop button functionality
- [ ] Confirm robot is properly homed
- [ ] Review movement limits for your application

**During Operation:**
- [ ] Always keep emergency stop within reach
- [ ] Start with slow speeds (≤25% maximum)
- [ ] Test movements in small increments first
- [ ] Monitor robot closely during automatic operations
- [ ] Never leave robot unattended during movement

**Emergency Procedures:**
1. **Emergency Stop**: Press red emergency stop button or click "STOP" in interface
2. **Power Emergency**: Turn off main power switch if software stop fails
3. **Clear Area**: Immediately clear work area of all personnel
4. **Call Support**: Contact technical support for any unusual behavior

### Safety Features

**Automatic Protection:**
- **Software limits** prevent movement beyond configured boundaries
- **Speed limiting** restricts maximum velocity based on configuration
- **Position monitoring** tracks robot location continuously
- **Communication watchdog** stops robot if connection is lost
- **Thermal protection** prevents overheating of motors

**User Controls:**
- **Emergency stop button** (red) - immediately stops all movement
- **Soft stop** - controlled deceleration and stop
- **Speed override** - reduce movement speed during operation
- **Dry run mode** - simulate movements without actual robot motion

## User Interface Overview

### Main Navigation

The interface header contains:
- **Connection Status**: Shows "Connected" when robot communication is active
- **Emergency Stop Button**: Large red button for immediate stopping
- **User Menu**: Profile settings, logout, and preferences
- **Tab Navigation**: Switch between different control modes

### Status Indicators

**Robot Status:**
- 🟢 **Connected & Ready** - Robot is operational
- 🟡 **Moving** - Robot is currently executing movements
- 🔴 **Error** - Problem detected, requires attention
- ⚫ **Disconnected** - Communication lost with robot

**Position Display:**
- Current axis positions shown in real-time
- Units: degrees for rotary axes, millimeters for linear axes
- Green values indicate positions within safe limits
- Red values indicate positions near or at limits

### Real-Time Updates

All interface elements update automatically:
- Position values refresh every 100ms
- Status changes appear immediately across all browser tabs
- Error messages and alerts display in real-time
- Progress bars update during program execution

## Manual Robot Control

### Axis Control

**Jog Controls:**
Each axis has dedicated controls for precise movement:

1. **Coarse Jog** (+10/-10 buttons): Large movements for positioning
2. **Fine Jog** (+1/-1 buttons): Small movements for precision work
3. **Micro Jog** (+0.1/-0.1 buttons): Very small adjustments

**Movement Procedure:**
1. Select appropriate jog increment for your task
2. Click direction button (+/-) to move axis
3. Monitor position display for current location
4. Use smaller increments as you approach target position

**Speed Control:**
- **Speed Slider**: Adjust movement velocity (10-100%)
- **Acceleration**: Automatically adjusted based on speed
- **Safety Override**: Speed limited by configuration settings

### Manipulator Control

**Gripper/End Effector Controls:**
- **Open Button**: Fully open gripper (0% closed)
- **50% Button**: Half-open position for standard parts
- **Close Button**: Fully close gripper (100% closed)
- **Custom Position**: Enter specific percentage value

**Usage Tips:**
- Test gripper operation without workpiece first
- Adjust grip force based on part material and weight
- Use 50% position as starting point for new parts
- Monitor gripper feedback for proper operation

### Position Saving

**Save Current Position:**
1. Move robot to desired location using jog controls
2. Enter descriptive name in "Position Name" field
3. Add optional description for future reference
4. Select position group for organization
5. Click "Save Current Position"
6. Confirm success message appears

**Position Naming Best Practices:**
- Use descriptive names: "Part_Pickup_Station_1"
- Include part numbers or batch identifiers
- Add date/time for temporary positions
- Use consistent naming convention across team
- Avoid special characters that might cause issues

## G-Code Program Execution

### Program Management

**Loading Programs:**
1. Navigate to "G-Code Control" tab
2. Click "Load Program" button
3. Select G-code file from computer (.gcode, .nc, .txt files)
4. Review program details and validation results
5. Click "Upload" to save program to robot controller

**Program Validation:**
The system automatically checks uploaded G-code for:
- Syntax errors and unknown commands
- Movement beyond axis limits
- Speed and acceleration violations
- Missing tool or coordinate definitions
- Potential collision risks

### Program Execution

**Starting a Program:**
1. Select program from dropdown menu
2. Review program details:
   - Line count and estimated duration
   - Speed and acceleration settings
   - Required tools and setup
3. Choose execution options:
   - **Start Line**: Begin from specific line (default: 1)
   - **End Line**: Stop at specific line (default: end)
   - **Speed Override**: Reduce speed percentage
   - **Dry Run**: Simulate without movement
4. Click "Execute G-Code" to start program

**Monitoring Execution:**
- **Progress Bar**: Shows completion percentage
- **Current Line**: Displays active G-code command
- **Time Remaining**: Estimated time to completion
- **Line Counter**: Current line / total lines
- **Status Messages**: Real-time execution feedback

**Execution Controls:**
- **Pause**: Temporarily stop execution (can resume)
- **Resume**: Continue paused program
- **Cancel**: Stop execution and return to idle
- **Emergency Stop**: Immediate stop (requires restart)

### G-Code Commands Reference

**Supported Commands:**
- **G00**: Rapid movement to position
- **G01**: Linear interpolation at feed rate
- **G02**: Clockwise circular interpolation
- **G03**: Counter-clockwise circular interpolation
- **G28**: Return to home position
- **G90**: Absolute positioning mode
- **G91**: Relative positioning mode
- **M03**: Spindle/tool on clockwise
- **M05**: Spindle/tool off

**Custom Commands:**
- **M100**: Open gripper
- **M101**: Close gripper
- **M102**: Set gripper position (P parameter)
- **M110**: Set movement speed override
- **M111**: Pause for specified time (P parameter)

### Sample G-Code Programs

**Basic Square Pattern:**
```gcode
; Draw 50mm square
G90         ; Absolute positioning
G28         ; Go to home
G01 X0 Y0 F1000    ; Move to start
G01 X50 Y0         ; Move right
G01 X50 Y50        ; Move up
G01 X0 Y50         ; Move left
G01 X0 Y0          ; Return to start
M05         ; End program
```

**Pick and Place Operation:**
```gcode
; Simple pick and place
G90         ; Absolute positioning
G28         ; Home all axes
G01 X100 Y50 Z0 F800  ; Move to pickup
G01 Z-10              ; Lower to part
M100                  ; Close gripper
G01 Z0                ; Lift part
G01 X200 Y50          ; Move to place
G01 Z-10              ; Lower part
M101                  ; Open gripper
G01 Z0                ; Lift clear
G28                   ; Return home
```

## Position Management

### Creating Position Sequences

**Multi-Position Workflows:**
1. Save individual positions for each step
2. Navigate to "Position Replay" tab
3. Select positions from saved list
4. Arrange in desired execution order
5. Set timing and speed parameters
6. Test sequence with dry run mode

**Sequence Parameters:**
- **Loop Count**: Number of times to repeat sequence
- **Speed**: Movement velocity for all positions
- **Pause Between**: Delay time between positions
- **Stop on Error**: Halt sequence if problem occurs

### Position Groups

**Organization System:**
- **System**: Default positions (home, limits, etc.)
- **Setup**: Calibration and alignment positions
- **Production**: Normal operation positions
- **Maintenance**: Service and cleaning positions
- **Custom**: User-defined group names

**Group Management:**
1. Create new groups in Configuration tab
2. Assign positions when saving
3. Filter position list by group
4. Export/import groups for backup

### Advanced Position Features

**Position Metadata:**
- Creation timestamp and user
- Last modification information
- Usage count and statistics
- Custom tags and categories
- Associated part numbers or batches

**Position Validation:**
- Automatic limit checking
- Collision detection warnings
- Reachability verification
- Speed and acceleration validation

## System Configuration

### Robot Setup

**Basic Configuration:**
1. Navigate to "Configuration" tab
2. Select robot type from dropdown
3. Configure communication settings:
   - **Serial**: Select port and baud rate
   - **CAN Bus**: Choose interface name
   - **RS485**: Set port and parameters
4. Set axis count and limits
5. Configure manipulator ranges
6. Save configuration changes

**Axis Configuration:**
- **Count**: Number of robot axes (1-8)
- **Type**: Rotary or linear for each axis
- **Limits**: Minimum and maximum positions
- **Units**: Degrees or millimeters
- **Home Position**: Reference position for each axis
- **Speed Limits**: Maximum velocity per axis

**Safety Settings:**
- **Emergency Stop**: Enable/disable function
- **Soft Limits**: Enforce position boundaries
- **Speed Override**: Maximum allowed speed
- **Collision Detection**: Enable protective features
- **Thermal Monitoring**: Temperature limits

### User Management

**User Roles:**
- **Operator**: Basic robot control and monitoring
- **Technician**: Advanced configuration and maintenance
- **Administrator**: Full system access and user management
- **Viewer**: Read-only access to status and logs

**Permission Settings:**
- **Execute**: Run programs and move robot
- **Configure**: Modify settings and limits
- **Manage Users**: Create and edit user accounts
- **View Logs**: Access system and audit logs

### System Maintenance

**Regular Tasks:**
- **Backup Positions**: Export saved positions weekly
- **Log Review**: Check error and warning logs daily
- **Configuration Backup**: Save settings after changes
- **Performance Check**: Monitor system statistics
- **Software Updates**: Install updates as available

**Maintenance Schedule:**
- **Daily**: Check robot status and clear any errors
- **Weekly**: Review position database and clean unused items
- **Monthly**: Export logs and performance data
- **Quarterly**: Full system backup and configuration review

## Troubleshooting

### Common Issues

**Connection Problems:**

*Symptom*: Status shows "Disconnected"
*Causes*:
- Network cable unplugged
- Robot controller powered off
- Wrong communication settings
- Firewall blocking connection

*Solutions*:
1. Check all cable connections
2. Verify robot controller power LED
3. Review communication settings in Configuration tab
4. Test network connectivity with ping
5. Contact IT support for firewall issues

**Movement Issues:**

*Symptom*: Robot doesn't respond to jog commands
*Causes*:
- Robot not homed
- Emergency stop activated
- Position at software limit
- Communication timeout

*Solutions*:
1. Check emergency stop button (twist to release)
2. Home robot using G28 command
3. Review axis positions for limit violations
4. Restart robot controller if needed
5. Check for error messages in status display

**G-Code Execution Problems:**

*Symptom*: Program stops with error
*Causes*:
- Invalid G-code syntax
- Movement beyond limits
- Missing tool commands
- File corruption

*Solutions*:
1. Review error message details
2. Validate G-code file syntax
3. Check movement coordinates against limits
4. Re-upload program file
5. Test with known good program first

### Error Messages

**Common Error Codes:**

**E001 - Communication Timeout**
- Robot controller not responding
- Check cables and power
- Restart both software and hardware

**E002 - Position Limit Exceeded**
- Movement would exceed configured limits
- Review target position coordinates
- Check axis limit settings

**E003 - Emergency Stop Active**
- Emergency stop button pressed
- Twist red button to release
- Clear any safety conditions

**E004 - Homing Required**
- Robot position unknown
- Execute home sequence (G28)
- Verify home sensors if available

**E005 - Invalid Command**
- Unrecognized G-code or API command
- Check command syntax
- Review supported command list

### Getting Help

**Self-Service Resources:**
1. Check error message database in help section
2. Review troubleshooting guide for common issues
3. Search system logs for related error patterns
4. Test with minimal configuration to isolate problem

**Support Contacts:**
- **Technical Support**: support@arctos-robotics.com
- **Emergency Hotline**: 1-800-ARCTOS-1 (24/7)
- **Documentation**: docs.arctos-robotics.com
- **User Community**: forum.arctos-robotics.com

**Information to Provide:**
- Robot model and serial number
- Software version and build date
- Complete error message text
- Steps to reproduce issue
- Recent configuration changes
- System logs (if available)

## Best Practices

### Operational Excellence

**Daily Startup Procedure:**
1. Visual inspection of robot and work area
2. Power on robot controller and wait for ready status
3. Launch control software and verify connection
4. Home robot to establish position reference
5. Test movement with small jog commands
6. Check emergency stop functionality
7. Review any overnight error logs

**Production Operation:**
- Start with dry run for new programs
- Use position validation before executing sequences
- Monitor first few cycles of any automated sequence
- Keep work area clear and well-lit
- Maintain spare parts inventory for quick repairs
- Document any unusual behavior or workarounds

**End of Shift Procedure:**
1. Return robot to safe home position
2. Stop all running programs
3. Save any new positions created during shift
4. Export production data and logs
5. Clean work area and robot surfaces
6. Power down in proper sequence
7. Complete shift report with any issues

### Performance Optimization

**Speed Settings:**
- Start conservative (25-50% max speed)
- Increase gradually based on application needs
- Consider material properties and part weight
- Balance speed with accuracy requirements
- Monitor for vibration or positioning errors

**Position Accuracy:**
- Use fine jog movements for final positioning
- Allow settling time after large movements
- Consider backlash compensation for critical positions
- Validate repeatability with test cycles
- Use position feedback when available

**Program Efficiency:**
- Minimize unnecessary movements in G-code
- Group operations by location to reduce travel
- Use optimal feed rates for each operation
- Implement efficient tool/gripper changes
- Test programs thoroughly before production use

### Safety Culture

**Risk Assessment:**
- Identify potential hazards in work cell
- Establish clear safety boundaries
- Train all operators on emergency procedures
- Regular safety equipment inspection
- Document and share lessons learned

**Continuous Improvement:**
- Regular review of operating procedures
- Feedback collection from all operators
- Analysis of error patterns and trends
- Updates to training materials
- Sharing best practices across teams

---

**Document Information:**
- Version: 1.0
- Last Updated: January 21, 2025
- Next Review: March 21, 2025
- Document Owner: Technical Writing Team

**Getting Additional Help:**
For questions not covered in this guide, please contact:
- Technical Support: support@arctos-robotics.com
- Training Department: training@arctos-robotics.com
- Documentation Feedback: docs@arctos-robotics.com