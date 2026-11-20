import { useEffect, useState } from 'react'

interface Props {
  title: string
  artist: string | null
  coverUrl: string | null
}

/** Caratula y datos de la cancion sobre el visualizador. */
export function NowPlaying({ title, artist, coverUrl }: Props) {
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [coverUrl])

  return (
    <div className="nowplaying">
      {coverUrl && !coverFailed && (
        <img
          className="nowplaying__cover"
          src={coverUrl}
          alt=""
          onError={() => setCoverFailed(true)}
        />
      )}
      <div className="nowplaying__text">
        <span className="nowplaying__title" title={title}>
          {title}
        </span>
        {artist && <span className="nowplaying__artist">{artist}</span>}
      </div>
    </div>
  )
}
