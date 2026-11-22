import { create } from 'zustand'
import type { ChatModel } from './types.js'
import {
  fetchTuziModels,
  isTuziImageModel as isImageCatalogModel,
  isTuziLlmModel as isLlmCatalogModel,
  type TuziModel,
} from './tuziModels.js'
import { setModel, useSettings } from '../settings.js'

/** 页面默认的对话模型；没有绘图 / 第三方能力时也使用它 */
export const DEFAULT_CHAT_MODEL: ChatModel = 'deepseek-flash'

export type ChatModelOption = { id: ChatModel; label: string }

/** DeepSeek 官方对话模型（服务端使用 .env 的 ApiKey；静态页面使用手动 Key） */
export const CHAT_MODELS: ChatModelOption[] = [
  { id: 'deepseek-flash', label: 'DeepSeek Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
]

export type TuziModelOption = TuziModel & { label: string }

export type GatewayStatus = 'pending' | 'server' | 'client'
export type ModelsStatus = 'idle' | 'loading' | 'ready' | 'error'

type GatewayState = {
  /** pending：还没探测完 /api/config；server：服务端代理可用；client：纯静态页面，手动 Key 直连 */
  status: GatewayStatus
  hasChatKey: boolean
  /** TuZiKey 是否存在（绘图） */
  hasDrawKey: boolean
  /** TuZiLLMKey 是否存在（第三方 LLM） */
  hasLlmKey: boolean
  drawModels: TuziModelOption[]
  llmModels: TuziModelOption[]
  modelsStatus: ModelsStatus
  modelsError: string | null
}

/** 模型名转显示名：gemini-3.1-flash-image → Gemini 3.1 Flash Image */
const TOKEN_LABELS: Record<string, string> = {
  gpt: 'GPT',
  ai: 'AI',
  hd: 'HD',
  '1k': '1K',
  '2k': '2K',
  '3k': '3K',
  '4k': '4K',
  sdxl: 'SDXL',
  mj: 'MJ',
}

export const formatModelLabel = (id: string) =>
  id
    .split('-')
    .filter(Boolean)
    .map((token) => TOKEN_LABELS[token.toLowerCase()] ?? token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

const MODEL_CACHE_KEY = 'chat-demo:tuzi-models-v2'
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000

type ModelCache = {
  savedAt: number
  drawModels: TuziModelOption[]
  llmModels: TuziModelOption[]
}

const readList = (value: unknown): TuziModelOption[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (model): model is TuziModelOption =>
      typeof model === 'object' &&
      model !== null &&
      typeof (model as TuziModelOption).id === 'string' &&
      (model as TuziModelOption).id !== '' &&
      typeof (model as TuziModelOption).label === 'string'
  )
}

const readModelCache = (): { drawModels: TuziModelOption[]; llmModels: TuziModelOption[] } => {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY)
    if (!raw) {
      return { drawModels: [], llmModels: [] }
    }
    const cached = JSON.parse(raw) as Partial<ModelCache>
    if (
      !cached ||
      typeof cached.savedAt !== 'number' ||
      Date.now() - cached.savedAt > MODEL_CACHE_TTL
    ) {
      return { drawModels: [], llmModels: [] }
    }
    return { drawModels: readList(cached.drawModels), llmModels: readList(cached.llmModels) }
  } catch {
    return { drawModels: [], llmModels: [] }
  }
}

const writeModelCache = (drawModels: TuziModelOption[], llmModels: TuziModelOption[]) => {
  try {
    localStorage.setItem(
      MODEL_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), drawModels, llmModels })
    )
  } catch {
    // 存储不可用时只使用内存中的列表
  }
}

export const useGateway = create<GatewayState>(() => ({
  status: 'pending',
  hasChatKey: false,
  hasDrawKey: false,
  hasLlmKey: false,
  drawModels: [],
  llmModels: [],
  modelsStatus: 'idle',
  modelsError: null,
}))

let initTask: Promise<void> | undefined

