import { useMemo } from 'react'
import { Select, type SelectOption } from '../base/Select.js'
import { useTranslate } from '../../i18n/index.js'
import { setModel, useSettings } from '../../services/settings.js'
import {
  CHAT_MODELS,
  useGateway,
  type TuziModelOption,
} from '../../services/api/gateway.js'
import styles from './ModelPicker.module.css'

/** 输入框里的模型选择：DeepSeek 对话 / TuZi 第三方 LLM / TuZi 绘图 */
export const ModelPicker = () => {
  const t = useTranslate()
  const model = useSettings((state) => state.model)
  const drawModels = useGateway((state) => state.drawModels)
  const llmModels = useGateway((state) => state.llmModels)
  const hasLlmKey = useGateway((state) => state.hasLlmKey)

  const options = useMemo<SelectOption<string>[]>(() => {
    const chat: SelectOption<string>[] = CHAT_MODELS.map((item) => ({
      value: item.id,
      label: item.label,
      group: t('modelGroupChat'),
    }))
    const llm: SelectOption<string>[] = llmModels.map((item: TuziModelOption) => ({
      value: item.id,
      label: item.label,
      group: t('modelGroupOther'),
    }))
    if (llm.length === 0 && hasLlmKey) {
      llm.push({
        value: '__no_llm__',
        label: t('modelNoLlm'),
        group: t('modelGroupOther'),
        disabled: true,
      })
    }
    const draw: SelectOption<string>[] = drawModels.map((item: TuziModelOption) => ({
      value: item.id,
      label: item.label,
      group: t('modelGroupDraw'),
    }))
    return [...chat, ...llm, ...draw]
  }, [drawModels, hasLlmKey, llmModels, t])

  return (
    <Select
      className={styles.picker}
      value={model}
      options={options}
      onChange={setModel}
      ariaLabel={t('modelPickerLabel')}
      placeholder={t('modelPickerLabel')}
      searchable
      searchPlaceholder={t('modelSearchPlaceholder')}
      emptyLabel={t('modelNoMatch')}
    />
  )
}