# Universal Accessibility Implementation Guide
## Complete WCAG 2.1 Level AA Compliance Framework

### Executive Summary

This comprehensive implementation guide provides ready-to-deploy solutions for achieving universal accessibility in the Arctos Robot Controller application. The framework addresses all WCAG 2.1 Level AA success criteria while maintaining industrial robotic control functionality and safety requirements.

## 📋 Implementation Checklist

### ✅ **Phase 1: Critical Accessibility Foundation (Week 1-2)**

#### Emergency Stop Accessibility (CRITICAL)
- [ ] **Keyboard Emergency Stop** - Escape, F1, Ctrl+Shift+E shortcuts
- [ ] **Screen Reader Announcements** - "Emergency stop activated" alerts  
- [ ] **Visual Prominence** - High contrast, large target size
- [ ] **Focus Management** - Always first in tab order
- [ ] **Voice Control** - "Emergency stop" command recognition

#### Form Labeling and ARIA (CRITICAL)
- [ ] **All Form Controls Labeled** - Explicit labels with htmlFor
- [ ] **ARIA Attributes** - aria-describedby for help text
- [ ] **Required Field Indicators** - Visual and programmatic
- [ ] **Error Message Association** - aria-invalid and role="alert"
- [ ] **Fieldset Grouping** - Related controls properly grouped

#### Real-time Communication (CRITICAL)
- [ ] **Live Regions** - Position updates announced to screen readers
- [ ] **Status Changes** - Connection state changes announced
- [ ] **Error Notifications** - Critical errors announced immediately
- [ ] **Progress Updates** - G-code execution progress accessible

### ✅ **Phase 2: Core Interaction Accessibility (Week 3-4)**

#### Complete Keyboard Navigation
- [ ] **All Controls Accessible** - No mouse-only functionality
- [ ] **Logical Tab Order** - Emergency → Primary → Secondary controls
- [ ] **Focus Indicators** - 3:1 contrast ratio, visible borders
- [ ] **Keyboard Shortcuts** - Industrial-appropriate hotkeys
- [ ] **Focus Management** - Modal trapping, restoration

#### Robot Control Accessibility  
- [ ] **Jog Controls** - Keyboard accessible with arrow keys
- [ ] **Position Display** - Screen reader compatible values
- [ ] **Axis Limits** - Announced to assistive technologies
- [ ] **Continuous Jogging** - Keyboard hold/release support
- [ ] **Position Saving** - Fully accessible workflow

#### Mobile Touch Accessibility
- [ ] **Touch Targets** - Minimum 44x44 pixel size
- [ ] **Gesture Alternatives** - Keyboard alternatives provided
- [ ] **Screen Reader Mobile** - TalkBack/VoiceOver compatibility
- [ ] **Orientation Support** - Portrait/landscape flexibility
- [ ] **Zoom Compatibility** - 200% zoom without horizontal scroll

### ✅ **Phase 3: Enhanced Accessibility Features (Week 5-6)**

#### Visual Accessibility
- [ ] **Color Contrast** - All elements meet 4.5:1 or 3:1 requirements
- [ ] **High Contrast Mode** - Windows high contrast support
- [ ] **Color Independence** - Information not conveyed by color alone
- [ ] **Text Scaling** - Readable at 200% zoom
- [ ] **Dark Mode** - Accessible dark theme implementation

#### Advanced Screen Reader Support
- [ ] **Semantic Markup** - Proper heading hierarchy (H1-H6)
- [ ] **Landmark Regions** - Navigation, main, complementary roles
- [ ] **Table Headers** - Complex data tables properly marked up
- [ ] **Form Instructions** - Clear, comprehensive guidance
- [ ] **Dynamic Content** - Live regions for all updates

## 🚀 **Ready-to-Deploy Components**

### 1. Universal Emergency Stop Component

