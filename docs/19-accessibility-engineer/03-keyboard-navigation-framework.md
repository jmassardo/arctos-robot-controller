# Keyboard Navigation & Focus Management Framework
## Complete Accessibility Implementation for Arctos Robot Controller

### Overview

This document provides comprehensive keyboard navigation and focus management solutions for the Arctos Robot Controller, ensuring complete functionality for users who rely on keyboard-only interaction, including those using assistive technologies.

## Current Keyboard Accessibility Assessment

### ❌ **Critical Issues Identified**

1. **Robot Jog Controls Not Keyboard Accessible**
   - Impact: Users cannot operate core robot functionality
   - Priority: Critical (Safety Issue)

2. **Emergency Stop Not Keyboard Activated**  
   - Impact: Safety-critical function unavailable to keyboard users
   - Priority: Critical (Safety Issue)

3. **Modal Dialogs Poor Focus Management**
   - Impact: Users get trapped or lose navigation context
   - Priority: High

4. **Tab Order Illogical**
   - Impact: Inefficient navigation, confusing user experience  
   - Priority: High

5. **Missing Keyboard Shortcuts**
   - Impact: Industrial users need quick access to common functions
   - Priority: Medium

## Comprehensive Keyboard Navigation Implementation

### 1. Universal Keyboard Event Handler

```typescript
// KeyboardManager.ts
export class KeyboardManager {
  private shortcuts: Map<string, () => void> = new Map();
  private globalShortcuts: Map<string, () => void> = new Map();
  private focusStack: HTMLElement[] = [];
  
  constructor() {
    this.initializeGlobalListeners();
  }
  
  private initializeGlobalListeners() {
    document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
    document.addEventListener('keyup', this.handleGlobalKeyUp.bind(this));
  }
  
  private handleGlobalKeyDown(event: KeyboardEvent) {
    // Emergency shortcuts always work
    if (event.key === 'Escape' || event.key === 'F1') {
      this.triggerEmergencyStop();
      event.preventDefault();
      return;
    }
    
    // Check for registered global shortcuts
    const shortcutKey = this.getShortcutKey(event);
    if (this.globalShortcuts.has(shortcutKey)) {
      event.preventDefault();
      this.globalShortcuts.get(shortcutKey)?.();
      return;
    }
    
    // Handle focus management
    this.handleFocusManagement(event);
  }
  
  private handleGlobalKeyUp(event: KeyboardEvent) {
    // Release any continuous actions (like jogging)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      this.releaseJogAction(event.key);
    }
  }
  
  registerGlobalShortcut(key: string, callback: () => void) {
    this.globalShortcuts.set(key, callback);
  }
  
  registerContextShortcut(context: string, key: string, callback: () => void) {
    this.shortcuts.set(`${context}:${key}`, callback);
  }
  
  private getShortcutKey(event: KeyboardEvent): string {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');
    
    return [...modifiers, event.key].join('+');
  }
  
  private triggerEmergencyStop() {
    // Dispatch emergency stop event
    const emergencyEvent = new CustomEvent('emergency-stop', {
      bubbles: true,
      cancelable: false
    });
    document.dispatchEvent(emergencyEvent);
  }
  
  // Focus management methods
  pushFocus(element: HTMLElement) {
    const currentFocus = document.activeElement as HTMLElement;
    if (currentFocus && currentFocus !== document.body) {
      this.focusStack.push(currentFocus);
    }
    element.focus();
  }
  
  popFocus() {
    const previousElement = this.focusStack.pop();
    if (previousElement && previousElement.isConnected) {
      previousElement.focus();
    }
  }
  
  trapFocus(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();
    
    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }
  
  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(',');
    
    return Array.from(container.querySelectorAll(selector));
  }
}

export const keyboardManager = new KeyboardManager();
```

### 2. Enhanced Manual Control with Full Keyboard Support

