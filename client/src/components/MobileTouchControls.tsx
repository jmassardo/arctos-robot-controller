import React, { useState, useRef, useEffect } from 'react';
import { useDeviceInfo, TouchGestureHandler, hapticFeedback } from '../utils/mobileUtils';

interface TouchJoystickProps {
  onMove: (x: number, y: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  size?: number;
  maxDistance?: number;
  returnToCenter?: boolean;
  hapticEnabled?: boolean;
  disabled?: boolean;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({
  onMove,
  onStart,
  onEnd,
  size = 120,
  maxDistance = 50,
  returnToCenter = true,
  hapticEnabled = true,
  disabled = false
}) => {
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const deviceInfo = useDeviceInfo();

  const handleStart = (x: number, y: number) => {
    if (disabled) return;
    
    setIsDragging(true);
    if (hapticEnabled) {
      hapticFeedback.light();
    }
    onStart?.();
  };

  const handleMove = (x: number, y: number) => {
    if (!isDragging || disabled) return;

    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = x - centerX;
    const deltaY = y - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Constrain to max distance
    const constrainedX = distance > maxDistance ? (deltaX / distance) * maxDistance : deltaX;
    const constrainedY = distance > maxDistance ? (deltaY / distance) * maxDistance : deltaY;

    setKnobPosition({ x: constrainedX, y: constrainedY });
    
    // Normalize values (-1 to 1)
    const normalizedX = constrainedX / maxDistance;
    const normalizedY = constrainedY / maxDistance;
    
    onMove(normalizedX, normalizedY);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    if (returnToCenter) {
      setKnobPosition({ x: 0, y: 0 });
      onMove(0, 0);
    }
    
    if (hapticEnabled) {
      hapticFeedback.light();
    }
    
    onEnd?.();
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleEnd();
  };

  // Mouse event handlers for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (deviceInfo.touchSupported) return; // Only use mouse events on non-touch devices
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (deviceInfo.touchSupported) return;
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (deviceInfo.touchSupported) return;
    handleEnd();
  };

  return (
    <div
      ref={joystickRef}
      className={`touch-joystick ${disabled ? 'disabled' : ''} ${isDragging ? 'active' : ''}`}
      style={{
        width: size,
        height: size,
        position: 'relative'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={isDragging ? handleMouseMove : undefined}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="joystick-base">
        <div 
          className="joystick-knob"
          style={{
            transform: `translate(${knobPosition.x}px, ${knobPosition.y}px)`,
            transition: isDragging ? 'none' : returnToCenter ? 'transform 0.2s ease-out' : 'none'
          }}
        />
      </div>
    </div>
  );
};

interface TouchSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  onStartChange?: () => void;
  onEndChange?: () => void;
  orientation?: 'horizontal' | 'vertical';
  size?: { width: number; height: number };
  hapticEnabled?: boolean;
  disabled?: boolean;
  label?: string;
}

export const TouchSlider: React.FC<TouchSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onStartChange,
  onEndChange,
  orientation = 'horizontal',
  size = { width: 200, height: 50 },
  hapticEnabled = true,
  disabled = false,
  label
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const deviceInfo = useDeviceInfo();

  const calculateValue = (clientX: number, clientY: number): number => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return value;

    let percentage: number;
    
    if (orientation === 'horizontal') {
      percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    } else {
      percentage = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    }

    const rawValue = min + percentage * (max - min);
    return Math.round(rawValue / step) * step;
  };