```typescript
// UniversalEmergencyStop.tsx
import React, { useEffect, useCallback } from 'react';

interface EmergencyStopProps {
  onEmergencyStop: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export const UniversalEmergencyStop: React.FC<EmergencyStopProps> = ({
  onEmergencyStop,
  disabled = false,
  className = ''
}) => {
  const [isActivating, setIsActivating] = React.useState(false);

  const handleEmergencyStop = useCallback(async () => {
    if (isActivating || disabled) return;
    
    setIsActivating(true);
    
    try {
      await onEmergencyStop();
      
      // Announce to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'alert');
      announcement.setAttribute('aria-live', 'assertive');
      announcement.textContent = 'Emergency stop activated. All robot movement has been stopped.';
      announcement.className = 'sr-only';
      document.body.appendChild(announcement);
      
      setTimeout(() => document.body.removeChild(announcement), 3000);
      
    } catch (error) {
      console.error('Emergency stop failed:', error);
      
      // Announce error to screen readers
      const errorAnnouncement = document.createElement('div');
      errorAnnouncement.setAttribute('role', 'alert');
      errorAnnouncement.setAttribute('aria-live', 'assertive');
      errorAnnouncement.textContent = 'Emergency stop failed. Please use manual safety controls.';
      errorAnnouncement.className = 'sr-only';
      document.body.appendChild(errorAnnouncement);
      
      setTimeout(() => document.body.removeChild(errorAnnouncement), 5000);
    }
    
    setIsActivating(false);
  }, [onEmergencyStop, isActivating, disabled]);

  // Global keyboard listeners for emergency stop
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Emergency stop shortcuts
      if (event.key === 'Escape' || 
          event.key === 'F1' || 
          (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e')) {
        event.preventDefault();
        event.stopPropagation();
        handleEmergencyStop();
      }
    };

    // Add global listener with high priority
    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleEmergencyStop]);

  return (
    <button
      className={`emergency-stop ${className} ${isActivating ? 'activating' : ''}`}
      onClick={handleEmergencyStop}
      disabled={disabled || isActivating}
      aria-label="Emergency Stop - Immediately stops all robot movement"
      aria-describedby="emergency-stop-help"
      aria-keyshortcuts="Escape F1 Control+Shift+E"
      tabIndex={0}
      autoFocus
      type="button"
      data-testid="emergency-stop"
    >
      <span className="emergency-icon" aria-hidden="true">
        🛑
      </span>
      <span className="emergency-text">
        {isActivating ? 'STOPPING...' : 'EMERGENCY STOP'}
      </span>
      
      <div id="emergency-stop-help" className="sr-only">
        Immediately stops all robot movement and operations. 
        Can be activated with Escape key, F1 key, or Control+Shift+E keyboard shortcut.
        Always available regardless of current focus.
      </div>
    </button>
  );
};
```

### 2. Accessible Robot Jog Controls

