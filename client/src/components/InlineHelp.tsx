import React, { useState, useRef, useEffect } from 'react';

interface HelpItem {
  id: string;
  title: string;
  content: string;
  category: 'manual-control' | 'gcode' | 'position-replay' | 'configuration' | 'general';
}

interface InlineHelpProps {
  topic: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'small' | 'medium' | 'large';
  children?: React.ReactNode;
}

const InlineHelp: React.FC<InlineHelpProps> = ({ 
  topic, 
  position = 'top', 
  size = 'medium', 
  children 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [helpContent, setHelpContent] = useState<HelpItem | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const helpDatabase: Record<string, HelpItem> = {
    'jog-controls': {
      id: 'jog-controls',
      title: 'Jog Controls',
      content: `Use the + and - buttons to move individual robot axes. The step size determines how far each axis moves per button press. Start with larger steps for coarse positioning, then use smaller steps for fine adjustments.

Safety Tips:
• Always check position limits before jogging
• Use slow speeds when learning
• Keep the emergency stop accessible`,
      category: 'manual-control'
    },
    'position-saving': {
      id: 'position-saving',
      title: 'Saving Positions',
      content: `To save the current robot position:
1. Move robot to desired location using jog controls
2. Enter a descriptive name (e.g., "Home", "Pickup Point")
3. Click "Save Current Position"

The saved position includes all axis positions and gripper state. Use descriptive names to easily identify positions later.`,
      category: 'manual-control'
    },
    'gcode-basics': {
      id: 'gcode-basics',
      title: 'G-Code Basics',
      content: `G-Code is the standard language for controlling robots and CNC machines:

• G0: Rapid move (fastest speed)
• G1: Linear move at controlled speed
• G2/G3: Circular moves (clockwise/counter-clockwise)
• F: Set feed rate (speed)

Example:
G0 X10 Y10    ; Rapid move to (10,10)
G1 X20 Y20 F100  ; Controlled move at 100 units/min`,
      category: 'gcode'
    },
    'simulation-mode': {
      id: 'simulation-mode',
      title: 'Simulation Mode',
      content: `Always test G-Code programs in simulation mode first:

1. Enable "Simulation Mode" checkbox
2. Click "Execute G-Code"  
3. Review the motion path and check for errors
4. If satisfied, disable simulation and run for real

Simulation prevents crashes and validates your program before actual robot movement.`,
      category: 'gcode'
    },
    'position-replay': {
      id: 'position-replay',
      title: 'Position Replay',
      content: `Position Replay allows you to move the robot to previously saved positions:

1. Select positions from the list using checkboxes
2. Choose replay order (saved order or custom sequence)
3. Set movement speed and delay between positions
4. Click "Replay Selected Positions"

Great for repetitive tasks and automated sequences.`,
      category: 'position-replay'
    },
    'robot-configuration': {
      id: 'robot-configuration',
      title: 'Robot Configuration',
      content: `Proper configuration is essential for safe operation:

• Robot Type: Select your specific robot model
• Communication: Choose serial, TCP/IP, or CAN bus
• Axis Limits: Set software limits for each axis
• Safety Settings: Configure emergency stops and speed limits

Always verify configuration before operating the robot.`,
      category: 'configuration'
    },
    'emergency-stop': {
      id: 'emergency-stop',
      title: 'Emergency Stop',
      content: `The emergency stop immediately halts all robot motion:

• Press the red E-Stop button or press ESC key
• Power is cut to all motors
• Robot must be reset after E-Stop activation
• Always ensure E-Stop is easily accessible

Use E-Stop any time you feel unsafe or notice unexpected behavior.`,
      category: 'general'
    },
    'workspace-limits': {
      id: 'workspace-limits',
      title: 'Workspace Limits',
      content: `Workspace limits prevent the robot from moving beyond safe boundaries:

• Software Limits: Configured in software, prevent axis over-travel
• Hardware Limits: Physical switches that stop motion
• Working Envelope: 3D space the robot can safely reach

Stay within defined limits to prevent damage and ensure safety.`,
      category: 'configuration'
    }
  };

  useEffect(() => {
    const content = helpDatabase[topic];
    if (content) {
      setHelpContent(content);
    }
  }, [topic]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const getTooltipClasses = () => {
    const baseClasses = 'inline-help-tooltip';
    const positionClass = `tooltip-${position}`;
    const sizeClass = `tooltip-${size}`;
    return `${baseClasses} ${positionClass} ${sizeClass}`;
  };

  if (!helpContent) {
    return children ? <span>{children}</span> : null;
  }

  return (
    <div className="inline-help-container">
      {children && <span className="help-content-wrapper">{children}</span>}
      <button
        ref={triggerRef}
        className="inline-help-trigger"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => size === 'small' && setIsOpen(true)}
        onMouseLeave={() => size === 'small' && setIsOpen(false)}
        aria-label={`Help: ${helpContent.title}`}
        title={helpContent.title}
      >
        {size === 'small' ? '?' : '💡'}
      </button>
      
      {isOpen && (
        <div ref={tooltipRef} className={getTooltipClasses()}>
          <div className="help-header">
            <h4 className="help-title">{helpContent.title}</h4>
            <button 
              className="help-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close help"
            >
              ×
            </button>
          </div>
          <div className="help-body">
            {helpContent.content.split('\n').map((paragraph, index) => {
              if (paragraph.trim() === '') return null;
              
              if (paragraph.startsWith('•')) {
                return (
                  <div key={index} className="help-bullet">
                    {paragraph.replace('•', '').trim()}
                  </div>
                );
              }
              
              if (paragraph.includes(':')) {
                const [label, description] = paragraph.split(':');
                return (
                  <div key={index} className="help-definition">
                    <strong>{label}:</strong> {description}
                  </div>
                );
              }
              
              return <p key={index} className="help-paragraph">{paragraph}</p>;
            })}
          </div>
          <div className="help-category">
            Category: {helpContent.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </div>
        </div>
      )}
    </div>
  );
};

export default InlineHelp;