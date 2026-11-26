/* DeepSeek Chat Demo —— Service Worker 模板
 *
 * 这是**模板**：`dist/sw.js` 由 `pwa/build-sw.mjs` 在构建末尾生成，
 * 生成时会填好下面的 SW_VERSION 和 PRECACHE 两个常量（这里写占位符）。
 * 直接改本文件即可，不要手改 dist/sw.js（下次构建会被覆盖）。
 *
 * 目标：① 打开应用时立刻出界面，不等网络；② 首屏所需的 html/js/css 全部在手里；
 *       ③ 部署新版本能自动更新并清掉旧缓存。
 *
 * 边界：只接管本站资源；`/api/*` 一律不缓存（服务端声明了 no-store），
 *       跨域请求（api.deepseek.com 等）完全不接管。
 */

const SW_VERSION = '__SW_VERSION__'
const SHELL_CACHE = `ds-shell-${SW_VERSION}`
const RUNTIME_CACHE = `ds-runtime-${SW_VERSION}`
const CACHE_PREFIX = 'ds-'

/** 构建时注入：外壳 + 首屏需要的 hashed js/css */
const PRECACHE = __SW_PRECACHE__

const isCacheable = (response) => Boolean(response) && response.ok && response.type === 'basic'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 逐个缓存：某个文件 404 不应该让整次安装失败（否则永远没有离线兜底）
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            /* 单个资源失败忽略，剩下来的仍然可用 */
          })
        )
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE])
      const stale = (await caches.keys()).filter(
        (key) => key.startsWith(CACHE_PREFIX) && !keep.has(key)
      )
      await Promise.all(stale.map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

/**
 * 导航请求：**缓存优先**——有外壳就立刻返回（0 网络，连 DNS 都不用），
 * 同时后台拉一次新的 index.html 写回缓存，下次启动生效。
 * 只有本地连壳都没有（首次访问）时才等网络。
 */
async function handleNavigate(event) {
  const { request } = event

  // 这个应用没有前端路由，index.html 里的资源是相对路径（为了支持 file:// 打开）。
  // 因此 /a/b 这种深层路径就算拿到外壳，静态资源也会解析成 /a/b/static/... 而全部 404，
  // 表现是一直停在启动占位上。统一回根路径，行为可预期。
  const url = new URL(request.url)
  if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
    return Response.redirect(new URL('/', url).href, 302)
  }

  const cache = await caches.open(SHELL_CACHE)
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(new Request('./index.html')))

  const network = fetch(request, { cache: 'no-cache' })
    .then((response) => {
      if (isCacheable(response)) {
        const copy = response.clone()
        event.waitUntil(cache.put(new Request('./index.html'), copy))
      }
      return response
    })
    .catch(() => null)

  if (cached) return cached

  const fresh = await network
  if (fresh && fresh.ok) return fresh
  return new Response('离线状态，且还没有缓存到页面。', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/** 带 contenthash 的静态资源：缓存优先（文件名变了自然会走新请求） */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const fresh = await fetch(request).catch(() => null)
  if (!fresh) return Response.error()
  if (isCacheable(fresh)) {
    const copy = fresh.clone()
    const runtime = await caches.open(RUNTIME_CACHE)
    runtime.put(request, copy).catch(() => {})
  }
  return fresh
}

/** 其余同源资源（图标、manifest 等）：先用缓存，同时后台更新 */
async function staleWhileRevalidate(event) {
  const { request } = event
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
        const copy = response.clone()
        cache.put(request, copy).catch(() => {})
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    event.waitUntil(network)
    return cached
  }

  const fresh = await network
  return fresh || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 只接管本站资源；api.deepseek.com 等跨域请求交给浏览器直连
  if (url.origin !== self.location.origin) return

  // 接口与代理一律不缓存：服务端已声明 no-store，Cache Storage 不吃这套头，必须自己拦。
  // `/models`、`/anthropic/*`、`/v1/*` 都是服务端代理，缓存了会拿到过期的模型列表/工具结果。
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/models' ||
    url.pathname.startsWith('/anthropic/') ||
    url.pathname.startsWith('/v1/')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event))
    return
  }
  if (url.pathname.includes('/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(event))
})