```typescript
// AccessibleJogControls.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface JogControlsProps {
  axis: string;
  currentPosition: number;
  limits: { min: number; max: number };
  jogDistance: number;
  onJog: (axis: string, direction: number, distance: number) => Promise<void>;
  disabled?: boolean;
  unit?: string;
}

export const AccessibleJogControls: React.FC<JogControlsProps> = ({
  axis,
  currentPosition,
  limits,
  jogDistance,
  onJog,
  disabled = false,
  unit = 'mm'
}) => {
  const [isJogging, setIsJogging] = useState<number | null>(null);
  const [lastAnnouncement, setLastAnnouncement] = useState<string>('');
  const jogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const positionRef = useRef<HTMLDivElement>(null);

  const startJogging = useCallback(async (direction: number) => {
    if (isJogging || disabled) return;
    
    setIsJogging(direction);
    
    // Immediate first jog
    try {
      await onJog(axis, direction, jogDistance);
    } catch (error) {
      console.error('Jog error:', error);
      setIsJogging(null);
      return;
    }
    
    // Start continuous jogging
    jogIntervalRef.current = setInterval(async () => {
      try {
        await onJog(axis, direction, jogDistance);
      } catch (error) {
        console.error('Continuous jog error:', error);
        stopJogging();
      }
    }, 200); // 5Hz update rate
    
  }, [axis, direction, jogDistance, onJog, isJogging, disabled]);

  const stopJogging = useCallback(() => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    setIsJogging(null);
  }, []);

  const singleJog = useCallback(async (direction: number) => {
    if (disabled) return;
    
    try {
      await onJog(axis, direction, jogDistance);
      
      const newPosition = currentPosition + (direction * jogDistance);
      const announcement = `${axis.toUpperCase()} axis moved to ${newPosition.toFixed(2)} ${unit}`;
      setLastAnnouncement(announcement);
      
    } catch (error) {
      console.error('Single jog error:', error);
      setLastAnnouncement(`Error moving ${axis.toUpperCase()} axis`);
    }
  }, [axis, currentPosition, jogDistance, onJog, unit, disabled]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || document.activeElement?.closest('.jog-controls') !== document.activeElement?.closest(`[data-axis="${axis}"]`)) {
        return;
      }
      
      let direction = 0;
      
      // Map keys to directions based on axis
      switch (axis.toLowerCase()) {
        case 'x':
          if (event.key === 'ArrowLeft') direction = -1;
          if (event.key === 'ArrowRight') direction = 1;
          break;
        case 'y':
          if (event.key === 'ArrowUp') direction = 1;
          if (event.key === 'ArrowDown') direction = -1;
          break;
        case 'z':
          if (event.key === 'PageUp') direction = 1;
          if (event.key === 'PageDown') direction = -1;
          break;
        case 'a':
          if (event.key.toLowerCase() === 'q') direction = -1;
          if (event.key.toLowerCase() === 'w') direction = 1;
          break;
        case 'b':
          if (event.key.toLowerCase() === 'e') direction = -1;
          if (event.key.toLowerCase() === 'r') direction = 1;
          break;
        case 'c':
          if (event.key.toLowerCase() === 't') direction = -1;
          if (event.key.toLowerCase() === 'y') direction = 1;
          break;
      }
      
      if (direction !== 0 && !isJogging) {
        event.preventDefault();
        if (event.repeat) {
          startJogging(direction);
        } else {
          singleJog(direction);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const keyMappings = {
        'x': ['ArrowLeft', 'ArrowRight'],
        'y': ['ArrowUp', 'ArrowDown'], 
        'z': ['PageUp', 'PageDown'],
        'a': ['q', 'w'],
        'b': ['e', 'r'],
        'c': ['t', 'y']
      };
      
      const axisKeys = keyMappings[axis.toLowerCase() as keyof typeof keyMappings];
      if (axisKeys && axisKeys.includes(event.key) || axisKeys && axisKeys.includes(event.key.toLowerCase())) {
        stopJogging();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      stopJogging();
    };
  }, [axis, isJogging, startJogging, stopJogging, singleJog, disabled]);

  const getKeyboardHint = () => {
    const keyMaps: { [key: string]: string } = {
      'x': 'Left/Right Arrow Keys',
      'y': 'Up/Down Arrow Keys',
      'z': 'Page Up/Page Down Keys', 
      'a': 'Q/W Keys',
      'b': 'E/R Keys',
      'c': 'T/Y Keys'
    };
    return keyMaps[axis.toLowerCase()] || 'No keyboard mapping';
  };

  const isAtLimit = (direction: number) => {
    if (direction > 0) {
      return currentPosition >= limits.max;
    } else {
      return currentPosition <= limits.min;
    }
  };

  return (
    <div 
      className="jog-controls accessible"
      data-axis={axis}
      role="group"
      aria-labelledby={`${axis}-axis-heading`}
    >
      <h3 id={`${axis}-axis-heading`} className="axis-heading">
        {axis.toUpperCase()} Axis Control
      </h3>
      
      {/* Current Position Display */}
      <div 
        className="position-display"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        ref={positionRef}
        id={`${axis}-current-position`}
      >
        <span className="position-label">Current Position:</span>
        <span className="position-value">
          {currentPosition.toFixed(2)} {unit}
        </span>
      </div>
      
      {/* Axis Limits */}
      <div className="limits-display" id={`${axis}-limits`}>
        <span className="limits-label">Range:</span>
        <span className="limits-values">
          {limits.min} to {limits.max} {unit}
        </span>
      </div>
      
      {/* Jog Controls */}
      <div className="jog-buttons" role="group" aria-label={`${axis.toUpperCase()} axis jog controls`}>
        <button
          className={`jog-btn jog-negative ${isJogging === -1 ? 'jogging' : ''}`}
          onClick={() => singleJog(-1)}
          onMouseDown={() => startJogging(-1)}
          onMouseUp={stopJogging}
          onMouseLeave={stopJogging}
          disabled={disabled || isAtLimit(-1)}
          aria-label={`Move ${axis.toUpperCase()} axis negative ${jogDistance} ${unit}`}
          aria-describedby={`${axis}-current-position ${axis}-limits ${axis}-keyboard-hint`}
          data-direction="-1"
          tabIndex={0}
        >
          <span className="jog-direction" aria-hidden="true">←</span>
          <span className="jog-amount">-{jogDistance}{unit}</span>
        </button>
        
        <button
          className={`jog-btn jog-positive ${isJogging === 1 ? 'jogging' : ''}`}
          onClick={() => singleJog(1)}
          onMouseDown={() => startJogging(1)}
          onMouseUp={stopJogging}
          onMouseLeave={stopJogging}
          disabled={disabled || isAtLimit(1)}
          aria-label={`Move ${axis.toUpperCase()} axis positive ${jogDistance} ${unit}`}
          aria-describedby={`${axis}-current-position ${axis}-limits ${axis}-keyboard-hint`}
          data-direction="1"
          tabIndex={0}
        >
          <span className="jog-amount">+{jogDistance}{unit}</span>
          <span className="jog-direction" aria-hidden="true">→</span>
        </button>
      </div>
      
      {/* Keyboard Hint */}
      <div id={`${axis}-keyboard-hint`} className="keyboard-hint">
        <span className="sr-only">
          Keyboard shortcut: {getKeyboardHint()}. 
          Hold key for continuous movement, tap for single step.
        </span>
        <span className="keyboard-hint-visible">
          ⌨️ {getKeyboardHint()}
        </span>
      </div>
      
      {/* Live Region for Announcements */}
      {lastAnnouncement && (
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {lastAnnouncement}
        </div>
      )}
    </div>
  );
};
```