```typescript
// KeyboardAccessibleManualControl.tsx
import React, { useEffect, useCallback, useRef } from 'react';
import { keyboardManager } from '../utils/KeyboardManager';

const KeyboardAccessibleManualControl: React.FC<ManualControlProps> = ({ 
  config, 
  socket 
}) => {
  const [robotState, setRobotState] = useState<RobotState>({
    x: 0, y: 0, z: 0, a: 0, b: 0, c: 0,
    gripper: 0, isConnected: true
  });
  const [jogDistance, setJogDistance] = useState(1);
  const [isJogging, setIsJogging] = useState<string | null>(null);
  const [keyboardControlEnabled, setKeyboardControlEnabled] = useState(false);
  const jogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keyboard shortcut setup
  useEffect(() => {
    // Emergency stop (always available)
    const handleEmergencyStop = () => {
      handleEmergencyStopClick();
      announceToScreenReader('Emergency stop activated');
    };
    
    // Register global shortcuts
    keyboardManager.registerGlobalShortcut('Escape', handleEmergencyStop);
    keyboardManager.registerGlobalShortcut('F1', handleEmergencyStop);
    keyboardManager.registerGlobalShortcut('Ctrl+Shift+E', handleEmergencyStop);
    
    // Toggle keyboard control mode
    keyboardManager.registerGlobalShortcut('Ctrl+K', () => {
      setKeyboardControlEnabled(prev => {
        const newState = !prev;
        announceToScreenReader(
          newState ? 'Keyboard robot control enabled' : 'Keyboard robot control disabled'
        );
        return newState;
      });
    });
    
    // Home all axes
    keyboardManager.registerGlobalShortcut('Ctrl+H', () => {
      if (keyboardControlEnabled) {
        homeAllAxes();
        announceToScreenReader('Homing all axes');
      }
    });
    
    // Jog distance shortcuts
    keyboardManager.registerGlobalShortcut('1', () => setJogDistance(0.1));
    keyboardManager.registerGlobalShortcut('2', () => setJogDistance(1));  
    keyboardManager.registerGlobalShortcut('3', () => setJogDistance(10));
    keyboardManager.registerGlobalShortcut('4', () => setJogDistance(100));
    
    return () => {
      if (jogIntervalRef.current) {
        clearInterval(jogIntervalRef.current);
      }
    };
  }, [keyboardControlEnabled]);
  
  // Continuous jogging with keyboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardControlEnabled || isJogging) return;
      
      const jogMap: { [key: string]: { axis: string; direction: number } } = {
        'ArrowUp': { axis: 'y', direction: 1 },
        'ArrowDown': { axis: 'y', direction: -1 },
        'ArrowLeft': { axis: 'x', direction: -1 },
        'ArrowRight': { axis: 'x', direction: 1 },
        'PageUp': { axis: 'z', direction: 1 },
        'PageDown': { axis: 'z', direction: -1 },
        // Additional axis controls
        'q': { axis: 'a', direction: -1 },
        'w': { axis: 'a', direction: 1 },
        'e': { axis: 'b', direction: -1 },
        'r': { axis: 'b', direction: 1 },
        't': { axis: 'c', direction: -1 },
        'y': { axis: 'c', direction: 1 }
      };
      
      const jogAction = jogMap[event.key];
      if (jogAction && !isJogging) {
        event.preventDefault();
        startContinuousJog(jogAction.axis, jogAction.direction);
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      const jogKeys = [
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 
        'PageUp', 'PageDown', 'q', 'w', 'e', 'r', 't', 'y'
      ];
      
      if (jogKeys.includes(event.key) && isJogging) {
        event.preventDefault();
        stopContinuousJog();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [keyboardControlEnabled, isJogging, jogDistance]);
  
  const startContinuousJog = (axis: string, direction: number) => {
    setIsJogging(`${axis}${direction > 0 ? '+' : '-'}`);
    announceToScreenReader(`Jogging ${axis.toUpperCase()} axis ${direction > 0 ? 'positive' : 'negative'}`);
    
    // Start continuous jogging
    jogIntervalRef.current = setInterval(() => {
      jogAxis(axis, direction);
    }, 100); // 10Hz update rate
  };
  
  const stopContinuousJog = () => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    
    if (isJogging) {
      announceToScreenReader('Jogging stopped');
      setIsJogging(null);
    }
  };
  
  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };
  
  return (
    <div className="manual-control keyboard-enhanced">
      {/* Keyboard Control Status */}
      <div className="keyboard-status" role="status">
        <div className="status-indicator">
          <strong>Keyboard Control:</strong>
          <span className={`status ${keyboardControlEnabled ? 'enabled' : 'disabled'}`}>
            {keyboardControlEnabled ? '✓ Enabled' : '✗ Disabled'}
          </span>
          <button 
            onClick={() => setKeyboardControlEnabled(prev => !prev)}
            aria-label={`${keyboardControlEnabled ? 'Disable' : 'Enable'} keyboard robot control`}
            className="btn btn-sm btn-secondary"
          >
            Toggle (Ctrl+K)
          </button>
        </div>
        
        {keyboardControlEnabled && (
          <div className="keyboard-help-compact">
            <span>Arrow Keys: X/Y | PgUp/PgDn: Z | Q/W/E/R/T/Y: A/B/C | Esc: Emergency Stop</span>
          </div>
        )}
      </div>
      
      {/* Emergency Controls - Always accessible */}
      <section 
        className="emergency-section" 
        role="region" 
        aria-labelledby="emergency-controls-heading"
      >
        <h2 id="emergency-controls-heading">Emergency Controls</h2>
        <div className="emergency-controls">
          <button
            className="emergency-stop"
            onClick={handleEmergencyStopClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault();
                handleEmergencyStopClick();
              }
            }}
            aria-label="Emergency Stop - Press to immediately stop all robot movement"
            aria-describedby="emergency-stop-help"
            tabIndex={0}
            autoFocus={true}
          >
            🛑 EMERGENCY STOP
          </button>
          
          <button
            className="home-button"
            onClick={homeAllAxes}
            disabled={!robotState.isConnected}
            aria-label="Home all axes to zero position"
            aria-describedby="home-help"
          >
            🏠 HOME ALL
          </button>
        </div>
        
        <div className="sr-only">
          <div id="emergency-stop-help">
            Immediately stops all robot movement. 
            Keyboard shortcuts: Escape key, F1, or Ctrl+Shift+E
          </div>
          <div id="home-help">
            Moves all robot axes to their home position at zero coordinates
          </div>
        </div>
      </section>
      
      {/* Robot Status Display */}
      <section 
        className="status-section"
        role="region"
        aria-labelledby="robot-status-heading"
        aria-live="polite"
      >
        <h2 id="robot-status-heading">Robot Status</h2>
        <div className="connection-status">
          <span className={`status-indicator ${robotState.isConnected ? 'connected' : 'disconnected'}`}>
            {robotState.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          {isJogging && (
            <span className="jog-status" aria-live="polite">
              ⚡ Jogging: {isJogging}
            </span>
          )}
        </div>
      </section>
      
      {/* Jog Settings */}
      <section 
        className="jog-settings"
        role="region"
        aria-labelledby="jog-settings-heading"
      >
        <h2 id="jog-settings-heading">Jog Settings</h2>
        <div className="settings-row">
          <div className="form-group">
            <label htmlFor="jog-distance">
              Jog Distance (mm)
            </label>
            <input
              id="jog-distance"
              type="number"
              value={jogDistance}
              onChange={(e) => setJogDistance(Number(e.target.value))}
              min="0.1"
              max="100"
              step="0.1"
              className="form-control"
              aria-describedby="jog-distance-help"
              onKeyDown={(e) => {
                // Quick distance selection
                if (e.ctrlKey) {
                  switch(e.key) {
                    case '1': setJogDistance(0.1); e.preventDefault(); break;
                    case '2': setJogDistance(1); e.preventDefault(); break;
                    case '3': setJogDistance(10); e.preventDefault(); break;
                    case '4': setJogDistance(100); e.preventDefault(); break;
                  }
                }
              }}
            />
            <div id="jog-distance-help" className="form-help">
              Distance to move axis with each jog command. 
              Quick select: Ctrl+1 (0.1mm), Ctrl+2 (1mm), Ctrl+3 (10mm), Ctrl+4 (100mm)
            </div>
          </div>
          
          <div className="preset-distances">
            <span>Quick Select:</span>
            {[0.1, 1, 10, 100].map(distance => (
              <button
                key={distance}
                className={`btn btn-sm ${jogDistance === distance ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setJogDistance(distance)}
                aria-pressed={jogDistance === distance}
                aria-label={`Set jog distance to ${distance} millimeters`}
              >
                {distance}mm
              </button>
            ))}
          </div>
        </div>
      </section>
      
      {/* Axis Controls with Full Keyboard Support */}
      <section 
        className="axis-controls"
        role="region"
        aria-labelledby="axis-controls-heading"
      >
        <h2 id="axis-controls-heading">Axis Controls</h2>
        
        {Object.keys(config.axes.limits).map((axis) => (
          <div 
            key={axis} 
            className="axis-control-group"
            role="group"
            aria-labelledby={`${axis}-axis-heading`}
          >
            <h3 id={`${axis}-axis-heading`}>
              {axis.toUpperCase()} Axis
            </h3>
            
            <div className="axis-display">
              <div 
                className="position-display"
                aria-live="polite"
                aria-atomic="true"
                role="status"
              >
                <span className="position-label">Current Position:</span>
                <span className="position-value" id={`${axis}-current-position`}>
                  {robotState[axis as keyof RobotState]} mm
                </span>
              </div>
              
              <div className="limits-display" id={`${axis}-limits`}>
                Limits: {config.axes.limits[axis].min} to {config.axes.limits[axis].max} mm
              </div>
            </div>
            
            <div className="jog-controls" role="group" aria-label={`${axis.toUpperCase()} axis jog controls`}>
              <button
                className="jog-btn jog-negative"
                onClick={() => jogAxis(axis, -1)}
                onMouseDown={() => startContinuousJog(axis, -1)}
                onMouseUp={stopContinuousJog}
                onMouseLeave={stopContinuousJog}
                disabled={!robotState.isConnected}
                aria-label={`Move ${axis.toUpperCase()} axis negative ${jogDistance} millimeters`}
                aria-describedby={`${axis}-current-position ${axis}-limits ${axis}-keyboard-hint`}
                data-axis={axis}
                data-direction="-1"
              >
                ← -{jogDistance}mm
              </button>
              
              <button
                className="jog-btn jog-positive"
                onClick={() => jogAxis(axis, 1)}
                onMouseDown={() => startContinuousJog(axis, 1)}
                onMouseUp={stopContinuousJog}
                onMouseLeave={stopContinuousJog}
                disabled={!robotState.isConnected}
                aria-label={`Move ${axis.toUpperCase()} axis positive ${jogDistance} millimeters`}
                aria-describedby={`${axis}-current-position ${axis}-limits ${axis}-keyboard-hint`}
                data-axis={axis}
                data-direction="1"
              >
                +{jogDistance}mm →
              </button>
              
              <div id={`${axis}-keyboard-hint`} className="keyboard-hint sr-only">
                {keyboardControlEnabled && getKeyboardHint(axis)}
              </div>
            </div>
          </div>
        ))}
      </section>
      
      {/* Comprehensive Keyboard Shortcuts Help */}
      <section 
        className="keyboard-help-section"
        role="region"
        aria-labelledby="keyboard-help-heading"
      >
        <h2 id="keyboard-help-heading">Keyboard Shortcuts</h2>
        
        <div className="shortcuts-grid">
          <div className="shortcut-category">
            <h3>Emergency Controls</h3>
            <div className="shortcut-list">
              <div className="shortcut-item emergency">
                <kbd>Esc</kbd>
                <span>Emergency Stop</span>
              </div>
              <div className="shortcut-item emergency">
                <kbd>F1</kbd>
                <span>Emergency Stop</span>
              </div>
              <div className="shortcut-item emergency">
                <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>
                <span>Emergency Stop</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd>+<kbd>H</kbd>
                <span>Home All Axes</span>
              </div>
            </div>
          </div>
          
          <div className="shortcut-category">
            <h3>Robot Control</h3>
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>Ctrl</kbd>+<kbd>K</kbd>
                <span>Toggle Keyboard Control</span>
              </div>
              <div className="shortcut-item">
                <kbd>↑</kbd><kbd>↓</kbd>
                <span>Y Axis Jog</span>
              </div>
              <div className="shortcut-item">
                <kbd>←</kbd><kbd>→</kbd>
                <span>X Axis Jog</span>
              </div>
              <div className="shortcut-item">
                <kbd>PgUp</kbd><kbd>PgDn</kbd>
                <span>Z Axis Jog</span>
              </div>
              <div className="shortcut-item">
                <kbd>Q</kbd><kbd>W</kbd>
                <span>A Axis Jog</span>
              </div>
              <div className="shortcut-item">
                <kbd>E</kbd><kbd>R</kbd>
                <span>B Axis Jog</span>
              </div>
              <div className="shortcut-item">
                <kbd>T</kbd><kbd>Y</kbd>
                <span>C Axis Jog</span>
              </div>
            </div>
          </div>
          
          <div className="shortcut-category">
            <h3>Jog Distances</h3>
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>1</kbd>
                <span>0.1mm</span>
              </div>
              <div className="shortcut-item">
                <kbd>2</kbd>
                <span>1mm</span>
              </div>
              <div className="shortcut-item">
                <kbd>3</kbd>
                <span>10mm</span>
              </div>
              <div className="shortcut-item">
                <kbd>4</kbd>
                <span>100mm</span>
              </div>
            </div>
          </div>
          
          <div className="shortcut-category">
            <h3>Navigation</h3>
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>Tab</kbd>
                <span>Next Control</span>
              </div>
              <div className="shortcut-item">
                <kbd>Shift</kbd>+<kbd>Tab</kbd>
                <span>Previous Control</span>
              </div>
              <div className="shortcut-item">
                <kbd>Enter</kbd>
                <span>Activate Button</span>
              </div>
              <div className="shortcut-item">
                <kbd>Space</kbd>
                <span>Toggle/Activate</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Position Management */}
      <section 
        className="position-management"
        role="region"
        aria-labelledby="position-management-heading"
      >
        <h2 id="position-management-heading">Position Management</h2>
        
        <div className="form-group">
          <label htmlFor="position-name">
            Position Name
          </label>
          <input
            id="position-name"
            type="text"
            value={savedPositionName}
            onChange={(e) => setSavedPositionName(e.target.value)}
            className="form-control"
            placeholder="Enter position name"
            aria-describedby="position-name-help"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && savedPositionName.trim()) {
                saveCurrentPosition();
              }
            }}
          />
          <div id="position-name-help" className="form-help">
            Give this position a descriptive name. Press Enter to save.
          </div>
        </div>
        
        <button
          className="btn btn-primary"
          onClick={saveCurrentPosition}
          disabled={!savedPositionName.trim() || !robotState.isConnected}
          aria-describedby="save-position-help"
        >
          Save Current Position
        </button>
        
        <div id="save-position-help" className="sr-only">
          Saves the current robot position with the specified name for later replay
        </div>
      </section>
      
      {/* Live Region for Announcements */}
      <div 
        aria-live="assertive" 
        aria-atomic="true" 
        className="sr-only"
        id="live-announcements"
      ></div>
      
      {/* Live Region for Status Updates */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        id="status-updates"
      ></div>
    </div>
  );
  
  // Helper function for keyboard hints
  const getKeyboardHint = (axis: string): string => {
    const keyMap: { [key: string]: string } = {
      'x': 'Left/Right Arrow Keys',
      'y': 'Up/Down Arrow Keys', 
      'z': 'Page Up/Page Down Keys',
      'a': 'Q/W Keys',
      'b': 'E/R Keys',
      'c': 'T/Y Keys'
    };
    return `Keyboard: ${keyMap[axis] || 'Not mapped'}`;
  };
  
  // Implementation of missing methods
  const jogAxis = async (axis: string, direction: number) => {
    try {
      const newValue = (robotState[axis as keyof RobotState] as number) + (direction * jogDistance);
      await axios.post("/api/manual/move", {
        [axis]: newValue
      });
      
      // Update state and announce change
      setRobotState(prev => ({ ...prev, [axis]: newValue }));
      
      // Announce position change to screen readers
      const announcement = `${axis.toUpperCase()} axis moved to ${newValue} millimeters`;
      announceToScreenReader(announcement);
      
    } catch (error) {
      console.error("Error jogging axis:", error);
      announceToScreenReader(`Error moving ${axis.toUpperCase()} axis`);
    }
  };
  
  const handleEmergencyStopClick = async () => {
    try {
      await axios.post("/api/emergency/stop");
      stopContinuousJog(); // Stop any ongoing jog operations
      announceToScreenReader("Emergency stop activated - all movement stopped");
    } catch (error) {
      console.error("Error triggering emergency stop:", error);
      announceToScreenReader("Error activating emergency stop");
    }
  };
  
  const homeAllAxes = async () => {
    try {
      await axios.post("/api/manual/home");
      announceToScreenReader("Homing all axes to zero position");
    } catch (error) {
      console.error("Error homing axes:", error);
      announceToScreenReader("Error homing axes");
    }
  };
  
  const saveCurrentPosition = async () => {
    try {
      await axios.post("/api/positions", {
        name: savedPositionName,
        axes: {
          x: robotState.x,
          y: robotState.y,
          z: robotState.z,
          a: robotState.a,
          b: robotState.b,
          c: robotState.c
        },
        manipulators: {
          gripper1: robotState.gripper
        }
      });
      
      announceToScreenReader(`Position "${savedPositionName}" saved successfully`);
      setSavedPositionName("");
      
    } catch (error) {
      console.error("Error saving position:", error);
      announceToScreenReader("Error saving position");
    }
  };
};