  const handleStart = (clientX: number, clientY: number) => {
    if (disabled) return;
    
    setIsDragging(true);
    if (hapticEnabled) {
      hapticFeedback.light();
    }
    onStartChange?.();
    
    const newValue = calculateValue(clientX, clientY);
    if (newValue !== value) {
      onValueChange(newValue);
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging || disabled) return;

    const newValue = calculateValue(clientX, clientY);
    if (newValue !== value) {
      onValueChange(newValue);
      if (hapticEnabled && Math.abs(newValue - value) >= step) {
        hapticFeedback.light();
      }
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (hapticEnabled) {
      hapticFeedback.medium();
    }
    onEndChange?.();
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleEnd();
  };

  // Mouse handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (deviceInfo.touchSupported) return;
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (deviceInfo.touchSupported) return;
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (deviceInfo.touchSupported) return;
    handleEnd();
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`touch-slider ${orientation} ${disabled ? 'disabled' : ''}`}>
      {label && <label className="slider-label">{label}</label>}
      <div
        ref={sliderRef}
        className={`slider-track ${isDragging ? 'active' : ''}`}
        style={{
          width: size.width,
          height: size.height
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div 
          className="slider-fill"
          style={{
            [orientation === 'horizontal' ? 'width' : 'height']: `${percentage}%`
          }}
        />
        <div 
          className="slider-thumb"
          style={{
            [orientation === 'horizontal' ? 'left' : 'bottom']: `${percentage}%`
          }}
        />
      </div>
      <div className="slider-value">{value}</div>
    </div>
  );
};

interface TouchButtonProps {
  onPress: () => void;
  onRelease?: () => void;
  children: React.ReactNode;
  hapticType?: 'light' | 'medium' | 'heavy';
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'small' | 'medium' | 'large';
  longPressEnabled?: boolean;
  longPressDelay?: number;
}

export const TouchButton: React.FC<TouchButtonProps> = ({
  onPress,
  onRelease,
  children,
  hapticType = 'medium',
  disabled = false,
  variant = 'primary',
  size = 'medium',
  longPressEnabled = false,
  longPressDelay = 500
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deviceInfo = useDeviceInfo();

  const handlePress = () => {
    if (disabled) return;
    
    setIsPressed(true);
    hapticFeedback[hapticType]();
    
    if (longPressEnabled) {
      longPressTimerRef.current = setTimeout(() => {
        onPress();
        hapticFeedback.heavy();
      }, longPressDelay);
    } else {
      onPress();
    }
  };

  const handleRelease = () => {
    if (disabled) return;
    
    setIsPressed(false);
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      
      if (!longPressEnabled) {
        onPress();
      }
    }
    
    onRelease?.();
    hapticFeedback.light();
  };

  const handleCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsPressed(false);
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      className={`touch-button ${variant} ${size} ${isPressed ? 'pressed' : ''} ${disabled ? 'disabled' : ''}`}
      disabled={disabled}
      onTouchStart={handlePress}
      onTouchEnd={handleRelease}
      onTouchCancel={handleCancel}
      onMouseDown={!deviceInfo.touchSupported ? handlePress : undefined}
      onMouseUp={!deviceInfo.touchSupported ? handleRelease : undefined}
      onMouseLeave={!deviceInfo.touchSupported ? handleCancel : undefined}
    >
      {children}
    </button>
  );
};

interface SwipeableViewProps {
  children: React.ReactNode[];
  activeIndex: number;
  onSwipe: (direction: 'left' | 'right', newIndex: number) => void;
  enableSwipe?: boolean;
  swipeThreshold?: number;
}

export const SwipeableView: React.FC<SwipeableViewProps> = ({
  children,
  activeIndex,
  onSwipe,
  enableSwipe = true,
  swipeThreshold = 50
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setTranslateX(-activeIndex * 100);
  }, [activeIndex]);

  useEffect(() => {
    if (!containerRef.current || !enableSwipe) return;

    const gestureHandler = new TouchGestureHandler(containerRef.current, {
      onSwipe: (gesture) => {
        if (Math.abs(gesture.deltaX) < swipeThreshold) return;

        const direction = gesture.deltaX > 0 ? 'right' : 'left';
        let newIndex = activeIndex;

        if (direction === 'left' && activeIndex < children.length - 1) {
          newIndex = activeIndex + 1;
        } else if (direction === 'right' && activeIndex > 0) {
          newIndex = activeIndex - 1;
        }

        if (newIndex !== activeIndex) {
          setIsTransitioning(true);
          onSwipe(direction, newIndex);
          hapticFeedback.light();
          
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }
      }
    });

    return () => {
      gestureHandler.destroy();
    };
  }, [activeIndex, children.length, enableSwipe, swipeThreshold, onSwipe]);

  return (
    <div className="swipeable-view">
      <div
        ref={containerRef}
        className={`swipeable-container ${isTransitioning ? 'transitioning' : ''}`}
        style={{
          transform: `translateX(${translateX}%)`,
          width: `${children.length * 100}%`
        }}
      >
        {children.map((child, index) => (
          <div key={index} className="swipeable-item">
            {child}
          </div>
        ))}
      </div>
      
      {/* Pagination dots */}
      <div className="swipeable-pagination">
        {children.map((_, index) => (
          <button
            key={index}
            className={`pagination-dot ${index === activeIndex ? 'active' : ''}`}
            onClick={() => onSwipe(index > activeIndex ? 'left' : 'right', index)}
          />
        ))}
      </div>
    </div>
  );
};