### 3. Comprehensive Form Accessibility Framework

```typescript
// AccessibleForm.tsx
import React, { useId, ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
}

export const AccessibleFormField: React.FC<FormFieldProps> = ({
  label,
  children,
  required = false,
  error,
  help,
  className = ''
}) => {
  const fieldId = useId();
  const helpId = help ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ');

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      <label 
        htmlFor={fieldId} 
        className={`form-label ${required ? 'required' : ''}`}
      >
        {label}
        {required && (
          <span className="required-indicator" aria-label="required">
            *
          </span>
        )}
      </label>
      
      <div className="form-control-wrapper">
        {React.cloneElement(children as React.ReactElement, {
          id: fieldId,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? 'true' : undefined,
          'aria-required': required ? 'true' : undefined,
          className: `form-control ${error ? 'is-invalid' : ''}`
        })}
        
        {help && (
          <div id={helpId} className="form-help">
            {help}
          </div>
        )}
        
        {error && (
          <div 
            id={errorId} 
            className="form-error" 
            role="alert"
            aria-live="polite"
          >
            <span className="error-icon" aria-hidden="true">⚠️</span>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// Usage Example
export const RobotConfigForm: React.FC = () => {
  const [config, setConfig] = useState({
    robotType: '',
    serialPort: '',
    baudRate: 9600
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form className="robot-config-form" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Robot Communication Settings</legend>
        
        <AccessibleFormField
          label="Robot Type"
          required
          error={errors.robotType}
          help="Select the type of robot you're connecting to"
        >
          <select
            value={config.robotType}
            onChange={(e) => setConfig(prev => ({ ...prev, robotType: e.target.value }))}
          >
            <option value="">Select robot type</option>
            <option value="6-axis">6-Axis Industrial Robot</option>
            <option value="scara">SCARA Robot</option>
            <option value="delta">Delta Robot</option>
          </select>
        </AccessibleFormField>
        
        <AccessibleFormField
          label="Serial Port"
          required
          error={errors.serialPort}
          help="Enter the serial port path (e.g., COM1 on Windows, /dev/ttyUSB0 on Linux)"
        >
          <input
            type="text"
            value={config.serialPort}
            onChange={(e) => setConfig(prev => ({ ...prev, serialPort: e.target.value }))}
            placeholder="e.g., COM1 or /dev/ttyUSB0"
          />
        </AccessibleFormField>
        
        <AccessibleFormField
          label="Baud Rate"
          error={errors.baudRate}
          help="Communication speed in bits per second"
        >
          <select
            value={config.baudRate}
            onChange={(e) => setConfig(prev => ({ ...prev, baudRate: Number(e.target.value) }))}
          >
            <option value={9600}>9600</option>
            <option value={19200}>19200</option>
            <option value={38400}>38400</option>
            <option value={57600}>57600</option>
            <option value={115200}>115200</option>
          </select>
        </AccessibleFormField>
      </fieldset>
      
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Save Configuration
        </button>
        <button type="reset" className="btn btn-secondary">
          Reset to Defaults
        </button>
      </div>
    </form>
  );
};
```

