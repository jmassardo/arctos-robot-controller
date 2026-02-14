# Quick Start Guide for Robot Operators

Welcome to the Arctos Robot Controller! This guide will get you up and running with basic robot operation in under 10 minutes.

## 👋 What You'll Learn

By the end of this guide, you'll be able to:
- [ ] Access the robot control interface
- [ ] Perform basic robot movements
- [ ] Save and replay positions
- [ ] Execute simple G-code programs
- [ ] Handle common issues safely

**Estimated Time**: 5-10 minutes  
**Prerequisites**: Basic computer skills  
**Required Access**: Operator role or higher

## 🔐 Step 1: Access the Interface

1. **Open your web browser** and navigate to the robot controller:
   ```
   http://your-robot-controller:3000
   ```

2. **Log in** with your operator credentials:
   - **Username**: Your assigned operator username
   - **Password**: Your secure password

3. **Verify connection**: Look for the green "Connected" status in the top-right corner

> ⚠️ **Safety First**: Always ensure the robot workspace is clear before operating

## 🕹️ Step 2: Manual Control Basics

1. **Navigate to Manual Control tab** - Click the "Manual Control" tab in the interface

2. **Understanding the controls**:
   - **Jog buttons (+/-)**: Move individual axes in small increments
   - **Position display**: Shows current robot position
   - **Emergency Stop**: Large red button - use in emergencies only

3. **Try basic movement**:
   ```
   1. Click "Axis 1 +" to move the first axis
   2. Watch the position values update in real-time
   3. Click "Axis 1 -" to move back
   ```

4. **Test gripper control**:
   ```
   1. Click "Open" to open the gripper
   2. Click "Close" to close the gripper
   3. Try "50%" for partial grip
   ```

> 💡 **Tip**: Start with small movements to get familiar with robot response

## 💾 Step 3: Save Your First Position

1. **Move the robot** to a position you want to remember

2. **Name your position**:
   ```
   1. Enter a descriptive name like "Home Position" 
   2. Click "Save Current Position"
   3. Confirm the success message appears
   ```

3. **Verify the save**:
   ```
   1. Navigate to "Position Replay" tab
   2. Your saved position should appear in the list
   3. Note the timestamp and axis values
   ```

## 📁 Step 4: Replay Saved Positions

1. **In the Position Replay tab**:
   ```
   1. Find your saved position in the list
   2. Click the checkbox next to it
   3. Click "Replay Selected Positions"
   ```

2. **Watch the movement**:
   - The robot will smoothly move to the saved position
   - Progress updates appear in real-time
   - Status shows "EXECUTING" then "COMPLETED"

> ⚠️ **Safety**: Ensure clear path before replaying positions

## 🤖 Step 5: Run Your First G-code Program

1. **Navigate to G-Code Control tab**

2. **Load sample program**:
   ```
   1. Click "Load Sample" button
   2. Review the sample G-code that appears
   3. Notice the syntax highlighting
   ```

3. **Execute the program**:
   ```
   1. Click "Execute G-Code" 
   2. Watch the progress bar and status updates
   3. Monitor robot movement during execution
   ```

4. **View execution results**:
   - Execution time displayed
   - Success/error status shown
   - Program remains available for re-execution

## ✅ Step 6: Verify Everything Works

**Quick Verification Checklist**:
- [ ] Can log in and see connected status
- [ ] Manual axis movement works properly
- [ ] Gripper opens and closes correctly  
- [ ] Can save positions with custom names
- [ ] Saved positions replay accurately
- [ ] G-code programs execute successfully

**If any step fails**, see the [Troubleshooting Guide](../troubleshooting/common-issues.md) for solutions.

## 🆘 Emergency Procedures

**If something goes wrong**:

1. **Immediate Safety**:
   - Click the red "Emergency Stop" button
   - Physically move away from robot if necessary
   - Do not attempt to restart until issue is resolved

2. **Common Emergency Situations**:
   - **Robot moves unexpectedly**: Emergency stop → Check G-code program
   - **Connection lost**: Check network → Restart interface
   - **Gripper won't release**: Emergency stop → Manual gripper release

3. **Get Help**:
   - Contact your supervisor
   - Check [Troubleshooting Guide](../troubleshooting/common-issues.md)
   - Document what happened for technical support

## 🎯 What's Next?

Now that you've mastered the basics, explore these advanced features:

### **Daily Operations**
- [Complete Operations Manual](daily-operations.md) - Detailed procedures for all common tasks
- [Safety Procedures](safety-procedures.md) - Comprehensive safety protocols
- [Maintenance Tasks](maintenance-tasks.md) - Keep your robot running smoothly

### **Advanced Features**
- [Position Management](position-management.md) - Organize and manage large position libraries
- [G-code Programming](g-code-programs.md) - Create custom automation programs
- [Monitoring and Alerts](monitoring-status.md) - Track system performance

### **Problem Solving**
- [Troubleshooting Guide](../troubleshooting/) - Solutions for common problems
- [Error Messages](../troubleshooting/error-messages.md) - Decode error messages
- [Getting Help](../troubleshooting/getting-help.md) - When and how to get support

## 💬 Feedback and Support

**Help us improve this guide**:
- Was this guide helpful? [Rate it here](#feedback-widget)
- Missing information? [Suggest improvements](https://github.com/project/issues)
- Found an error? [Report it here](https://github.com/project/issues/new)

**Need help?**
- Ask your supervisor or system administrator
- Check the [FAQ](../troubleshooting/common-issues.md)
- Contact technical support with specific error messages

---

🎉 **Congratulations!** You're now ready to operate the Arctos Robot Controller safely and effectively. Practice these basics until they become second nature, then explore the advanced features to increase your productivity.