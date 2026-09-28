// =====================================================================
//  EL ZOCO FINANCIERO - Service Worker
//  Caché offline para PWA de cobranza
//  Versión: v1 (2026-09-27)
// =====================================================================

const CACHE_VERSION = 'zoco-v1';

// --- App Shell (recursos propios que siempre deben estar disponibles) ---
const APP_SHELL = [
    '/cobro/',
    '/login/',
    '/static/manifest.json',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/icons/logo.png',
    '/static/js/app_cobros.js',
];

// --- Librerías CDN críticas ---
// NOTA: se cachean con mode:'no-cors' porque algunos CDNs
// (como Tailwind) no envían headers CORS permisivos.
const CDN_ASSETS = [
    'https://cdn.tailwindcss.com?plugins=forms,typography',
    'https://unpkg.com/dexie/dist/dexie.js',
    'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
];

// =====================================================================
//  INSTALL — cachear app shell y CDN
// =====================================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_VERSION);

            // Cachear app shell (uno por uno)
            for (const url of APP_SHELL) {
                try {
                    await cache.add(url);
                    console.log('[SW] Cacheado:', url);
                } catch (err) {
                    console.warn('[SW] No se pudo cachear:', url, err.message);
                }
            }

            // Cachear CDN con no-cors (uno por uno)
            for (const url of CDN_ASSETS) {
                try {
                    const response = await fetch(url, { mode: 'no-cors', cache: 'no-cache' });
                    // Las respuestas 'opaque' se pueden cachear aunque no se puedan leer
                    await cache.put(url, response);
                    console.log('[SW] Cacheado CDN (opaque):', url);
                } catch (err) {
                    console.warn('[SW] No se pudo cachear CDN:', url, err.message);
                }
            }
        })()
    );
    self.skipWaiting();
});

// =====================================================================
//  ACTIVATE — limpiar cachés viejos
// =====================================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando...');
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_VERSION) {
                        console.log('[SW] Eliminando caché viejo:', key);
                        return caches.delete(key);
                    }
                })
            );
            await self.clients.claim();
        })()
    );
});

// =====================================================================
//  FETCH — estrategia según tipo de recurso
// =====================================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar métodos no-GET
    if (request.method !== 'GET') return;

    // 1. API (network-first)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 2. CDN (cache-first, con fallback no-cors)
    if (
        url.hostname === 'cdn.tailwindcss.com' ||
        url.hostname === 'unpkg.com' ||
        url.hostname === 'cdn.jsdelivr.net'
    ) {
        event.respondWith(cacheFirstCDN(request));
        return;
    }

    // 3. Estáticos propios (cache-first)
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 4. Navegación HTML (network-first con fallback a /cobro/)
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithFallback(request, '/cobro/'));
        return;
    }

    // 5. Resto (network-first)
    event.respondWith(networkFirst(request));
});

// =====================================================================
//  ESTRATEGIAS
// =====================================================================

// Cache-first estándar (para recursos propios)
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        return new Response('', { status: 503, statusText: 'Sin conexión' });
    }
}

// Cache-first para CDN (maneja respuestas opaque)
async function cacheFirstCDN(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        // Intentar primero con modo normal
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Fallback: intentar con no-cors
        try {
            const opaqueResponse = await fetch(request.url, { mode: 'no-cors' });
            return opaqueResponse;
        } catch (err2) {
            return new Response('', { status: 503, statusText: 'Sin conexión' });
        }
    }
}

// Network-first
async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Sin conexión' });
    }
}

// Network-first con fallback
async function networkFirstWithFallback(request, fallbackUrl) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;

        const fallback = await cache.match(fallbackUrl);
        if (fallback) return fallback;

        return new Response('', { status: 503, statusText: 'Sin conexión' });
    }
}

// =====================================================================
//  MENSAJES
// =====================================================================
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});