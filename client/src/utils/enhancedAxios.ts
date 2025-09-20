import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { APICache, PerformanceMonitor, throttle } from './performance';

// Enhanced axios instance with caching and performance monitoring
class EnhancedAxiosInstance {
  private instance: AxiosInstance;
  private cache: APICache;
  private monitor: PerformanceMonitor;
  private requestQueue: Map<string, Promise<any>> = new Map();

  constructor() {
    this.cache = APICache.getInstance();
    this.monitor = PerformanceMonitor.getInstance();
    
    this.instance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add performance timing
        (config as any).startTime = performance.now();
        
        // Add request ID for tracking
        (config as any).requestId = `${config.method}-${config.url}-${Date.now()}`;
        
        return config;
      },
      (error) => {
        this.monitor.recordMetric('api:request-error', 1);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => {
        // Record performance metrics
        const config = response.config as any;
        if (config.startTime) {
          const duration = performance.now() - config.startTime;
          this.monitor.recordMetric(`api:${config.method}:${config.url}`, duration);
          this.monitor.recordMetric('api:total', duration);
        }

        // Cache successful GET requests
        if (response.config.method === 'get' && response.status === 200) {
          const cacheKey = this.getCacheKey(response.config);
          const cacheTTL = this.getCacheTTL(response.config.url);
          if (cacheTTL > 0) {
            this.cache.set(cacheKey, response.data, cacheTTL);
          }
        }

        return response;
      },
      (error) => {
        // Record error metrics
        const config = error.config as any;
        if (config) {
          const duration = config.startTime ? performance.now() - config.startTime : 0;
          this.monitor.recordMetric(`api:error:${error.response?.status || 'network'}`, duration);
          this.monitor.recordMetric('api:error-total', 1);
        }

        return Promise.reject(error);
      }
    );
  }

  private getCacheKey(config: AxiosRequestConfig): string {
    const url = config.url || '';
    const params = config.params ? JSON.stringify(config.params) : '';
    return `${url}${params}`;
  }

  private getCacheTTL(url?: string): number {
    if (!url) return 0;
    
    // Cache configuration based on endpoint
    if (url.includes('/api/config')) return 60000; // 1 minute
    if (url.includes('/api/positions')) return 30000; // 30 seconds
    if (url.includes('/api/robot-profiles')) return 300000; // 5 minutes
    if (url.includes('/api/users') && url.includes('GET')) return 120000; // 2 minutes
    if (url.includes('/api/audit')) return 600000; // 10 minutes
    
    return 0; // No cache by default
  }

  // Enhanced GET with caching
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const cacheKey = this.getCacheKey({ ...config, url, method: 'get' });
    const cacheTTL = this.getCacheTTL(url);
    
    // Check cache first
    if (cacheTTL > 0 && this.cache.has(cacheKey)) {
      const cachedData = this.cache.get<T>(cacheKey);
      if (cachedData) {
        this.monitor.recordMetric('api:cache-hit', 1);
        return {
          data: cachedData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { ...config, url, method: 'get' } as any,
        } as AxiosResponse<T>;
      }
    }

    // Check if request is already in progress (deduplication)
    const requestKey = `GET:${cacheKey}`;
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    // Make the request
    const requestPromise = this.instance.get<T>(url, config);
    this.requestQueue.set(requestKey, requestPromise);

    try {
      const response = await requestPromise;
      this.monitor.recordMetric('api:cache-miss', 1);
      return response;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  // Standard methods with performance monitoring
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    // Invalidate related cache entries
    this.invalidateCache(url);
    return this.instance.post<T>(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.invalidateCache(url);
    return this.instance.put<T>(url, data, config);
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.invalidateCache(url);
    return this.instance.delete<T>(url, config);
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.invalidateCache(url);
    return this.instance.patch<T>(url, data, config);
  }

  private invalidateCache(url: string): void {
    // Simple pattern matching for cache invalidation
    if (url.includes('/api/config')) {
      this.cache.delete('/api/config');
    }
    if (url.includes('/api/positions')) {
      this.cache.delete('/api/positions');
      this.cache.delete('/api/positions/current');
    }
    if (url.includes('/api/robot-profiles')) {
      this.cache.delete('/api/robot-profiles');
    }
    if (url.includes('/api/users')) {
      this.cache.delete('/api/users');
    }
    
    this.monitor.recordMetric('api:cache-invalidation', 1);
  }

  // Batch request utility
  async batch<T = any>(requests: Array<{ url: string; config?: AxiosRequestConfig }>): Promise<T[]> {
    const startTime = performance.now();
    
    try {
      const promises = requests.map(req => this.get(req.url, req.config));
      const responses = await Promise.all(promises);
      
      const duration = performance.now() - startTime;
      this.monitor.recordMetric('api:batch', duration);
      this.monitor.recordMetric(`api:batch:count`, requests.length);
      
      return responses.map(res => res.data);
    } catch (error) {
      this.monitor.recordMetric('api:batch-error', 1);
      throw error;
    }
  }

  // Get performance and cache statistics
  getStats() {
    return {
      performance: this.monitor.getMetrics(),
      cache: this.cache.getStats(),
      queueSize: this.requestQueue.size
    };
  }

  // Cleanup method
  cleanup() {
    this.cache.cleanup();
    this.requestQueue.clear();
  }
}

// Create singleton instance
const enhancedAxios = new EnhancedAxiosInstance();

// Export for use throughout the application
export default enhancedAxios;

// Also export the class for advanced usage
export { EnhancedAxiosInstance };

// Throttled socket emission utilities
export class SocketThrottler {
  private static instance: SocketThrottler;
  private throttledEmitters: Map<string, (...args: any[]) => void> = new Map();
  private emissionCounts: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): SocketThrottler {
    if (!SocketThrottler.instance) {
      SocketThrottler.instance = new SocketThrottler();
    }
    return SocketThrottler.instance;
  }

  // Create throttled emitter for socket events
  createThrottledEmitter(socket: any, eventName: string, throttleMs: number = 100) {
    const key = `${eventName}-${throttleMs}`;
    
    if (this.throttledEmitters.has(key)) {
      return this.throttledEmitters.get(key)!;
    }

    const throttledFn = throttle((...args: any[]) => {
      socket.emit(eventName, ...args);
      
      // Track emissions
      const currentCount = this.emissionCounts.get(eventName) || 0;
      this.emissionCounts.set(eventName, currentCount + 1);
      
      // Record performance metric
      PerformanceMonitor.getInstance().recordMetric(`socket:${eventName}`, 1);
    }, throttleMs);

    this.throttledEmitters.set(key, throttledFn);
    return throttledFn;
  }

  // Get emission statistics
  getStats() {
    return {
      throttledEmitters: this.throttledEmitters.size,
      emissions: Object.fromEntries(this.emissionCounts.entries())
    };
  }

  // Cleanup
  cleanup() {
    this.throttledEmitters.clear();
    this.emissionCounts.clear();
  }
}