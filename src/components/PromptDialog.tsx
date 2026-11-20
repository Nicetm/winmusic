import { useState } from 'react'

interface Props {
  title: string
  initialValue?: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** Pide un texto (nombre de lista). window.prompt no existe en Electron. */
export function PromptDialog({ title, initialValue = '', confirmLabel, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()

  const submit = () => {
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="dialog">
      <div className="dialog__box">
        <p className="dialog__text">{title}</p>
        <input
          className="dialog__input"
          autoFocus
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="dialog__actions">
          <button className="dialog__btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="dialog__btn" onClick={submit} disabled={!trimmed}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
