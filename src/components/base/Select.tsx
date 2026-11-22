import clsx from 'clsx'
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from './anchored.js'
import { IconCheckOutline16, IconChevronDownOutline14 } from './icons.js'
import styles from './Select.module.css'

export type SelectOption<T extends string> = {
  value: T
  label: string
  lang?: string
  /** 分组标题：相邻且同名的一组选项前渲染一次标题 */
  group?: string
  /** 提示项：显示但不可点击（如“当前 Key 没有可用模型”） */
  disabled?: boolean
}

/**
 * 胶囊形选择器：触发器高 36px、圆角 18px、浅灰底，下拉菜单选中项右侧打勾；
 * 点外部或 Esc 关闭。value 不匹配任何选项时触发器显示 placeholder。
 * options 较多时可开启搜索框。
 */
export const Select = <T extends string>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
  searchable = false,
  searchPlaceholder,
  emptyLabel,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = options.find((option) => option.value === value)
  // 菜单贴右侧展开，最多 320px 高，超出在菜单内滚动
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(open, { align: 'end', maxHeight: 320, minSpace: 160 })
  // Esc 只关菜单，不让外层弹窗一起关闭
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const needSearch = searchable && options.length > 8
  const keyword = query.trim().toLowerCase()
  const visible = keyword
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(keyword) ||
          option.value.toLowerCase().includes(keyword)
      )
    : options

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={clsx(styles.trigger, open && styles.open, className)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {current ? (
          <span lang={current.lang}>{current.label}</span>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
        <span className={styles.arrow}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open && !disabled
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.menu}
              style={position ?? undefined}
              role="listbox"
              aria-label={ariaLabel}
            >
              {needSearch ? (
                <input
                  className={styles.search}
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setQuery(event.target.value)}
                />
              ) : null}
              {visible.map((option, index) => (
                <Fragment key={option.value}>
                  {option.group && option.group !== visible[index - 1]?.group ? (
                    <div className={styles.group} role="presentation">
                      {option.group}
                    </div>
                  ) : null}
                  <div
                    role="option"
                    lang={option.lang}
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    className={clsx(styles.option, option.disabled && styles.optionDisabled)}
                    onClick={() => {
                      if (option.disabled) {
                        return
                      }
                      setOpen(false)
                      onChange(option.value)
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === value ? <IconCheckOutline16 /> : null}
                  </div>
                </Fragment>
              ))}
              {visible.length === 0 ? (
                <div className={styles.empty}>{emptyLabel ?? '—'}</div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
