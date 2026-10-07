import { useId } from 'react'

/** Corpo do Goust: cabeça redonda, braço à esquerda e a barra ondulada embaixo (inclinado, como no mascote). */
const CORPO = 'M23 63C19 35 35 13 57 13C79 13 91 31 89 53L88 79C88 86 82 90 77 86C73 83 70 88 65 90C60 92 57 86 52 87C47 88 44 94 38 92C33 90 33 84 28 84C21 84 15 81 14 75C13 69 18 65 23 66Z'
const OLHOS = [{ x: 49, y: 37 }, { x: 64, y: 35 }]
const ESTRELA = 'M88 3C89 9 91 11 97 12C91 13 89 15 88 21C87 15 85 13 79 12C85 11 87 9 88 3Z'

type Variante = 'brilho' | 'mono' | 'contorno'

/**
 * Mascote da Goust.
 * - brilho: degradê branco → azul com halo e estrela (logo, momentos de destaque);
 * - mono: uma cor só (currentColor), olhos vazados, sem halo (lugares discretos: ícones, estados vazios);
 * - contorno: só o traço (sobre fundos claros ou muito pequenos).
 * animado: flutua, pisca e a estrela cintila (respeita "reduzir movimento").
 */
export function Mascote({ tamanho = 32, variante = 'brilho', animado = false, estrela = true, className = '' }: {
  tamanho?: number; variante?: Variante; animado?: boolean; estrela?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const olhos = OLHOS.map((o, i) => (
    <rect key={i} x={o.x} y={o.y} width="7" height="15" rx="3.5" transform={`rotate(-10 ${o.x + 3.5} ${o.y + 7.5})`} />
  ))
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <defs>
        <radialGradient id={`${id}c`} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#cfe6ff" />
          <stop offset="0.8" stopColor="#6fa8ff" />
          <stop offset="1" stopColor="#3a7bff" />
        </radialGradient>
        <filter id={`${id}h`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feFlood floodColor="#2f74ff" floodOpacity="0.9" />
          <feComposite in2="b" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <mask id={`${id}m`}>
          <rect width="100" height="100" fill="white" />
          <g fill="black" className={animado ? 'goust-piscar' : ''}>{olhos}</g>
        </mask>
      </defs>
      <g className={animado ? 'goust-flutuar' : ''}>
        {variante === 'brilho' && (
          <>
            <g transform="rotate(-6 52 55)" filter={`url(#${id}h)`}>
              <path d={CORPO} fill={`url(#${id}c)`} />
            </g>
            <g transform="rotate(-6 52 55)" fill="#0b0d14" className={animado ? 'goust-piscar' : ''}>{olhos}</g>
          </>
        )}
        {variante === 'mono' && (
          <g transform="rotate(-6 52 55)"><path d={CORPO} fill="currentColor" mask={`url(#${id}m)`} /></g>
        )}
        {variante === 'contorno' && (
          <g transform="rotate(-6 52 55)">
            <path d={CORPO} fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
            <g fill="currentColor" className={animado ? 'goust-piscar' : ''}>{olhos}</g>
          </g>
        )}
      </g>
      {estrela && (
        <path d={ESTRELA} fill={variante === 'brilho' ? '#ffffff' : 'currentColor'} className={animado ? 'goust-estrela' : ''}
          style={variante === 'brilho' ? { filter: 'drop-shadow(0 0 3px #7fb2ff)' } : undefined} />
      )}
    </svg>
  )
}

/** Logo: mascote + "Goust" na fonte dos títulos. */
export function LogoGoust({ tamanho = 30, texto = true, animado = true, className = '' }: { tamanho?: number; texto?: boolean; animado?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Mascote tamanho={tamanho} animado={animado} />
      {texto && <span className="titulo-display font-semibold tracking-tight" style={{ fontSize: tamanho * 0.66 }}>Goust</span>}
    </span>
  )
}

/** Carregando com o mascote flutuando e a sombra respirando (telas inteiras e estados longos). */
export function CarregandoGoust({ tamanho = 64, texto }: { tamanho?: number; texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Mascote tamanho={tamanho} animado />
        <span className="goust-sombra absolute -bottom-2 left-1/2 h-2 w-1/2 -translate-x-1/2 rounded-full bg-[var(--sinal-a)]/35 blur-[6px]" />
      </div>
      {texto && <p className="text-sm text-muted">{texto}</p>}
    </div>
  )
}
