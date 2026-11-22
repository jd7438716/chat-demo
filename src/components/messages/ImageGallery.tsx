import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { loadFile } from '../../services/chat/db.js'
import { formatModelLabel } from '../../services/api/gateway.js'
import type { ImagePart } from '../../services/chat/types.js'
import { IconDownloadOutline16, IconImageOutline16 } from '../base/icons.js'
import styles from './ImageGallery.module.css'

const extension = (mimeType: string) => {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg'
  }
  if (mimeType.includes('webp')) {
    return 'webp'
  }
  if (mimeType.includes('gif')) {
    return 'gif'
  }
  return 'png'
}

const Figure = ({ image, index }: { image: ImagePart; index: number }) => {
  const t = useTranslate()
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    if (!image.id) {
      setUrl(image.url ?? null)
      setMissing(!image.url)
      return
    }
    void loadFile(image.id)
      .then((blob) => {
        if (!alive) {
          return
        }
        if (!blob) {
          setUrl(image.url ?? null)
          setMissing(!image.url)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (alive) {
          setUrl(image.url ?? null)
          setMissing(!image.url)
        }
      })
    return () => {
      alive = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [image.id, image.url])

  return (
    <figure className={styles.figure}>
      <div className={styles.frame}>
        {url ? (
          <>
            <a
              className={styles.imageLink}
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={t('drawImageOpen')}
            >
              <img className={styles.image} src={url} alt={image.prompt} loading="lazy" />
            </a>
            <div className={styles.actions}>
              <a
                className={styles.action}
                href={url}
                download={`draw-${index + 1}.${extension(image.mimeType)}`}
                aria-label={t('drawImageDownload')}
                title={t('drawImageDownload')}
              >
                <IconDownloadOutline16 />
              </a>
            </div>
          </>
        ) : missing ? (
          <div className={styles.missing}>
            <IconImageOutline16 />
            <span>{t('drawImageLost')}</span>
          </div>
        ) : (
          <div className={styles.loading} aria-hidden />
        )}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.model}>{formatModelLabel(image.model)}</span>
        {image.revisedPrompt && image.revisedPrompt !== image.prompt ? (
          <span className={styles.revised}>{image.revisedPrompt}</span>
        ) : null}
      </figcaption>
    </figure>
  )
}

/** 绘图结果：一张或多张图片按网格展示，图片原件从本地 IndexedDB 读取 */
export const ImageGallery = ({ images }: { images: ImagePart[] }) => (
  <div className={styles.gallery}>
    {images.map((image, index) => (
      <Figure key={image.id || `remote-${index}`} image={image} index={index} />
    ))}
  </div>
)

/** 生成中的占位：旋转圆环 + 文案 */
export const DrawPlaceholder = () => {
  const t = useTranslate()
  return (
    <div className={styles.placeholder} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      <span>{t('drawingInProgress')}</span>
    </div>
  )
}