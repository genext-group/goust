import { useId } from 'react'
import { CarregandoGoust, Mascote } from './Goust'

/** Marca: o mascote Goust (com brilho, flutuando e piscando). */
export function LogoAnimado({ tamanho = 28 }: { tamanho?: number }) {
  return <Mascote tamanho={tamanho} animado />
}

/** Carregamento das análises: arco em gradiente girando + pontos orbitando. */
export function Orbita({ tamanho = 40, className = '' }: { tamanho?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sinal-a)" />
          <stop offset="1" stopColor="var(--sinal-b)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="3" />
      <g className="anim-girar" style={{ transformOrigin: '24px 24px' }}>
        <path d="M24 5a19 19 0 0 1 19 19" fill="none" stroke={`url(#${id}a)`} strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="anim-girar-reverso" style={{ transformOrigin: '24px 24px' }}>
        <circle cx="24" cy="12" r="2.2" fill="var(--sinal-b)" />
        <circle cx="35" cy="30" r="1.6" fill="var(--sinal-a)" />
        <circle cx="13" cy="30" r="1.3" fill="currentColor" opacity="0.5" />
      </g>
      <circle className="anim-pulso" style={{ transformOrigin: '24px 24px' }} cx="24" cy="24" r="4" fill="var(--sinal-a)" />
    </svg>
  )
}

/** Check que se desenha (etapas concluídas). */
export function CheckDesenhado({ tamanho = 14 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" aria-hidden>
      <path className="anim-desenhar" d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  )
}

/** Ilustração de tela vazia: radar varrendo e pontos (perfis) acendendo. */
export function Radar({ tamanho = 120 }: { tamanho?: number }) {
  const id = useId()
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id={`${id}r`}>
          <stop offset="0" stopColor="var(--sinal-a)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--sinal-a)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--sinal-a)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--sinal-a)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill={`url(#${id}r)`} />
      {[18, 34, 50].map((r) => <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" />)}
      <g className="anim-varrer" style={{ transformOrigin: '60px 60px' }}>
        <path d="M60 60 L110 60 A50 50 0 0 0 95 25 Z" fill={`url(#${id}v)`} />
      </g>
      {[[82, 38, 0], [40, 80, 0.9], [88, 76, 1.7], [36, 42, 2.4]].map(([x, y, d], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={i % 2 ? 'var(--sinal-b)' : 'var(--sinal-a)'} className="anim-piscar"
          style={{ animationDelay: `${d}s` }} />
      ))}
      <circle cx="60" cy="60" r="3.5" fill="currentColor" />
    </svg>
  )
}

/** Tela inteira de carregamento (abertura do app). */
export function TelaCarregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4 text-muted">
        <CarregandoGoust tamanho={64} texto={texto} />
      </div>
    </div>
  )
}
