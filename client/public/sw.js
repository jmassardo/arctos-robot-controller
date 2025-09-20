// Service Worker for Arctos Robot Controller
// Handles caching of static assets and API responses for offline capability

const CACHE_NAME = 'arctos-robot-v1.2.0';
const STATIC_CACHE = 'arctos-static-v1.2.0';
const API_CACHE = 'arctos-api-v1.2.0';
const RUNTIME_CACHE = 'arctos-runtime-v1.2.0';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
  // Fallback offline page
  '/offline.html'
];

// API endpoints with caching strategies
const API_CACHE_CONFIG = {
  '/api/config': { ttl: 5 * 60 * 1000, strategy: 'networkFirst' }, // 5 minutes, network first
  '/api/positions': { ttl: 2 * 60 * 1000, strategy: 'networkFirst' }, // 2 minutes, network first  
  '/api/groups': { ttl: 5 * 60 * 1000, strategy: 'networkFirst' }, // 5 minutes, network first
  '/api/robot-profiles': { ttl: 10 * 60 * 1000, strategy: 'cacheFirst' }, // 10 minutes, cache first
  '/api/theme': { ttl: 30 * 60 * 1000, strategy: 'cacheFirst' }, // 30 minutes, cache first
  '/api/documentation': { ttl: 60 * 60 * 1000, strategy: 'cacheFirst' }, // 1 hour, cache first
};

// Mobile-specific optimizations
const MOBILE_CONFIG = {
  maxCacheSize: 50 * 1024 * 1024, // 50MB limit for mobile
  prioritizeNetworkOnSlowConnection: true,
  compressResponses: true,
  preloadCriticalResources: true
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      }),
      // Initialize API cache
      caches.open(API_CACHE_NAME),
      // Initialize runtime cache
      caches.open(RUNTIME_CACHE_NAME)
    ]).then(() => {
      // Force activation of new service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return (
                (cacheName.includes('arctos-static-') && cacheName !== STATIC_CACHE_NAME) ||
                (cacheName.includes('arctos-api-') && cacheName !== API_CACHE_NAME) ||
                (cacheName.includes('arctos-runtime-') && cacheName !== RUNTIME_CACHE_NAME)
              );
            })
            .map((cacheName) => caches.delete(cacheName))
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - handle all network requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Mobile optimization: check connection speed
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isSlowConnection = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g');
  
  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request, isSlowConnection));
  } else if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset))) {
    event.respondWith(handleStaticRequest(request, isSlowConnection));
  } else {
    event.respondWith(handleRuntimeRequest(request, isSlowConnection));
  }
});

