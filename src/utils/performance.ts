import React from 'react'

// Performance monitoring utilities
export class PerformanceMonitor {
  private static measurements = new Map<string, number>()
  private static enabled = process.env.NODE_ENV === 'development'

  static startMeasurement(name: string): void {
    if (!this.enabled) return
    this.measurements.set(name, performance.now())
  }

  static endMeasurement(name: string): number {
    if (!this.enabled) return 0
    
    const start = this.measurements.get(name)
    if (!start) {
      console.warn(`No start measurement found for: ${name}`)
      return 0
    }

    const duration = performance.now() - start
    this.measurements.delete(name)
    
    if (duration > 100) { // Log slow operations
      console.warn(`🐌 Slow operation: ${name} took ${duration.toFixed(2)}ms`)
    }
    
    return duration
  }

  static measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn()
    
    this.startMeasurement(name)
    return fn().finally(() => {
      this.endMeasurement(name)
    })
  }

  static measureSync<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn()
    
    this.startMeasurement(name)
    try {
      return fn()
    } finally {
      this.endMeasurement(name)
    }
  }
}

// Memory usage monitoring
export const getMemoryUsage = (): string => {
  if ('memory' in performance) {
    const memory = (performance as any).memory
    return `Used: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB, Total: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`
  }
  return 'Memory info not available'
}

// Bundle size monitoring
export const logBundleMetrics = (): void => {
  if (process.env.NODE_ENV === 'production') return

  console.group('📊 Bundle Metrics')
  console.log('Memory usage:', getMemoryUsage())
  
  // Log largest DOM nodes
  const elements = document.querySelectorAll('*')
  console.log(`DOM nodes: ${elements.length}`)
  
  // Log console errors and warnings
  const originalError = console.error
  const originalWarn = console.warn
  let errorCount = 0
  let warnCount = 0
  
  console.error = (...args) => {
    errorCount++
    originalError(...args)
  }
  
  console.warn = (...args) => {
    warnCount++
    originalWarn(...args)
  }
  
  console.log(`Console errors: ${errorCount}, warnings: ${warnCount}`)
  console.groupEnd()
}

// React component performance wrapper
export const withPerformanceMonitoring = <P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) => {
  return React.memo((props: P) => {
    React.useEffect(() => {
      PerformanceMonitor.startMeasurement(`${componentName}-render`)
      return () => {
        PerformanceMonitor.endMeasurement(`${componentName}-render`)
      }
    })

    return React.createElement(Component, props)
  })
}

// Bundle chunk loading performance
export const trackChunkLoading = (): void => {
  if (process.env.NODE_ENV === 'production') return

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('chunk') || entry.name.includes('.js')) {
        console.log(`📦 Chunk loaded: ${entry.name} in ${entry.duration.toFixed(2)}ms`)
      }
    }
  })

  observer.observe({ entryTypes: ['resource'] })
}