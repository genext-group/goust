import { useId } from 'react'

/**
 * Corpo do Goust em 3 formas com os MESMOS comandos (o SVG interpola entre elas): a barra ondulada de baixo
 * escorre e se recompõe, como um líquido. Cabeça redonda, braço à esquerda, inclinado.
 */
const CORPOS = [
  'M23 63C19 35 35 13 57 13C79 13 91 31 89 53L88 79C88 86 82 90 77 86C73 83 70 88 65 90C60 92 57 86 52 87C47 88 44 94 38 92C33 90 33 84 28 84C21 84 15 81 14 75C13 69 18 65 23 66Z',
  'M23 63C19 35 35 13 57 13C79 13 90 32 89 54L89 81C89 88 83 92 78 88C74 85 71 85 66 88C61 91 58 89 53 90C48 91 45 90 39 94C34 96 32 87 27 86C20 85 14 80 14 74C14 68 19 64 23 66Z',
  'M23 63C20 34 36 12 57 12C78 12 92 30 89 52L87 78C87 84 81 87 76 84C72 81 69 90 64 92C59 94 56 83 51 84C46 85 43 96 37 90C32 85 34 82 29 82C22 82 16 82 15 76C14 70 17 66 23 66Z',
]
const CORPO = CORPOS[0]
const OLHOS = [{ x: 49, y: 37 }, { x: 64, y: 35 }]
const ESTRELA = 'M88 3C89 9 91 11 97 12C91 13 89 15 88 21C87 15 85 13 79 12C85 11 87 9 88 3Z'
// gotas que escorrem da cauda e voltam (com o filtro "gooey" elas grudam no corpo como líquido)
const GOTAS = [{ cx: 40, cy: 88, r: 5, d: '0s' }, { cx: 62, cy: 87, r: 4, d: '1.1s' }, { cx: 78, cy: 84, r: 3.5, d: '2.2s' }]
// gotas espalhadas que se juntam para formar o Goust (entrada)
const FORMACAO = [
  { cx: 50, cy: 50, r: 22, dx: -60, dy: -40 }, { cx: 62, cy: 38, r: 16, dx: 70, dy: -55 }, { cx: 40, cy: 70, r: 14, dx: -75, dy: 50 },
  { cx: 70, cy: 70, r: 14, dx: 65, dy: 60 }, { cx: 30, cy: 74, r: 9, dx: -90, dy: 10 }, { cx: 55, cy: 84, r: 9, dx: 10, dy: 85 },
]

type Variante = 'brilho' | 'mono' | 'contorno'

/**
 * Mascote da Goust.
 * - brilho: degradê branco → azul com halo e estrela (logo, momentos de destaque);
 * - mono: uma cor (currentColor), olhos vazados, sem halo (lugares discretos);
 * - contorno: só o traço.
 * animado: corpo líquido (a base escorre e se refaz, gotas pingando e voltando), flutua, pisca e a estrela cintila.
 * voar: deriva maior pelo espaço (telas de destaque). formar: entra se formando a partir de gotas que se juntam.
 * Tudo respeita "reduzir movimento".
 */
export function Mascote({ tamanho = 32, variante = 'brilho', animado = false, estrela = true, voar = false, formar = false, className = '' }: {
  tamanho?: number; variante?: Variante; animado?: boolean; estrela?: boolean; voar?: boolean; formar?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const reduzir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const liquido = animado && !reduzir && variante !== 'contorno'
  const olhos = OLHOS.map((o, i) => (
    <rect key={i} x={o.x} y={o.y} width="7" height="15" rx="3.5" transform={`rotate(-10 ${o.x + 3.5} ${o.y + 7.5})`} />
  ))
  const morph = liquido ? (
    <animate attributeName="d" dur="5.5s" repeatCount="indefinite" calcMode="spline"
      keyTimes="0;0.33;0.66;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
      values={[CORPOS[0], CORPOS[1], CORPOS[2], CORPOS[0]].join(';')} />
  ) : null
  const preenchimento = variante === 'brilho' ? `url(#${id}c)` : 'currentColor'
  const gotas = liquido && !formar ? GOTAS.map((g, i) => (
    <circle key={i} cx={g.cx} cy={g.cy} r={g.r} fill={preenchimento} className="goust-gota" style={{ animationDelay: g.d }} />
  )) : null
  const formacao = formar ? FORMACAO.map((g, i) => (
    <circle key={i} cx={g.cx} cy={g.cy} r={g.r} fill={preenchimento} className="goust-formar-gota"
      style={{ '--dx': `${g.dx}px`, '--dy': `${g.dy}px`, animationDelay: `${i * 0.06}s` } as React.CSSProperties} />
  )) : null

  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <defs>
        <radialGradient id={`${id}c`} cx="0.38" cy="0.3" r="0.85" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#cfe6ff" />
          <stop offset="0.8" stopColor="#6fa8ff" />
          <stop offset="1" stopColor="#3a7bff" />
        </radialGradient>
        <filter id={`${id}h`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feFlood floodColor="#2f74ff" floodOpacity="0.85" />
          <feComposite in2="b" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* "gooey": borra e recorta o alfa — formas próximas se fundem como gotas de líquido */}
        <filter id={`${id}g`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="borrado" />
          <feColorMatrix in="borrado" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="liquido" />
          <feComposite in="SourceGraphic" in2="liquido" operator="atop" />
        </filter>
        <mask id={`${id}m`}>
          <rect x="-50" y="-50" width="200" height="200" fill="white" />
          <g fill="black" transform="rotate(-6 52 55)" className={animado ? 'goust-piscar' : ''}>{olhos}</g>
        </mask>
      </defs>

      <g className={voar ? 'goust-voar' : animado ? 'goust-flutuar' : ''}>
        {variante === 'contorno' ? (
          <g transform="rotate(-6 52 55)">
            <path d={CORPO} fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
            <g fill="currentColor" className={animado ? 'goust-piscar' : ''}>{olhos}</g>
          </g>
        ) : (
          <g filter={variante === 'brilho' ? `url(#${id}h)` : undefined}>
            <g filter={liquido || formar ? `url(#${id}g)` : undefined} mask={variante === 'mono' ? `url(#${id}m)` : undefined}>
              <g transform="rotate(-6 52 55)">
                <path d={CORPO} fill={preenchimento} className={formar ? 'goust-formar-corpo' : ''}>{morph}</path>
                {gotas}
              </g>
              {formacao}
            </g>
          </g>
        )}
        {variante === 'brilho' && (
          <g transform="rotate(-6 52 55)" fill="#0b0d14" className={formar ? 'goust-formar-olhos' : ''}>
            <g className={animado ? 'goust-piscar' : ''}>{olhos}</g>
          </g>
        )}
      </g>
      {estrela && (
        <path d={ESTRELA} fill={variante === 'brilho' ? '#ffffff' : 'currentColor'}
          className={`${animado ? 'goust-estrela' : ''} ${formar ? 'goust-formar-olhos' : ''}`}
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

/** Carregando: o Goust se forma a partir de gotas e fica flutuando, com a sombra respirando. */
export function CarregandoGoust({ tamanho = 64, texto }: { tamanho?: number; texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Mascote tamanho={tamanho} animado formar />
        <span className="goust-sombra absolute -bottom-2 left-1/2 h-2 w-1/2 -translate-x-1/2 rounded-full bg-[var(--sinal-a)]/35 blur-[6px]" />
      </div>
      {texto && <p className="text-sm text-muted">{texto}</p>}
    </div>
  )
}