async function handleApiRequest(request, isSlowConnection) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const config = API_CACHE_CONFIG[pathname];
  
  if (!config) {
    // No caching config, just fetch
    return fetch(request);
  }
  
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);
  
  // Check if cached response is still fresh
  if (cachedResponse) {
    const cachedTime = parseInt(cachedResponse.headers.get('sw-cached-at') || '0');
    const isStale = Date.now() - cachedTime > config.ttl;
    
    if (!isStale) {
      // Fresh cached response
      return cachedResponse;
    } else if (isSlowConnection && config.strategy === 'cacheFirst') {
      // Use stale cache on slow connections for cache-first strategies
      return cachedResponse;
    }
  }
  
  try {
    // Attempt network request with mobile timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isSlowConnection ? 15000 : 8000);
    
    const networkResponse = await fetch(request, { 
      signal: controller.signal,
      headers: {
        ...request.headers,
        'Cache-Control': isSlowConnection ? 'no-cache' : 'no-store'
      }
    });
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      // Clone response and add timestamp
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      
      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      // Cache the response
      await cache.put(request, cachedResponse);
      return networkResponse;
    } else if (cachedResponse) {
      // Network failed, return cached if available
      return cachedResponse;
    } else {
      return networkResponse;
    }
  } catch (error) {
    console.log('Network request failed:', error);
    
    if (cachedResponse) {
      // Return cached response on network error
      return cachedResponse;
    } else {
      // Return offline response
      return new Response(
        JSON.stringify({ 
          error: 'Network unavailable', 
          offline: true,
          message: 'Please check your internet connection' 
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
}

async function handleStaticRequest(request, isSlowConnection) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Return cached static asset immediately
    if (!isSlowConnection) {
      // Update cache in background on fast connections
      fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
      }).catch(() => {
        // Silent fail for background updates
      });
    }
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/offline.html') || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

async function handleRuntimeRequest(request, isSlowConnection) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  // For HTML pages, always try network first on fast connections
  if (request.headers.get('accept')?.includes('text/html') && !isSlowConnection) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
        return networkResponse;
      }
    } catch (error) {
      // Fall through to cache
    }
  }
  
  // Try cache first for other resources or slow connections
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/offline.html') || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}// Handle API requests with intelligent caching
async function handleAPIRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Check if this endpoint should be cached
  const cacheKey = Object.keys(API_CACHE_CONFIG).find(key => pathname.startsWith(key));
  if (!cacheKey) {
    // No caching for this endpoint
    return fetch(request);
  }

  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    const cacheTime = parseInt(cachedResponse.headers.get('sw-cache-time') || '0');
    const ttl = API_CACHE_CONFIG[cacheKey];
    const age = Date.now() - cacheTime;
    
    if (age < ttl) {
      // Cache is still valid
      return cachedResponse;
    }
  }

  // Fetch fresh data
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Clone response and add cache timestamp
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      
      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      // Cache the response
      cache.put(request, cachedResponse);
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, return cached version if available
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle static asset requests
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Not in cache, fetch and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Could return a fallback response here
    throw error;
  }
}

// Handle HTML requests
async function handleHTMLRequest(request) {
  try {
    // Always try network first for HTML
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful response
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // No cached version, return offline page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Arctos Robot Controller - Offline</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #f5f5f5;
          }
          .offline-message { 
            background: white; 
            padding: 40px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 500px;
            margin: 0 auto;
          }
          .icon { font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 15px; }
          p { color: #666; line-height: 1.5; }
          .retry-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 20px;
          }
          .retry-button:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="offline-message">
          <div class="icon">📡</div>
          <h1>You're Offline</h1>
          <p>The Arctos Robot Controller requires an internet connection. Please check your connection and try again.</p>
          <button class="retry-button" onclick="window.location.reload()">Retry</button>
        </div>
      </body>
      </html>
      `,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

// Handle runtime requests (images, fonts, etc.)
async function handleRuntimeRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  }
  
  if (event.data && event.data.type === 'CACHE_STATS') {
    event.waitUntil(getCacheStats().then(stats => {
      event.ports[0].postMessage(stats);
    }));
  }
});

// Utility function to clear all caches
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(name => name.includes('arctos-'))
      .map(name => caches.delete(name))
  );
}

// Get cache statistics
async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {
    caches: {},
    totalSize: 0,
    totalItems: 0
  };
  
  for (const cacheName of cacheNames) {
    if (cacheName.includes('arctos-')) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      const size = await Promise.all(
        keys.map(async (request) => {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            return blob.size;
          }
          return 0;
        })
      );
      
      const cacheSize = size.reduce((total, itemSize) => total + itemSize, 0);
      stats.caches[cacheName] = {
        items: keys.length,
        size: cacheSize,
        sizeFormatted: formatBytes(cacheSize)
      };
      stats.totalItems += keys.length;
      stats.totalSize += cacheSize;
    }
  }
  
  stats.totalSizeFormatted = formatBytes(stats.totalSize);
  return stats;
}

// Format bytes for human reading
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle any queued actions that couldn't be sent while offline
  // This could include position saves, configuration changes, etc.
  console.log('Background sync triggered - handling queued actions');
}