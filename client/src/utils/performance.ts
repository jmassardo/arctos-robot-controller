// Performance utilities and monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private observers: PerformanceObserver[] = [];

  private constructor() {
    this.initializeObservers();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private initializeObservers() {
    // Observe navigation timing
    if ('PerformanceObserver' in window) {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('navigation', entry.duration);
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navObserver);

      // Observe resource loading
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric(`resource:${entry.name.split('/').pop()}`, entry.duration);
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.push(resourceObserver);

      // Observe largest contentful paint
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric('lcp', entry.startTime);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);

      // Observe cumulative layout shift
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            this.recordMetric('cls', entry.value);
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    }
  }

  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
    
    // Log significant performance issues
    if (name === 'lcp' && value > 2500) {
      console.warn(`Poor LCP detected: ${value}ms`);
    }
    if (name === 'cls' && value > 0.1) {
      console.warn(`Poor CLS detected: ${value}`);
    }
  }

  getMetrics(): { [key: string]: { avg: number; latest: number; count: number } } {
    const result: any = {};
    
    for (const [name, values] of Array.from(this.metrics.entries())) {
      if (values.length > 0) {
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const latest = values[values.length - 1];
        result[name] = { avg: Math.round(avg), latest: Math.round(latest), count: values.length };
      }
    }
    
    return result;
  }

  measureFunction<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    this.recordMetric(`function:${name}`, end - start);
    return result;
  }

  async measureAsyncFunction<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    this.recordMetric(`async:${name}`, end - start);
    return result;
  }

  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics.clear();
  }
}

// Memory usage monitoring
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private measurements: Array<{ timestamp: number; usedJSHeapSize: number; totalJSHeapSize: number }> = [];

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private startMonitoring() {
    if ('memory' in performance) {
      this.intervalId = setInterval(() => {
        const memory = (performance as any).memory;
        this.measurements.push({
          timestamp: Date.now(),
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize
        });
        
        // Keep only last hour of measurements (720 points at 5s intervals)
        if (this.measurements.length > 720) {
          this.measurements.shift();
        }
        
        // Warn if memory usage is high
        const usagePercent = (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
        if (usagePercent > 85) {
          console.warn(`High memory usage: ${Math.round(usagePercent)}%`);
        }
      }, 5000);
    }
  }

  getCurrentMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
        percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
      };
    }
    return null;
  }

  getMemoryHistory() {
    return this.measurements.slice(-60).map(m => ({
      ...m,
      usedMB: Math.round(m.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(m.totalJSHeapSize / 1024 / 1024)
    }));
  }

  cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.measurements = [];
  }
}

// API response caching
export class APICache {
  private static instance: APICache;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private maxSize = 100;

  private constructor() {}

  static getInstance(): APICache {
    if (!APICache.instance) {
      APICache.instance = new APICache();
    }
    return APICache.instance;
  }

  set(key: string, data: any, ttlMs: number = 5 * 60 * 1000): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      validEntries,
      expiredEntries,
      usage: Math.round((this.cache.size / this.maxSize) * 100)
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Debounce and throttle utilities
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}