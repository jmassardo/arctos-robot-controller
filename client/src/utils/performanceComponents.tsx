import React, { ComponentType, useEffect, useRef, Suspense } from 'react';
import { PerformanceMonitor } from './performance';

// Component performance HOC
export function withPerformanceTracking<P extends object>(
  WrappedComponent: ComponentType<P>,
  componentName: string
) {
  return function PerformanceTrackedComponent(props: P) {
    const renderStart = useRef<number>();
    const monitor = PerformanceMonitor.getInstance();

    useEffect(() => {
      renderStart.current = performance.now();
    });

    useEffect(() => {
      if (renderStart.current) {
        const renderTime = performance.now() - renderStart.current;
        monitor.recordMetric(`component:${componentName}:render`, renderTime);
      }
    });

    return <WrappedComponent {...props} />;
  };
}

// Loading fallback component
export const LoadingFallback: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="loading-fallback">
    <div className="loading-spinner"></div>
    <p>{message}</p>
  </div>
);

// Enhanced loading component with progress
export const LoadingWithProgress: React.FC<{ 
  message?: string; 
  progress?: number;
  details?: string;
}> = ({ message = 'Loading...', progress, details }) => (
  <div className="loading-with-progress">
    <div className="loading-spinner"></div>
    <h3>{message}</h3>
    {progress !== undefined && (
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
        <span className="progress-text">{Math.round(progress)}%</span>
      </div>
    )}
    {details && <p className="loading-details">{details}</p>}
  </div>
);

// Error boundary for lazy loaded components
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LazyLoadErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback?: React.ComponentType<{ error: Error | null }> }>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{ fallback?: React.ComponentType<{ error: Error | null }> }>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy loading error:', error, errorInfo);
    PerformanceMonitor.getInstance().recordMetric('lazy-load-error', 1);
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Default error fallback
const DefaultErrorFallback: React.FC<{ error: Error | null }> = ({ error }) => (
  <div className="error-fallback">
    <h3>Something went wrong</h3>
    <p>Failed to load component</p>
    {error && (
      <details>
        <summary>Error details</summary>
        <pre>{error.message}</pre>
      </details>
    )}
    <button onClick={() => window.location.reload()}>
      Refresh page
    </button>
  </div>
);

// Lazy loading utilities
export function createLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  options?: {
    fallback?: React.ComponentType<any>;
    errorBoundary?: boolean;
    loadingMessage?: string;
  }
) {
  const LazyComponent = React.lazy(importFunc);
  
  return function LazyComponentWithSuspense(props: React.ComponentProps<T>) {
    const fallback = options?.fallback ? 
      <options.fallback /> : 
      <LoadingFallback message={options?.loadingMessage} />;

    const component = (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );

    if (options?.errorBoundary !== false) {
      return (
        <LazyLoadErrorBoundary>
          {component}
        </LazyLoadErrorBoundary>
      );
    }

    return component;
  };
}

// Performance dashboard component
export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = React.useState<any>({});
  const [memoryInfo, setMemoryInfo] = React.useState<any>(null);

  React.useEffect(() => {
    const updateStats = () => {
      const monitor = PerformanceMonitor.getInstance();
      setMetrics(monitor.getMetrics());
      
      // Update memory info if available
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMemoryInfo({
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
        });
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const getMetricColor = (name: string, value: number) => {
    if (name.includes('lcp')) {
      return value < 1000 ? 'green' : value < 2500 ? 'orange' : 'red';
    }
    if (name.includes('cls')) {
      return value < 0.05 ? 'green' : value < 0.1 ? 'orange' : 'red';
    }
    if (name.includes('component') || name.includes('function')) {
      return value < 16 ? 'green' : value < 50 ? 'orange' : 'red';
    }
    return 'blue';
  };

  return (
    <div className="performance-dashboard">
      <h3>Performance Metrics</h3>
      
      {memoryInfo && (
        <div className="memory-section">
          <h4>Memory Usage</h4>
          <div className="memory-info">
            <span>Used: {memoryInfo.used} MB</span>
            <span>Total: {memoryInfo.total} MB</span>
            <span>Usage: {memoryInfo.percentage}%</span>
          </div>
          <div className="memory-bar">
            <div 
              className="memory-fill" 
              style={{ 
                width: `${memoryInfo.percentage}%`,
                backgroundColor: memoryInfo.percentage > 85 ? 'red' : memoryInfo.percentage > 70 ? 'orange' : 'green'
              }} 
            />
          </div>
        </div>
      )}

      <div className="metrics-grid">
        {Object.entries(metrics).map(([name, data]: [string, any]) => (
          <div key={name} className="metric-card">
            <h5>{name}</h5>
            <div className="metric-value" style={{ color: getMetricColor(name, data.avg) }}>
              {data.avg}ms
            </div>
            <div className="metric-details">
              <span>Latest: {data.latest}ms</span>
              <span>Count: {data.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};