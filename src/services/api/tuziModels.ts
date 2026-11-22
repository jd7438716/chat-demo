/** 服务端代理返回的 TuZi 模型（/api/tuzi/models） */
export type TuziModel = {
  id: string
  category: string | null
  ownedBy: string | null
  tags: string | null
  endpoints: string[]
}

export type TuziModelLists = {
  /** TuZiKey（绘图分组）可用的生图模型 */
  image: TuziModel[]
  /** TuZiLLMKey（文本分组）可用的对话模型 */
  llm: TuziModel[]
}

export class TuziModelsError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TuziModelsError'
    this.status = status
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

const readModels = (value: unknown): TuziModel[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): TuziModel[] => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || !entry.id) {
      return []
    }
    return [
      {
        id: entry.id,
        category: typeof entry.category === 'string' ? entry.category : null,
        ownedBy: typeof entry.ownedBy === 'string' ? entry.ownedBy : null,
        tags: typeof entry.tags === 'string' ? entry.tags : null,
        endpoints: Array.isArray(entry.endpoints)
          ? entry.endpoints.filter((value): value is string => typeof value === 'string')
          : [],
      },
    ]
  })
}

/** 查询服务端当前两把 Key 可用的 TuZi 模型（绘图 / LLM 分开） */
export const fetchTuziModels = async (force = false): Promise<TuziModelLists> => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    25_000
  )
  try {
    const response = await fetch(`/api/tuzi/models${force ? '?refresh=1' : ''}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new TuziModelsError(errorMessage(text), response.status)
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new TuziModelsError('TuZi 模型列表不是有效的 JSON')
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    return {
      image: readModels(record.image),
      llm: readModels(record.llm),
    }
  } finally {
    clearTimeout(timer)
  }
}

const IMAGE_RE = /image|banana|flux|seedream|seededit|dall|gpt-image|mj/i
const NON_LLM_RE = /video|audio|speech|tts|whisper|embed|rerank|moderation|sora|dall|mj|ocr|guard|image/i

/** 绘图模型：category=生图、图片端点或名称特征 */
export const isTuziImageModel = (model: TuziModel): boolean => {
  const category = model.category ?? ''
  if (category) {
    return category.includes('生图') || category.toLowerCase().includes('image')
  }
  return (
    IMAGE_RE.test(model.id) ||
    model.endpoints.some((value) => /image-generation|generate|edit/i.test(value))
  )
}

/** 对话模型：排除图片/视频/音频/向量等，其余视为 OpenAI 兼容 LLM */
export const isTuziLlmModel = (model: TuziModel): boolean => {
  if (!model.id || model.id.includes('*') || isTuziImageModel(model)) {
    return false
  }
  const text = `${model.id} ${model.category ?? ''} ${model.tags ?? ''}`
  if (NON_LLM_RE.test(text)) {
    return false
  }
  return !/视频|音频|语音|嵌入|重排|图片|生图|向量/.test(text)
}