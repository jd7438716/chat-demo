/** 服务端代理的 TuZi OpenAI 兼容对话 */
export type TuziChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type TuziChatDelta = {
  type: 'text' | 'thinking'
  text: string
}

export class TuziChatError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TuziChatError'
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

const readText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          const text = (item as Record<string, unknown>).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  return ''
}

/**
 * POST /api/tuzi/chat（stream: true），逐段回调正文或思考内容。
 * 正常结束（收到 [DONE] 或流关闭）时返回；服务端错误抛 TuziChatError。
 */
export const streamTuziChat = async ({
  model,
  messages,
  signal,
  onDelta,
}: {
  model: string
  messages: TuziChatMessage[]
  signal: AbortSignal
  onDelta: (delta: TuziChatDelta) => void
}): Promise<void> => {
  const response = await fetch('/api/tuzi/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !contentType.includes('text/event-stream')) {
    const text = await response.text()
    throw new TuziChatError(errorMessage(text), response.status)
  }
  if (!response.body) {
    throw new TuziChatError('对话接口没有返回流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const handleData = (data: string) => {
    if (data === '[DONE]') {
      finished = true
      return
    }
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }
    if (typeof payload !== 'object' || payload === null) {
      return
    }
    const record = payload as Record<string, unknown>
    if (record.error) {
      throw new TuziChatError(errorMessage(data))
    }
    const choices = Array.isArray(record.choices) ? record.choices : []
    const choice = choices[0]
    if (typeof choice !== 'object' || choice === null) {
      return
    }
    const choiceRecord = choice as Record<string, unknown>
    const delta = choiceRecord.delta ?? choiceRecord.message
    if (typeof delta !== 'object' || delta === null) {
      return
    }
    const deltaRecord = delta as Record<string, unknown>
    const thinking = readText(
      deltaRecord.reasoning_content ?? deltaRecord.reasoning ?? deltaRecord.reasoning_text
    )
    if (thinking) {
      onDelta({ type: 'thinking', text: thinking })
    }
    const content = readText(deltaRecord.content)
    if (content) {
      onDelta({ type: 'text', text: content })
    }
  }

  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) {
          break
        }
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (line.startsWith('data:')) {
          handleData(line.slice(5).trimStart())
        }
        if (finished) {
          break
        }
      }
    }
    const rest = buffer.trim()
    if (!finished && rest.startsWith('data:')) {
      handleData(rest.slice(5).trimStart())
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // 流已结束或已中止
    }
  }
}
