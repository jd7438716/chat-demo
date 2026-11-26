import { useState } from 'react'
import { IconEditOutline16 } from '../base/icons.js'
import { useSettings } from '../../services/settings.js'
import { useGateway } from '../../services/api/gateway.js'
import { useIsMobile } from '../../app/viewport.js'
import { IconButton } from '../base/IconButton.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './Settings.module.css'

/** API Key 的编辑状态：输入框与移动端底部的「确定」按钮共用 */
export const useApiKeyEditor = () => {
  const status = useGateway((state) => state.status)
  const serverHasKey = useGateway((state) => state.hasChatKey)
  const storedApiKey = useSettings((state) => state.apiKey)
  // 服务端代理模式下 Key 只在 .env 里，页面不再输入
  const serverMode = status === 'server'
  // 连不上服务端时，手上没有 .env 状态可显示，也不该让用户手填 Key
  const serverUnreachable = status === 'unreachable'
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return {
    apiKey: storedApiKey,
    serverMode,
    serverHasKey,
    serverUnreachable,
    editing,
    setEditing,
    form,
    showInput: !serverMode && !serverUnreachable && (!storedApiKey || editing),
  }
}

type ApiKeyEditor = ReturnType<typeof useApiKeyEditor>

/** API Key：服务端模式显示 .env 状态；静态页面保存后只显示掩码 */
export const ApiKeyField = ({ editor }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const { apiKey, serverMode, serverHasKey, serverUnreachable, editing, setEditing, form, showInput } =
    editor

  return (
    <div className={styles.cell}>
      <div className={styles.apiKey}>
        <div className={styles.label}>{t('apiKeyStart')}</div>
        {serverMode ? (
          <div className={styles.description}>
            {t(serverHasKey ? 'apiKeyFromEnv' : 'apiKeyServerMissing')}
          </div>
        ) : serverUnreachable ? (
          <div className={styles.description}>{t('apiKeyServerUnreachable')}</div>
        ) : apiKey && !editing ? (
          <div className={styles.apiKeySaved}>
            <span className={styles.apiKeyMask}>{'*'.repeat(apiKey.length)}</span>
            <IconButton
              tone="primary"
              icon={<IconEditOutline16 />}
              tooltip={t('apiKeyEdit')}
              onClick={() => setEditing(true)}
            />
          </div>
        ) : (
          <div className={styles.apiKeyInput}>
            <input
              type="password"
              placeholder={t('apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              // 移动端打开设置时不弹键盘，点编辑后才聚焦
              autoFocus={!isMobile || editing}
              value={form.value}
              onChange={(event) => form.setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  void form.submit()
                }
              }}
              onBlur={() => {
                // 修改时没输入就离开，回到已保存的状态
                if (apiKey && !form.value.trim()) {
                  setEditing(false)
                }
              }}
            />
            {!isMobile && form.value.trim() ? (
              <>
                <span className={styles.divider} />
                <button
                  type="button"
                  className={styles.confirm}
                  disabled={form.verifying}
                  // 保持输入框焦点
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void form.submit()}
                >
                  {form.verifying ? t('apiKeyVerifying') : t('confirm')}
                </button>
              </>
            ) : null}
          </div>
        )}
        {showInput && form.error ? <div className={styles.error}>{form.error}</div> : null}
      </div>
    </div>
  )
}

/** 移动端：输入 API Key 时在选项下方显示整行「确定」 */
export const ApiKeyConfirm = ({ editor: { showInput, form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  return showInput && form.value.trim() ? (
    <button
      type="button"
      className={styles.mobileConfirm}
      disabled={form.verifying}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void form.submit()}
    >
      {form.verifying ? t('apiKeyVerifying') : t('confirm')}
    </button>
  ) : null
}
