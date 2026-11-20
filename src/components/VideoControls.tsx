import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

/** none: sin subtitulos cargados; on/off: cargados y visibles u ocultos. */
export type SubtitlesState = 'none' | 'on' | 'off'

interface Props {
  /** Contenedor del escenario que entra en pantalla completa. */
  stageRef: React.RefObject<HTMLDivElement | null>
  mediaRef: React.RefObject<HTMLVideoElement | null>
  subtitles: SubtitlesState
  onSubtitles: () => void
}

export function VideoControls({ stageRef, mediaRef, subtitles, onSubtitles }: Props) {
  const { t } = useT()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [pipSupported] = useState(() => document.pictureInPictureEnabled)
  const [inPip, setInPip] = useState(false)

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
  }, [stageRef])

  const togglePip = useCallback(async () => {
    const media = mediaRef.current
    if (!media) return
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else {
      await media.requestPictureInPicture()
    }
  }, [mediaRef])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const onEnter = () => setInPip(true)
    const onLeave = () => setInPip(false)
    media.addEventListener('enterpictureinpicture', onEnter)
    media.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      media.removeEventListener('enterpictureinpicture', onEnter)
      media.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [mediaRef])

  const subtitlesTitle =
    subtitles === 'none'
      ? t('ctl.subtitlesLoad')
      : subtitles === 'on'
        ? t('ctl.subtitlesOff')
        : t('ctl.subtitlesOn')

  const fullscreenTitle = isFullscreen ? t('ctl.fullscreenExit') : t('ctl.fullscreen')

  return (
    <div className="videoctrl">
      <button
        className={`videoctrl__btn${subtitles === 'on' ? ' is-active' : ''}`}
        onClick={onSubtitles}
        aria-label={subtitlesTitle}
        title={subtitlesTitle}
      >
        <Icon name="subtitles" size={18} />
      </button>
      {pipSupported && (
        <button
          className={`videoctrl__btn${inPip ? ' is-active' : ''}`}
          onClick={togglePip}
          aria-label={t('ctl.pip')}
          title={t('ctl.pip')}
        >
          <Icon name="pip" size={18} />
        </button>
      )}
      <button
        className="videoctrl__btn"
        onClick={toggleFullscreen}
        aria-label={fullscreenTitle}
        title={fullscreenTitle}
      >
        <Icon name={isFullscreen ? 'fullscreenExit' : 'fullscreen'} size={18} />
      </button>
    </div>
  )
}
