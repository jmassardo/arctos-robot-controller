// Mobile and responsive design utilities for Arctos Robot Controller

// Breakpoints for responsive design
import { useState, useEffect } from 'react';

// Constants and configuration
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1200
};

// Device information interface

// Device type detection
export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
  touchSupported: boolean;
  devicePixelRatio: number;
}

export const getDeviceInfo = (): DeviceInfo => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const touchSupported = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return {
    isMobile: width <= BREAKPOINTS.mobile,
    isTablet: width > BREAKPOINTS.mobile && width <= BREAKPOINTS.tablet,
    isDesktop: width > BREAKPOINTS.tablet,
    screenWidth: width,
    screenHeight: height,
    orientation: height > width ? 'portrait' : 'landscape',
    touchSupported,
    devicePixelRatio: window.devicePixelRatio || 1
  };
};

// Hook for device info with updates
export const useDeviceInfo = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    const updateDeviceInfo = () => {
      setDeviceInfo(getDeviceInfo());
    };

    window.addEventListener('resize', updateDeviceInfo);
    window.addEventListener('orientationchange', updateDeviceInfo);

    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, []);

  return deviceInfo;
};

// Touch gesture utilities
export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface GestureState {
  startPoint: TouchPoint | null;
  currentPoint: TouchPoint | null;
  deltaX: number;
  deltaY: number;
  distance: number;
  velocity: number;
  duration: number;
  direction: 'up' | 'down' | 'left' | 'right' | null;
}

export class TouchGestureHandler {
  private startPoint: TouchPoint | null = null;
  private currentPoint: TouchPoint | null = null;
  private onSwipeCallback?: (gesture: GestureState) => void;
  private onTapCallback?: (point: TouchPoint) => void;
  private onLongPressCallback?: (point: TouchPoint) => void;
  private longPressTimer: NodeJS.Timeout | null = null;
  private longPressThreshold = 500; // ms
  private swipeThreshold = 50; // pixels

  constructor(
    element: HTMLElement,
    callbacks: {
      onSwipe?: (gesture: GestureState) => void;
      onTap?: (point: TouchPoint) => void;
      onLongPress?: (point: TouchPoint) => void;
    }
  ) {
    this.onSwipeCallback = callbacks.onSwipe;
    this.onTapCallback = callbacks.onTap;
    this.onLongPressCallback = callbacks.onLongPress;

    element.addEventListener('touchstart', this.handleTouchStart.bind(this));
    element.addEventListener('touchmove', this.handleTouchMove.bind(this));
    element.addEventListener('touchend', this.handleTouchEnd.bind(this));
    element.addEventListener('touchcancel', this.handleTouchCancel.bind(this));
  }

  private createTouchPoint(touch: Touch): TouchPoint {
    return {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }

  private handleTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
      this.startPoint = this.createTouchPoint(event.touches[0]);
      this.currentPoint = this.startPoint;

      // Start long press timer
      if (this.onLongPressCallback) {
        this.longPressTimer = setTimeout(() => {
          if (this.startPoint && this.onLongPressCallback) {
            this.onLongPressCallback(this.startPoint);
          }
        }, this.longPressThreshold);
      }
    }
  }

  private handleTouchMove(event: TouchEvent) {
    if (event.touches.length === 1 && this.startPoint) {
      this.currentPoint = this.createTouchPoint(event.touches[0]);
      
      // Cancel long press if moved too much
      const distance = this.calculateDistance(this.startPoint, this.currentPoint);
      if (distance > 10 && this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  }

  private handleTouchEnd(event: TouchEvent) {
    if (this.startPoint && this.currentPoint) {
      const gesture = this.calculateGesture(this.startPoint, this.currentPoint);
      
      // Clear long press timer
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      // Determine gesture type
      if (gesture.distance > this.swipeThreshold && this.onSwipeCallback) {
        this.onSwipeCallback(gesture);
      } else if (gesture.distance < 10 && gesture.duration < 300 && this.onTapCallback) {
        this.onTapCallback(this.startPoint);
      }
    }

    this.reset();
  }

  private handleTouchCancel() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.reset();
  }

  private calculateDistance(point1: TouchPoint, point2: TouchPoint): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateGesture(start: TouchPoint, end: TouchPoint): GestureState {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const distance = this.calculateDistance(start, end);
    const duration = end.timestamp - start.timestamp;
    const velocity = duration > 0 ? distance / duration : 0;

    let direction: 'up' | 'down' | 'left' | 'right' | null = null;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    return {
      startPoint: start,
      currentPoint: end,
      deltaX,
      deltaY,
      distance,
      velocity,
      duration,
      direction
    };
  }

  private reset() {
    this.startPoint = null;
    this.currentPoint = null;
  }

  destroy() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }
}