### 4. Accessible Modal Dialog System

```typescript
// AccessibleModal.tsx
import React, { useEffect, useRef, ReactNode, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
  initialFocus?: HTMLElement | null;
}

export const AccessibleModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnEscape = true,
  closeOnClickOutside = true,
  initialFocus
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusableElementsRef = useRef<HTMLElement[]>([]);

  // Focus trap implementation
  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
    ) as NodeListOf<HTMLElement>;
    
    focusableElementsRef.current = Array.from(focusableElements);
    const firstElement = focusableElementsRef.current[0];
    const lastElement = focusableElementsRef.current[focusableElementsRef.current.length - 1];

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
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Set aria-hidden on all other elements
      const allElements = document.querySelectorAll('body > *:not([data-modal-portal])');
      allElements.forEach(el => el.setAttribute('aria-hidden', 'true'));
      
      // Focus management
      setTimeout(() => {
        const focusTarget = initialFocus || titleRef.current || modalRef.current;
        focusTarget?.focus();
      }, 0);
      
      // Setup focus trap
      let cleanupFocusTrap: (() => void) | undefined;
      if (modalRef.current) {
        cleanupFocusTrap = trapFocus(modalRef.current);
      }
      
      return () => {
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Remove aria-hidden from all elements
        allElements.forEach(el => el.removeAttribute('aria-hidden'));
        
        // Cleanup focus trap
        cleanupFocusTrap?.();
        
        // Restore focus
        if (previousFocusRef.current && previousFocusRef.current.isConnected) {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, initialFocus, trapFocus]);

  // Keyboard event handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (closeOnClickOutside && event.target === event.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div 
      className="modal-overlay"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div 
        ref={modalRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-testid="modal-dialog"
      >
        <div className="modal-header">
          <h2 
            ref={titleRef}
            id="modal-title" 
            className="modal-title"
            tabIndex={-1}
          >
            {title}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={`Close ${title} dialog`}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );

  // Create portal to prevent z-index issues
  const modalPortal = document.getElementById('modal-portal') || (() => {
    const portal = document.createElement('div');
    portal.id = 'modal-portal';
    portal.setAttribute('data-modal-portal', 'true');
    document.body.appendChild(portal);
    return portal;
  })();

  return createPortal(modalContent, modalPortal);
};

// Usage Example with Position Save Modal
export const PositionSaveModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  currentPosition: Record<string, number>;
}> = ({ isOpen, onClose, onSave, currentPosition }) => {
  const [positionName, setPositionName] = useState('');
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!positionName.trim()) {
      setError('Position name is required');
      return;
    }
    
    onSave(positionName.trim());
    setPositionName('');
    setError('');
    onClose();
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Save Current Position"
      size="medium"
      initialFocus={nameInputRef.current}
    >
      <form onSubmit={handleSave}>
        <div className="current-position-summary">
          <h3>Current Position Values</h3>
          <div className="position-values">
            {Object.entries(currentPosition).map(([axis, value]) => (
              <div key={axis} className="position-value">
                <strong>{axis.toUpperCase()}:</strong> {value.toFixed(2)}mm
              </div>
            ))}
          </div>
        </div>
        
        <AccessibleFormField
          label="Position Name"
          required
          error={error}
          help="Enter a descriptive name for this position"
        >
          <input
            ref={nameInputRef}
            type="text"
            value={positionName}
            onChange={(e) => {
              setPositionName(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g., Home Position, Pick Point 1"
            autoComplete="off"
          />
        </AccessibleFormField>
        
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary">
            Save Position
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
};
```

