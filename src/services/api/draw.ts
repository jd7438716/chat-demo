export class DrawApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'DrawApiError'
    this.status = status
  }
}

export type DrawImage = {
  /** 已下载到本地内存的图片；失败时为空，改用 url 兜底展示 */
  blob?: Blob
  url?: string
  mimeType: string
  revisedPrompt?: string
}

const IMAGES_ENDPOINT = '/api/tuzi/images'
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const DRAW_TIMEOUT = 200_000

const withDeadline = (signal: AbortSignal | undefined, ms: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms)
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) {
    controller.abort(signal.reason)
  } else {
    signal?.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

const errorMessage = (text: string) => {
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>
      const error = record.error
      if (typeof error === 'object' && error !== null) {
        const message = (error as Record<string, unknown>).message
        if (typeof message === 'string' && message) {
          return message
        }
      }
      for (const key of ['message', 'msg', 'detail'] as const) {
        if (typeof record[key] === 'string' && record[key]) {
          return record[key] as string
        }
      }
    }
  } catch {
    // 非 JSON 响应直接展示原文
  }
  return text.trim().slice(0, 500) || '未知错误'
}

const sniffMime = (bytes: Uint8Array): string => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif'
  }
  return 'image/png'
}

const base64Bytes = (value: string): Uint8Array => {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const dataUrlBytes = (value: string): { bytes: Uint8Array; mimeType: string } | null => {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(value)
  if (!match) {
    return null
  }
  const bytes = base64Bytes(match[2])
  return { bytes, mimeType: match[1].startsWith('image/') ? match[1] : sniffMime(bytes) }
}

const readImageBytes = async (value: string, signal: AbortSignal): Promise<DrawImage> => {
  if (value.startsWith('data:')) {
    const decoded = dataUrlBytes(value)
    if (!decoded) {
      throw new DrawApiError('返回的图片数据无法解析')
    }
    return {
      blob: new Blob([decoded.bytes.buffer as ArrayBuffer], { type: decoded.mimeType }),
      mimeType: decoded.mimeType,
    }
  }
  if (!/^https?:\/\//i.test(value)) {
    throw new DrawApiError('返回的图片地址或数据格式无法识别')
  }
  const response = await fetch(value, { signal })
  if (!response.ok) {
    // 仍然保留远端地址，页面可以直接展示（只是刷新后可能过期）
    return { url: value, mimeType: 'image/jpeg' }
  }
  const blob = await response.blob()
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new DrawApiError('生成的图片超过 25MB，已停止下载')
  }
  return {
    blob,
    url: value,
    mimeType: blob.type.startsWith('image/') ? blob.type : 'image/jpeg',
  }
}

const failureHint = (value: string | undefined) => {
  if (value?.includes('PROHIBITED_CONTENT')) {
    return '内容被拒绝：提示词可能包含违规内容'
  }
  if (value?.includes('NO_IMAGE')) {
    return '模型没有生成图片，请尝试更具体、更明确的提示词'
  }
  return null
}

/** 通过服务端代理调用 tu-zi 文生图，返回下载好的图片（或远端 URL） */
export const generateDrawImages = async ({
  model,
  prompt,
  signal,
  n = 1,
}: {
  model: string
  prompt: string
  signal?: AbortSignal
  n?: number
}): Promise<DrawImage[]> => {
  const deadline = withDeadline(signal, DRAW_TIMEOUT)
  try {
    const response = await fetch(IMAGES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n }),
      signal: deadline.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new DrawApiError(errorMessage(text), response.status)
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new DrawApiError('绘图接口返回的不是有效 JSON')
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    if (record.success === false || record.error) {
      throw new DrawApiError(errorMessage(text), response.status)
    }
    const data = Array.isArray(record.data) ? record.data : []
    const images: DrawImage[] = []
    for (const item of data.slice(0, 4)) {
      if (typeof item !== 'object' || item === null) {
        continue
      }
      const entry = item as Record<string, unknown>
      const revisedPrompt =
        typeof entry.revised_prompt === 'string' ? entry.revised_prompt : undefined
      const hint = failureHint(revisedPrompt)
      if (hint) {
        throw new DrawApiError(hint)
      }
      const b64 = typeof entry.b64_json === 'string' ? entry.b64_json.trim() : ''
      if (b64) {
        const bytes = base64Bytes(b64)
        const mimeType = sniffMime(bytes)
        images.push({
          blob: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
          mimeType,
          revisedPrompt,
        })
        continue
      }
      const url = typeof entry.url === 'string' ? entry.url.trim() : ''
      if (url) {
        images.push(await readImageBytes(url, deadline.signal))
      }
    }
    if (images.length === 0) {
      throw new DrawApiError('绘图接口没有返回图片')
    }
    return images
  } finally {
    deadline.cleanup()
  }
}
