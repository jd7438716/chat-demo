/* DeepSeek Chat Demo —— Service Worker
 *
 * 目标：① 应用外壳可离线秒开；② 满足 PWA 可安装条件（manifest + SW + HTTPS）。
 *
 * 边界：聊天本身要联网（浏览器直连 api.deepseek.com），跨域请求一律不接管，
 *       所以这里只缓存本站资源，绝不缓存对话内容。
 */

const VERSION = 'v1'
const SHELL_CACHE = `ds-shell-${VERSION}`
const ASSET_CACHE = `ds-assets-${VERSION}`

// 安装即预缓存：保证首屏断网也能起来
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-32.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

/** 导航请求：网络优先，保证拿到新版本；断网时回退到缓存的外壳 */
async function networkFirst(request) {
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(new Request('./index.html'), fresh.clone())
    }
    return fresh
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    return (
      (await cache.match(new Request('./index.html'))) ||
      (await cache.match(new Request('./'))) ||
      new Response('离线状态，且没有缓存到页面。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

/** 带内容哈希的静态资源：缓存优先（文件名变了自然会走新请求） */
async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const fresh = await fetch(request)
  if (fresh && fresh.ok && fresh.type === 'basic') {
    cache.put(request, fresh.clone())
  }
  return fresh
}

/** 其余同源资源：先用缓存，同时后台更新 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE)
  const hit = await cache.match(request)
  const refreshing = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(request, fresh.clone())
      }
      return fresh
    })
    .catch(() => null)
  return hit || (await refreshing) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 只接管本站资源；api.deepseek.com 等跨域请求交给浏览器直连
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  if (url.pathname.includes('/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})