## 🎯 **Comprehensive Testing Framework**

### Automated Accessibility Testing

```typescript
// accessibility-test-suite.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { getContrastRatio } from '../utils/colorUtils';

expect.extend(toHaveNoViolations);

describe('Universal Accessibility Compliance', () => {
  describe('Emergency Stop Accessibility', () => {
    test('emergency stop meets all accessibility requirements', async () => {
      const mockEmergencyStop = jest.fn();
      render(<UniversalEmergencyStop onEmergencyStop={mockEmergencyStop} />);
      
      const emergencyButton = screen.getByTestId('emergency-stop');
      
      // Test ARIA attributes
      expect(emergencyButton).toHaveAttribute('aria-label');
      expect(emergencyButton).toHaveAttribute('aria-describedby');
      expect(emergencyButton).toHaveAttribute('aria-keyshortcuts');
      
      // Test keyboard shortcuts
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockEmergencyStop).toHaveBeenCalled();
      
      fireEvent.keyDown(document, { key: 'F1' });
      expect(mockEmergencyStop).toHaveBeenCalledTimes(2);
      
      fireEvent.keyDown(document, { key: 'e', ctrlKey: true, shiftKey: true });
      expect(mockEmergencyStop).toHaveBeenCalledTimes(3);
      
      // Test focus management
      expect(emergencyButton).toHaveFocus();
      expect(emergencyButton.tabIndex).toBe(0);
    });
    
    test('emergency stop announcements work correctly', async () => {
      const mockEmergencyStop = jest.fn().mockResolvedValue(undefined);
      render(<UniversalEmergencyStop onEmergencyStop={mockEmergencyStop} />);
      
      const emergencyButton = screen.getByTestId('emergency-stop');
      fireEvent.click(emergencyButton);
      
      await waitFor(() => {
        const alerts = document.querySelectorAll('[role="alert"]');
        expect(alerts.length).toBeGreaterThan(0);
        expect(alerts[0]).toHaveTextContent(/emergency stop activated/i);
      });
    });
  });

  describe('Jog Controls Accessibility', () => {
    test('jog controls are fully keyboard accessible', async () => {
      const mockJog = jest.fn();
      render(
        <AccessibleJogControls
          axis="x"
          currentPosition={10}
          limits={{ min: -100, max: 100 }}
          jogDistance={1}
          onJog={mockJog}
        />
      );
      
      // Test ARIA structure
      expect(screen.getByRole('group')).toHaveAttribute('aria-labelledby');
      expect(screen.getByRole('status')).toBeInTheDocument();
      
      // Test keyboard navigation
      const negativeButton = screen.getByLabelText(/move x axis negative/i);
      negativeButton.focus();
      
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(mockJog).toHaveBeenCalledWith('x', -1, 1);
      
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(mockJog).toHaveBeenCalledWith('x', 1, 1);
    });
    
    test('position updates are announced to screen readers', async () => {
      const mockJog = jest.fn().mockResolvedValue(undefined);
      const { rerender } = render(
        <AccessibleJogControls
          axis="x"
          currentPosition={10}
          limits={{ min: -100, max: 100 }}
          jogDistance={1}
          onJog={mockJog}
        />
      );
      
      // Simulate position change
      rerender(
        <AccessibleJogControls
          axis="x"
          currentPosition={11}
          limits={{ min: -100, max: 100 }}
          jogDistance={1}
          onJog={mockJog}
        />
      );
      
      expect(screen.getByRole('status')).toHaveTextContent('11.00 mm');
    });
  });

  describe('Form Accessibility', () => {
    test('form fields have proper labels and descriptions', () => {
      render(
        <AccessibleFormField
          label="Robot Type"
          required
          help="Select the type of robot"
          error="This field is required"
        >
          <select>
            <option value="">Select...</option>
          </select>
        </AccessibleFormField>
      );
      
      const select = screen.getByRole('combobox');
      
      // Test label association
      expect(select).toHaveAccessibleName('Robot Type');
      expect(select).toHaveAttribute('aria-required', 'true');
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAttribute('aria-describedby');
      
      // Test error announcement
      expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
    });
  });

  describe('Modal Accessibility', () => {
    test('modal dialogs trap focus correctly', async () => {
      const user = userEvent.setup();
      let isOpen = true;
      const onClose = jest.fn(() => { isOpen = false; });
      
      const { rerender } = render(
        <AccessibleModal
          isOpen={isOpen}
          onClose={onClose}
          title="Test Modal"
        >
          <button>First Button</button>
          <button>Last Button</button>
        </AccessibleModal>
      );
      
      // Test ARIA attributes
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
      
      // Test focus trap
      const buttons = screen.getAllByRole('button');
      const firstButton = buttons[0]; // Close button in header
      const lastButton = buttons[buttons.length - 1];
      
      firstButton.focus();
      await user.tab();
      await user.tab(); // Move to last focusable element
      
      // Tab should wrap to first element
      await user.tab();
      expect(firstButton).toHaveFocus();
      
      // Shift+Tab should wrap to last element  
      await user.tab({ shift: true });
      expect(lastButton).toHaveFocus();
      
      // Test Escape key
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Color Contrast Compliance', () => {
    test('all text elements meet WCAG contrast requirements', () => {
      const { container } = render(<App />);
      
      // Test critical elements
      const statusElements = container.querySelectorAll('.status-indicator');
      statusElements.forEach(element => {
        const styles = getComputedStyle(element);
        const contrast = getContrastRatio(styles.color, styles.backgroundColor);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      });
      
      const buttons = container.querySelectorAll('.btn');
      buttons.forEach(button => {
        const styles = getComputedStyle(button);
        const contrast = getContrastRatio(styles.color, styles.backgroundColor);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

  describe('Screen Reader Compatibility', () => {
    test('live regions announce important changes', async () => {
      render(<ManualControl config={mockConfig} socket={mockSocket} />);
      
      // Test connection status changes
      act(() => {
        mockSocket.emit('disconnect');
      });
      
      await waitFor(() => {
        const liveRegions = screen.getAllByLabelText(/status/i);
        expect(liveRegions.some(region => 
          region.textContent?.includes('disconnected')
        )).toBe(true);
      });
    });
  });

  describe('Comprehensive axe-core Testing', () => {
    test('entire application has no accessibility violations', async () => {
      const { container } = render(<App />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
    
    test('individual components pass accessibility tests', async () => {
      const components = [
        <UniversalEmergencyStop onEmergencyStop={jest.fn()} />,
        <AccessibleJogControls 
          axis="x" 
          currentPosition={0} 
          limits={{ min: -100, max: 100 }}
          jogDistance={1}
          onJog={jest.fn()}
        />,
        <AccessibleFormField label="Test Field">
          <input type="text" />
        </AccessibleFormField>
      ];
      
      for (const component of components) {
        const { container } = render(component);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      }
    });
  });
});
```

