import { useSettings } from '../settings.js'
import { useGateway } from './gateway.js'

/** 服务端代理模式：Key 只留在服务端，客户端请求同源接口 */
export const isServerMode = (): boolean => useGateway.getState().status === 'server'

/**
 * 对话 Key：服务端模式下不使用客户端 Key（代理会注入 .env 的 ApiKey）；
 * 纯静态页面则使用浏览器里保存的 Key，直接请求 api.deepseek.com。
 */
export const getChatApiKey = (): string =>
  isServerMode() ? '' : useSettings.getState().apiKey || ''

export const hasChatApiKey = (): boolean =>
  isServerMode() ? useGateway.getState().hasChatKey : !!useSettings.getState().apiKey

/** 绘图 Key：只由服务端读取 .env 的 TuZiKey */
export const hasDrawApiKey = (): boolean =>
  isServerMode() && useGateway.getState().hasDrawKey

/** 第三方 LLM Key：只由服务端读取 .env 的 TuZiLLMKey */
export const hasLlmApiKey = (): boolean =>
  isServerMode() && useGateway.getState().hasLlmKey