/** 服务端代理查询 TuZi 模型，按绘图 / 对话拆分 */
export const refreshTuziModels = async (force = false): Promise<void> => {
  const { hasDrawKey, hasLlmKey } = useGateway.getState()
  if (!hasDrawKey && !hasLlmKey) {
    useGateway.setState({
      drawModels: [],
      llmModels: [],
      modelsStatus: 'idle',
      modelsError: null,
    })
    return
  }
  useGateway.setState({ modelsStatus: 'loading', modelsError: null })
  try {
    const lists = await fetchTuziModels(force)
    const drawModels = lists.image
      .filter(isImageCatalogModel)
      .map((model) => ({ ...model, label: formatModelLabel(model.id) }))
    const drawIds = new Set(drawModels.map((model) => model.id))
    const llmModels = lists.llm
      .filter((model) => isLlmCatalogModel(model) && !drawIds.has(model.id))
      .map((model) => ({ ...model, label: formatModelLabel(model.id) }))
    useGateway.setState({ drawModels, llmModels, modelsStatus: 'ready', modelsError: null })
    writeModelCache(drawModels, llmModels)
  } catch (error) {
    useGateway.setState({
      modelsStatus: 'error',
      modelsError: error instanceof Error ? error.message : String(error),
    })
  } finally {
    normalizeSelectedModel()
  }
}

/** 选中了当前不可用的模型（如静态页面打开了带绘图模型的本地设置）时退回默认对话模型 */
export const normalizeSelectedModel = () => {
  const state = useGateway.getState()
  if (state.modelsStatus === 'loading') {
    return
  }
  const current = useSettings.getState().model
  const chatIds = new Set<string>(CHAT_MODELS.map((model) => model.id))
  const drawAllowed =
    state.hasDrawKey && state.drawModels.some((model) => model.id === current)
  const llmAllowed =
    state.hasLlmKey && state.llmModels.some((model) => model.id === current)
  if (!chatIds.has(current) && !drawAllowed && !llmAllowed) {
    setModel(DEFAULT_CHAT_MODEL)
  }
}

const detectServer = async (): Promise<void> => {
  try {
    const response = await fetch('/api/config', {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('not a local server')
    }
    const data: unknown = await response.json()
    const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    if (record.mode !== 'server') {
      throw new Error('not a local server')
    }
    const chat = record.chat as Record<string, unknown> | undefined
    const draw = record.draw as Record<string, unknown> | undefined
    const llm = record.llm as Record<string, unknown> | undefined
    const hasChatKey = chat?.hasKey === true
    const hasDrawKey = draw?.hasKey === true
    const hasLlmKey = llm?.hasKey === true
    useGateway.setState({ status: 'server', hasChatKey, hasDrawKey, hasLlmKey })
    if (hasDrawKey || hasLlmKey) {
      const cached = readModelCache()
      if (cached.drawModels.length > 0 || cached.llmModels.length > 0) {
        useGateway.setState({
          drawModels: cached.drawModels,
          llmModels: cached.llmModels,
          modelsStatus: 'ready',
        })
      }
      void refreshTuziModels()
    } else {
      normalizeSelectedModel()
    }
  } catch {
    useGateway.setState({
      status: 'client',
      hasChatKey: false,
      hasDrawKey: false,
      hasLlmKey: false,
    })
    normalizeSelectedModel()
  }
}

/** 启动时探测服务端；结果只初始化一次 */
export const initGateway = (): Promise<void> => {
  initTask ??= detectServer()
  return initTask
}

/** deepseek-v4-pro 不支持服务端联网工具与自动标题；请求时要省略 tools/title */
export const supportsServerTools = (model: string | null | undefined) =>
  model !== 'deepseek-v4-pro'

export const isChatModel = (id: string): id is ChatModel =>
  CHAT_MODELS.some((model) => model.id === id)

export const isDrawModel = (id: string) =>
  useGateway.getState().drawModels.some((model) => model.id === id)

/** TuZi 的 OpenAI 兼容 LLM（与 DeepSeek 官方模型区分） */
export const isTuziChatModel = (id: string) =>
  useGateway.getState().llmModels.some((model) => model.id === id)

export const getModelProvider = (id: string): 'deepseek' | 'tuzi' =>
  isTuziChatModel(id) ? 'tuzi' : 'deepseek'

export const getModelKind = (id: string): 'chat' | 'draw' => (isDrawModel(id) ? 'draw' : 'chat')

/** 未识别的模型（导入数据、旧设置）按默认对话模型处理 */
export const resolveChatModel = (id: string): ChatModel =>
  isChatModel(id) ? id : DEFAULT_CHAT_MODEL