// Virtual keyboard detection
export const useVirtualKeyboard = () => {
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const heightDifference = initialHeight - currentHeight;
      
      // Virtual keyboard is likely open if viewport height decreased significantly
      const keyboardThreshold = 150; // pixels
      setIsVirtualKeyboardOpen(heightDifference > keyboardThreshold);
      setViewportHeight(currentHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isVirtualKeyboardOpen, viewportHeight };
};

// Orientation lock utilities
export const lockOrientation = async (orientation: string): Promise<boolean> => {
  try {
    // Try modern API first
    if ('screen' in window && 'orientation' in (window as any).screen && 'lock' in (window as any).screen.orientation) {
      await (window as any).screen.orientation.lock(orientation);
      return true;
    }
    
    // Fallback for older browsers
    const screenObj = (window as any).screen;
    if (screenObj && (screenObj.lockOrientation || screenObj.mozLockOrientation || screenObj.msLockOrientation)) {
      const lockFn = screenObj.lockOrientation || screenObj.mozLockOrientation || screenObj.msLockOrientation;
      return lockFn(orientation);
    }
    
    return false;
  } catch (error) {
    console.warn('Orientation lock failed:', error);
    return false;
  }
};

export const unlockOrientation = () => {
  try {
    // Try modern API first  
    if ('screen' in window && 'orientation' in (window as any).screen && 'unlock' in (window as any).screen.orientation) {
      (window as any).screen.orientation.unlock();
      return;
    }
    
    // Fallback for older browsers
    const screenObj = (window as any).screen;
    if (screenObj && (screenObj.unlockOrientation || screenObj.mozUnlockOrientation || screenObj.msUnlockOrientation)) {
      const unlockFn = screenObj.unlockOrientation || screenObj.mozUnlockOrientation || screenObj.msUnlockOrientation;
      unlockFn();
    }
  } catch (error) {
    console.warn('Orientation unlock failed:', error);
  }
};

// Safe area utilities for notched devices
export const getSafeAreaInsets = () => {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top') || '0'),
    right: parseInt(style.getPropertyValue('--safe-area-inset-right') || '0'),
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0'),
    left: parseInt(style.getPropertyValue('--safe-area-inset-left') || '0')
  };
};

// Haptic feedback utilities
export const hapticFeedback = {
  light: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },
  medium: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },
  heavy: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 10, 30]);
    }
  },
  error: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }
  },
  success: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 25, 50]);
    }
  }
};

// Mobile performance optimization
export const optimizeForMobile = () => {
  // Reduce animation duration on mobile for better performance
  if (getDeviceInfo().isMobile) {
    document.documentElement.style.setProperty('--animation-duration-fast', '0.15s');
    document.documentElement.style.setProperty('--animation-duration-normal', '0.2s');
    document.documentElement.style.setProperty('--animation-duration-slow', '0.3s');
  }

  // Disable hover effects on touch devices
  if (getDeviceInfo().touchSupported) {
    document.documentElement.classList.add('touch-device');
  }
};

// Initialize mobile optimizations
export const initializeMobileSupport = () => {
  optimizeForMobile();
  
  // Set viewport height CSS variable for mobile browsers
  const setVH = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', setVH);
  
  // Add safe area CSS variables
  if ('CSS' in window && 'supports' in window.CSS) {
    const supportsEnv = window.CSS.supports('top: env(safe-area-inset-top)');
    if (supportsEnv) {
      document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
      document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right)');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
      document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left)');
    }
  }
};