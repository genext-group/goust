import type { Plataforma } from '../api'

/** Glifos simples para identificar a plataforma (não são os logotipos oficiais). */
export function IconePlataforma({ plataforma, className = 'size-4' }: { plataforma: Plataforma; className?: string }) {
  if (plataforma === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
        <path d="M14 4c.6 2.6 2.4 4 5 4.2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  )
}

export const NOME_PLATAFORMA: Record<Plataforma, string> = { tiktok: 'TikTok', instagram: 'Instagram' }

export function SeloPlataforma({ plataforma }: { plataforma: Plataforma }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: `var(--${plataforma})`,
        background: `color-mix(in srgb, var(--${plataforma}) 10%, transparent)`,
      }}
    >
      <IconePlataforma plataforma={plataforma} className="size-3" />
      {NOME_PLATAFORMA[plataforma]}
    </span>
  )
}