## 📊 **Implementation Metrics & Monitoring**

### Accessibility Compliance Dashboard

```typescript
// AccessibilityDashboard.tsx
export const AccessibilityDashboard: React.FC = () => {
  const [complianceData, setComplianceData] = useState({
    wcagCompliance: 0,
    keyboardAccessibility: 0,
    colorContrast: 0,
    screenReaderCompatibility: 0,
    mobileAccessibility: 0
  });

  useEffect(() => {
    // Run comprehensive accessibility audit
    const runAudit = async () => {
      const results = await Promise.all([
        auditWCAGCompliance(),
        auditKeyboardAccessibility(),
        auditColorContrast(),
        auditScreenReaderCompatibility(),
        auditMobileAccessibility()
      ]);
      
      setComplianceData({
        wcagCompliance: results[0],
        keyboardAccessibility: results[1],
        colorContrast: results[2],
        screenReaderCompatibility: results[3],
        mobileAccessibility: results[4]
      });
    };

    runAudit();
  }, []);

  return (
    <div className="accessibility-dashboard">
      <h2>Accessibility Compliance Status</h2>
      
      <div className="compliance-metrics">
        <div className="metric-card">
          <h3>WCAG 2.1 Level AA</h3>
          <div className="metric-score">
            <span className="score">{complianceData.wcagCompliance}%</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${complianceData.wcagCompliance}%` }}
              />
            </div>
          </div>
        </div>
        
        <div className="metric-card">
          <h3>Keyboard Navigation</h3>
          <div className="metric-score">
            <span className="score">{complianceData.keyboardAccessibility}%</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${complianceData.keyboardAccessibility}%` }}
              />
            </div>
          </div>
        </div>
        
        <div className="metric-card">
          <h3>Color Contrast</h3>
          <div className="metric-score">
            <span className="score">{complianceData.colorContrast}%</span>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${complianceData.colorContrast}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="compliance-actions">
        <button className="btn btn-primary" onClick={exportComplianceReport}>
          Export Compliance Report
        </button>
        <button className="btn btn-secondary" onClick={scheduleAccessibilityAudit}>
          Schedule Regular Audits
        </button>
      </div>
    </div>
  );
};
```