export default KeyboardAccessibleManualControl;
```

### 3. Modal Dialog Focus Management

```typescript
// AccessibleModal.tsx
import React, { useEffect, useRef, ReactNode } from 'react';
import { keyboardManager } from '../utils/KeyboardManager';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnEscape = true,
  closeOnClickOutside = true
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const trapFocusCleanupRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Trap focus in modal
      if (modalRef.current) {
        trapFocusCleanupRef.current = keyboardManager.trapFocus(modalRef.current);
      }
      
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
      
      // Add modal to accessibility tree
      document.body.setAttribute('aria-hidden', 'true');
      modalRef.current?.setAttribute('aria-hidden', 'false');
      
    } else {
      // Cleanup
      if (trapFocusCleanupRef.current) {
        trapFocusCleanupRef.current();
      }
      
      // Restore focus
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        previousFocusRef.current.focus();
      }
      
      // Restore scrolling
      document.body.style.overflow = '';
      
      // Remove modal from accessibility tree
      document.body.removeAttribute('aria-hidden');
    }
    
    return () => {
      if (trapFocusCleanupRef.current) {
        trapFocusCleanupRef.current();
      }
      document.body.style.overflow = '';
      document.body.removeAttribute('aria-hidden');
    };
  }, [isOpen]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeOnEscape, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="modal-overlay"
      onClick={closeOnClickOutside ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        ref={modalRef}
        className={`modal modal-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            type="button"
          >
            ×
          </button>
        </div>
        
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};
```

### 4. Enhanced CSS for Keyboard Navigation

```css
/* Enhanced keyboard navigation styles */

/* Focus indicators that meet WCAG requirements */
.btn:focus,
.form-control:focus,
.nav-tab:focus,
button:focus,
input:focus,
select:focus,
textarea:focus,
[tabindex]:focus {
  outline: 3px solid #005fcc;
  outline-offset: 2px;
  box-shadow: 0 0 0 1px #ffffff, 0 0 0 4px #005fcc;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .btn:focus,
  .form-control:focus,
  .nav-tab:focus,
  button:focus,
  input:focus,
  select:focus,
  textarea:focus,
  [tabindex]:focus {
    outline: 4px solid ButtonText;
    outline-offset: 2px;
    background: ButtonFace;
    border-color: ButtonText;
  }
}

/* Emergency stop gets special focus treatment */
.emergency-stop:focus {
  outline: 4px solid #ff0000;
  outline-offset: 3px;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 6px #ff0000, 0 0 10px rgba(255, 0, 0, 0.5);
}

/* Keyboard control mode indicator */
.keyboard-enhanced[data-keyboard-enabled="true"] {
  border: 2px solid #007bff;
}

.keyboard-enhanced[data-keyboard-enabled="true"]::before {
  content: "⌨️ Keyboard Control Active";
  position: fixed;
  top: 10px;
  right: 10px;
  background: #007bff;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 1000;
}

/* Skip links for keyboard navigation */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: #000000;
  color: #ffffff;
  padding: 8px;
  text-decoration: none;
  border-radius: 0 0 4px 4px;
  z-index: 2000;
}

.skip-link:focus {
  top: 0;
}

/* Keyboard shortcuts help */
.keyboard-help-section {
  border: 2px dashed #007bff;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  background: #f8f9fa;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 15px;
}

.shortcut-category h3 {
  color: #007bff;
  margin-bottom: 10px;
  border-bottom: 1px solid #007bff;
  padding-bottom: 5px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  background: white;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  margin-bottom: 4px;
}

.shortcut-item.emergency {
  background: #fff5f5;
  border-color: #fed7d7;
}

.shortcut-item kbd {
  background: #4a5568;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  font-weight: bold;
  min-width: 24px;
  text-align: center;
  border: 1px solid #2d3748;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.shortcut-item.emergency kbd {
  background: #c53030;
  border-color: #9b2c2c;
}

/* Jog controls keyboard enhancements */
.jog-btn[data-axis] {
  position: relative;
}

.jog-btn[data-axis]:focus::after {
  content: attr(data-axis) attr(data-direction);
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  margin-top: 2px;
  z-index: 100;
}

/* Live region styles (hidden but accessible) */
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

/* Status indicators with better accessibility */
.status-indicator {
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 600;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-indicator.connected {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-indicator.disconnected {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.status-indicator.enabled {
  background: #cce7ff;
  color: #0056b3;
  border: 1px solid #99d6ff;
}

.status-indicator.disabled {
  background: #f8f9fa;
  color: #6c757d;
  border: 1px solid #dee2e6;
}

/* Modal accessibility improvements */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  margin: 20px;
}

.modal-small { max-width: 400px; }
.modal-medium { max-width: 600px; }  
.modal-large { max-width: 800px; }

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8f9fa;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.modal-close:hover {
  background: #e2e8f0;
  color: #495057;
}

.modal-close:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

.modal-content {
  padding: 20px;
}

/* Reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  .modal,
  .status-indicator,
  .jog-btn,
  .btn {
    transition: none !important;
    animation: none !important;
  }
}
```

### 5. Testing Framework for Keyboard Navigation

```typescript
// keyboard-navigation.test.ts
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyboardAccessibleManualControl from '../components/KeyboardAccessibleManualControl';

describe('Keyboard Navigation', () => {
  let user: ReturnType<typeof userEvent.setup>;
  
  beforeEach(() => {
    user = userEvent.setup();
  });
  
  describe('Tab Navigation', () => {
    test('follows logical tab order', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      // Emergency stop should be first
      await user.tab();
      expect(screen.getByRole('button', { name: /emergency stop/i })).toHaveFocus();
      
      // Home button should be next
      await user.tab();
      expect(screen.getByRole('button', { name: /home all/i })).toHaveFocus();
      
      // Keyboard control toggle
      await user.tab();
      expect(screen.getByRole('button', { name: /keyboard robot control/i })).toHaveFocus();
      
      // Jog distance input
      await user.tab();
      expect(screen.getByLabelText(/jog distance/i)).toHaveFocus();
    });
    
    test('emergency stop is always accessible', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      const emergencyStop = screen.getByRole('button', { name: /emergency stop/i });
      
      // Should be focusable
      emergencyStop.focus();
      expect(emergencyStop).toHaveFocus();
      
      // Should be first in tab order
      await user.tab({ shift: true }); // Shift+tab backwards
      expect(emergencyStop).toHaveFocus();
    });
  });
  
  describe('Keyboard Shortcuts', () => {
    test('emergency stop responds to Escape key', async () => {
      const mockEmergencyStop = jest.fn();
      render(<KeyboardAccessibleManualControl 
        config={mockConfig} 
        socket={mockSocket}
        onEmergencyStop={mockEmergencyStop}
      />);
      
      await user.keyboard('{Escape}');
      expect(mockEmergencyStop).toHaveBeenCalled();
    });
    
    test('keyboard control toggle works', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      // Initially keyboard control should be disabled
      expect(screen.getByText(/keyboard control.*disabled/i)).toBeInTheDocument();
      
      // Press Ctrl+K to enable
      await user.keyboard('{Control>}k{/Control}');
      
      expect(screen.getByText(/keyboard control.*enabled/i)).toBeInTheDocument();
    });
    
    test('jog distance shortcuts work', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      const jogDistanceInput = screen.getByLabelText(/jog distance/i);
      
      // Test quick distance selection
      await user.keyboard('1');
      expect(jogDistanceInput).toHaveValue(0.1);
      
      await user.keyboard('2');
      expect(jogDistanceInput).toHaveValue(1);
      
      await user.keyboard('3');  
      expect(jogDistanceInput).toHaveValue(10);
      
      await user.keyboard('4');
      expect(jogDistanceInput).toHaveValue(100);
    });
    
    test('axis jogging with arrow keys', async () => {
      const mockJogAxis = jest.fn();
      render(<KeyboardAccessibleManualControl 
        config={mockConfig} 
        socket={mockSocket}
        onJogAxis={mockJogAxis}
      />);
      
      // Enable keyboard control first
      await user.keyboard('{Control>}k{/Control}');
      
      // Test arrow key jogging
      await user.keyboard('{ArrowUp}');
      expect(mockJogAxis).toHaveBeenCalledWith('y', 1);
      
      await user.keyboard('{ArrowDown}');
      expect(mockJogAxis).toHaveBeenCalledWith('y', -1);
      
      await user.keyboard('{ArrowLeft}');
      expect(mockJogAxis).toHaveBeenCalledWith('x', -1);
      
      await user.keyboard('{ArrowRight}');
      expect(mockJogAxis).toHaveBeenCalledWith('x', 1);
    });
  });
  
  describe('Focus Management', () => {
    test('modal dialogs trap focus correctly', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      // Open save position modal
      const saveButton = screen.getByRole('button', { name: /save current position/i });
      await user.click(saveButton);
      
      const modal = screen.getByRole('dialog');
      const modalButtons = within(modal).getAllByRole('button');
      const firstButton = modalButtons[0];
      const lastButton = modalButtons[modalButtons.length - 1];
      
      // Focus should be in modal
      expect(firstButton).toHaveFocus();
      
      // Tab to last button
      for (let i = 0; i < modalButtons.length - 1; i++) {
        await user.tab();
      }
      expect(lastButton).toHaveFocus();
      
      // Tab again should wrap to first
      await user.tab();
      expect(firstButton).toHaveFocus();
      
      // Shift+Tab should go to last
      await user.tab({ shift: true });
      expect(lastButton).toHaveFocus();
    });
    
    test('focus returns after modal closes', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      const saveButton = screen.getByRole('button', { name: /save current position/i });
      saveButton.focus();
      expect(saveButton).toHaveFocus();
      
      // Open modal
      await user.click(saveButton);
      const modal = screen.getByRole('dialog');
      
      // Close modal with Escape
      await user.keyboard('{Escape}');
      
      // Focus should return to save button
      expect(saveButton).toHaveFocus();
    });
  });
  
  describe('Screen Reader Announcements', () => {
    test('position changes are announced', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      const liveRegion = screen.getByRole('status');
      
      // Enable keyboard control
      await user.keyboard('{Control>}k{/Control}');
      
      // Simulate axis movement
      await user.keyboard('{ArrowUp}');
      
      await waitFor(() => {
        expect(liveRegion).toHaveTextContent(/y axis moved to/i);
      });
    });
    
    test('emergency stop is announced', async () => {
      render(<KeyboardAccessibleManualControl config={mockConfig} socket={mockSocket} />);
      
      const alertRegion = screen.getByRole('alert');
      
      await user.keyboard('{Escape}');
      
      await waitFor(() => {
        expect(alertRegion).toHaveTextContent(/emergency stop activated/i);
      });
    });
  });
});
```

This comprehensive keyboard navigation framework ensures that all critical robot control functions are accessible to users who rely on keyboard-only interaction, meeting WCAG 2.1 Level AA requirements while maintaining industrial safety standards.