export type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'repeatOne'
  | 'volumeHigh'
  | 'volumeLow'
  | 'volumeMute'
  | 'minimize'
  | 'maximize'
  | 'close'
  | 'audio'
  | 'video'
  | 'up'
  | 'down'
  | 'remove'
  | 'note'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'pip'
  | 'equalizer'
  | 'search'
  | 'sun'
  | 'moon'
  | 'more'
  | 'lyrics'
  | 'mini'
  | 'help'
  | 'save'
  | 'trash'
  | 'subtitles'
  | 'timer'
  | 'speed'

interface Props {
  name: IconName
  size?: number
  className?: string
}

const PATHS: Record<IconName, React.ReactNode> = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
  stop: <path d="M6 6h12v12H6z" />,
  prev: <path d="M6 6h2v12H6zM20 6v12L9 12z" />,
  next: <path d="M16 6h2v12h-2zM4 6l11 6L4 18z" />,
  shuffle: (
    <path d="M17 3l4 4-4 4v-3h-2.5l-2.3 2.6-2-2.3L13 5h4V3zM3 7h3.5l10 11H21v-3l4 4-4 4v-3h-5.5L5 9H3V7z" />
  ),
  repeat: (
    <path d="M7 7h10v3l5-4-5-4v3H5v6h2V7zm10 10H7v-3l-5 4 5 4v-3h12v-6h-2v4z" />
  ),
  repeatOne: (
    <path d="M7 7h10v3l5-4-5-4v3H5v6h2V7zm10 10H7v-3l-5 4 5 4v-3h12v-6h-2v4zm-5-5h-1l-1.5 1v1.2L11 12v4h1.3V11z" />
  ),
  volumeHigh: (
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z" />
  ),
  volumeLow: (
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" />
  ),
  volumeMute: (
    <path d="M3 9v6h4l5 5V4L7 9H3zm18.6 3L24 9.4 22.6 8 20 10.6 17.4 8 16 9.4 18.6 12 16 14.6 17.4 16 20 13.4 22.6 16 24 14.6 21.4 12z" />
  ),
  minimize: <path d="M5 11h14v2H5z" />,
  maximize: <path d="M5 5h14v14H5V5zm2 2v10h10V7H7z" />,
  close: (
    <path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z" />
  ),
  audio: (
    <path d="M12 3v10.6A4 4 0 1014 17V7h4V3h-6z" />
  ),
  video: (
    <path d="M4 5h12v4l4-3v12l-4-3v4H4V5zm2 2v10h8V7H6z" />
  ),
  up: <path d="M12 8l6 6H6z" />,
  down: <path d="M12 16L6 10h12z" />,
  remove: (
    <path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z" />
  ),
  note: (
    <path d="M12 3v10.6A4 4 0 1014 17V7h4V3h-6z" />
  ),
  fullscreen: (
    <path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />
  ),
  fullscreenExit: (
    <path d="M8 4h2v6H4V8h4V4zm6 0h2v4h4v2h-6V4zM4 14h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z" />
  ),
  pip: (
    <path d="M3 5h18v14H3V5zm2 2v10h14V7H5zm7 4h5v4h-5v-4z" />
  ),
  equalizer: (
    <path d="M7 3h2v6h2v2H5V9h2V3zm0 10h2v8H7v-8zm8-10h2v2h2v2h-6V5h2V3zm0 6h2v12h-2V9z" />
  ),
  search: (
    <path d="M10 3a7 7 0 014.9 11.95l4.07 4.07-1.4 1.41-4.08-4.07A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z" />
  ),
  sun: (
    <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0-6l1.5 3h-3L12 2zm0 20l-1.5-3h3L12 22zM2 12l3-1.5v3L2 12zm20 0l-3 1.5v-3L22 12zM5 5l3 1v2L5 5zm14 0l-1 3h-2l3-3zM5 19l1-3h2l-3 3zm14 0l-3-1v-2l3 3z" />
  ),
  moon: (
    <path d="M12 3a9 9 0 109 9 7 7 0 01-9-9z" />
  ),
  more: (
    <path d="M5 10a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4z" />
  ),
  lyrics: (
    <path d="M3 5h12v2H3V5zm0 4h12v2H3V9zm0 4h8v2H3v-2zm15-8h4v3h-2v8.5A3.5 3.5 0 1118 14V5z" />
  ),
  mini: (
    <path d="M3 5h18v14H3V5zm2 2v10h14V7H5zm2 6h10v2H7v-2z" />
  ),
  save: (
    <path d="M5 3h11l3 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V3zm2 2v4h8V5H7zm5 7a3 3 0 100 6 3 3 0 000-6z" />
  ),
  trash: (
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h-2v-8h2z" />
  ),
  subtitles: (
    <path
      fillRule="evenodd"
      d="M3 5h18v14H3V5zm2 2v10h14V7H5zm2 5h4v2H7v-2zm6 0h4v2h-4v-2zm-6-3h10v2H7V9z"
    />
  ),
  timer: (
    <path
      fillRule="evenodd"
      d="M9 1h6v2H9V1zm3 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm-1 2h2v5.4l3.3 2-1 1.7L11 14.6V8z"
    />
  ),
  speed: (
    <path
      fillRule="evenodd"
      d="M12 4a10 10 0 018.7 15H3.3A10 10 0 0112 4zm0 2a8 8 0 00-7.4 11h14.8A8 8 0 0012 6zm4.2 2.4l1.4 1.4-4.2 4.3a1.8 1.8 0 11-1.4-1.4l4.2-4.3z"
    />
  ),
  help: (
    <path
      fillRule="evenodd"
      d="M12 2a10 10 0 110 20 10 10 0 010-20zm0 2a8 8 0 100 16 8 8 0 000-16zm-1 12h2v2h-2v-2zm1-10a3.5 3.5 0 013.5 3.5c0 1.7-.8 2.3-1.6 2.8-.6.4-.9.6-.9 1.1v.6h-2v-.8c0-1.2.6-1.7 1.3-2.2.6-.4 1.2-.7 1.2-1.5a1.5 1.5 0 00-3 0h-2A3.5 3.5 0 0112 6z"
    />
  ),
}

export function Icon({ name, size = 18, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
