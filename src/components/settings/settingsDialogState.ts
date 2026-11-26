import { create } from 'zustand'
import { hasChatApiKey } from '../../services/api/credentials.js'
import { retryGatewayProbe, useGateway } from '../../services/api/gateway.js'
import { showToast } from '../base/toastState.js'

/** 设置弹窗的分组：通用设置 / 数据管理 */
export type SettingsSection = 'general' | 'data'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/**
 * 没有可用的对话 Key 时打开设置并选中 API Key 所在的「数据管理」，返回是否已有 Key。
 * 服务端连不上（或还在探测）时只提示重试：Key 在 .env 里，弹「输入 API Key」会误导用户。
 */
export const ensureApiKey = () => {
  if (hasChatApiKey()) {
    return true
  }
  const { status } = useGateway.getState()
  if (status === 'pending') {
    showToast({ key: 'serverConnecting' })
    return false
  }
  if (status === 'unreachable') {
    showToast({ key: 'apiKeyServerUnreachable' })
    void retryGatewayProbe()
    return false
  }
  openSettings('data')
  return false
}