## 🎯 **Final Implementation Checklist**

### ✅ **Deployment Readiness Checklist**

#### Critical Safety Features
- [ ] Emergency stop accessible via Escape, F1, Ctrl+Shift+E
- [ ] Emergency stop always first in tab order
- [ ] Emergency stop has high contrast visual design
- [ ] Emergency stop announces to screen readers
- [ ] All safety controls keyboard accessible

#### Core Functionality Access
- [ ] All robot controls operable via keyboard
- [ ] Position values announced to screen readers
- [ ] Form controls properly labeled and described
- [ ] Modal dialogs trap focus correctly
- [ ] Real-time updates use live regions

#### Visual Accessibility
- [ ] All text meets 4.5:1 contrast minimum
- [ ] UI components meet 3:1 contrast minimum
- [ ] Focus indicators meet 3:1 contrast minimum
- [ ] High contrast mode supported
- [ ] Information not conveyed by color alone

#### Mobile & Touch
- [ ] Touch targets minimum 44x44 pixels
- [ ] All gestures have keyboard alternatives
- [ ] Mobile screen readers supported
- [ ] Works in portrait and landscape
- [ ] 200% zoom compatibility

#### Testing & Validation
- [ ] All axe-core violations resolved
- [ ] Manual screen reader testing passed
- [ ] Keyboard-only testing passed
- [ ] High contrast mode testing passed
- [ ] Mobile accessibility testing passed

### **Success Metrics**

**Target Compliance Scores:**
- WCAG 2.1 Level AA: 95%+
- Keyboard Accessibility: 100%
- Color Contrast: 95%+  
- Screen Reader Compatibility: 90%+
- Mobile Accessibility: 85%+

**User Experience Metrics:**
- Emergency stop accessible within 2 key presses
- All core functions accessible via keyboard
- Screen reader users can complete all tasks
- 200% zoom maintains full functionality
- High contrast mode preserves all features

This comprehensive implementation guide provides everything needed to achieve universal accessibility in the Arctos Robot Controller while maintaining industrial safety standards and operational efficiency.