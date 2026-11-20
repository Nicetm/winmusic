import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'

interface Props {
  /** Contenedor del escenario que entra en pantalla completa. */
  stageRef: React.RefObject<HTMLDivElement | null>
  mediaRef: React.RefObject<HTMLVideoElement | null>
}

export function VideoControls({ stageRef, mediaRef }: Props) {
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

  return (
    <div className="videoctrl">
      {pipSupported && (
        <button
          className={`videoctrl__btn${inPip ? ' is-active' : ''}`}
          onClick={togglePip}
          aria-label="Picture in picture"
          title="Picture in picture"
        >
          <Icon name="pip" size={18} />
        </button>
      )}
      <button
        className="videoctrl__btn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        <Icon name={isFullscreen ? 'fullscreenExit' : 'fullscreen'} size={18} />
      </button>
    </div>
  )
}
