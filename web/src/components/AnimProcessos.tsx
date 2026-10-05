import { useId } from 'react'

export type TipoProcesso = 'coleta' | 'comentarios' | 'analise' | 'geracao'

/** Ilustração animada de cada processo (central de atividade, linha do tempo e telas de criação). */
export function AnimProcesso({ tipo, tamanho = 48 }: { tipo: TipoProcesso; tamanho?: number }) {
  if (tipo === 'coleta') return <AnimColeta tamanho={tamanho} />
  if (tipo === 'comentarios') return <AnimComentarios tamanho={tamanho} />
  if (tipo === 'analise') return <AnimAnalise tamanho={tamanho} />
  return <AnimGeracao tamanho={tamanho} />
}

/** Coleta: posts caindo, um a um, numa bandeja que respira. */
function AnimColeta({ tamanho }: { tamanho: number }) {
  const id = useId()
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sinal-a)" /><stop offset="1" stopColor="var(--sinal-b)" />
        </linearGradient>
      </defs>
      <path d="M8 35h32l-3 8H11z" fill="currentColor" opacity="0.14" />
      <rect x="12" y="31" width="24" height="5" rx="1.5" fill="currentColor" opacity="0.2" className="anim-respirar" />
      {[0, 1, 2].map((i) => (
        <g key={i} className="anim-cair" style={{ animationDelay: `${i * 0.5}s` }}>
          <rect x="17" y="5" width="14" height="18" rx="3" fill={`url(#${id}c)`} />
          <rect x="19.5" y="8" width="9" height="7" rx="1.5" fill="white" opacity="0.55" />
          <rect x="19.5" y="17" width="6" height="1.6" rx="0.8" fill="white" opacity="0.75" />
        </g>
      ))}
    </svg>
  )
}

/** Comentários: balões subindo e estourando. */
function AnimComentarios({ tamanho }: { tamanho: number }) {
  const baloes: [number, string, number][] = [[6, 'var(--sinal-a)', 0], [18, 'var(--sinal-b)', 0.6], [26, 'var(--menta)', 1.2]]
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden className="overflow-visible">
      {baloes.map(([x, cor, d], i) => (
        <g key={i} className="anim-balao" style={{ animationDelay: `${d}s` }}>
          <path d={`M${x + 4} 26h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-7l-4 3v-3h-1a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z`} fill={cor} />
          {[3, 6, 9].map((dx) => <circle key={dx} cx={x + 4 + dx} cy="32" r="1" fill="white" />)}
        </g>
      ))}
    </svg>
  )
}

/** Análise: uma rede de "neurônios" acendendo e um feixe de leitura varrendo. */
function AnimAnalise({ tamanho }: { tamanho: number }) {
  const id = useId()
  const nos: [number, number][] = [[10, 12], [24, 7], [38, 13], [16, 26], [32, 25], [24, 38], [8, 36], [40, 36]]
  const ligacoes: [number, number][] = [[0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 5], [4, 5], [3, 6], [4, 7], [5, 6], [5, 7]]
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sinal-a)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--sinal-a)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--sinal-a)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ligacoes.map(([a, b], i) => (
        <g key={i}>
          <line x1={nos[a][0]} y1={nos[a][1]} x2={nos[b][0]} y2={nos[b][1]} stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.9" />
          <line x1={nos[a][0]} y1={nos[a][1]} x2={nos[b][0]} y2={nos[b][1]} stroke="var(--sinal-a)" strokeWidth="1.4"
            strokeLinecap="round" pathLength={1} className="anim-sinapse" style={{ animationDelay: `${(i * 0.23) % 2.4}s` }} />
        </g>
      ))}
      {nos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 1 || i === 5 ? 2.6 : 2} fill={i % 3 === 0 ? 'var(--sinal-b)' : 'var(--sinal-a)'}
          className="anim-piscar" style={{ animationDelay: `${(i * 0.4) % 3.2}s` }} />
      ))}
      <rect x="2" y="0" width="44" height="10" rx="5" fill={`url(#${id}f)`} className="anim-feixe" />
    </svg>
  )
}

/** Geração: partículas em espiral convergindo e florescendo numa estrela. */
function AnimGeracao({ tamanho }: { tamanho: number }) {
  const id = useId()
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden className="overflow-visible">
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor="var(--sinal-b)" stopOpacity="0.5" /><stop offset="1" stopColor="var(--sinal-a)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sinal-a)" /><stop offset="1" stopColor="var(--sinal-b)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="20" fill={`url(#${id}g)`} className="anim-respirar" />
      <g className="anim-girar" style={{ transformOrigin: '24px 24px', animationDuration: '5s' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 45} 24 24)`}>
            <circle cx="24" cy="3" r={1.5 - (i % 3) * 0.3} fill={i % 2 ? 'var(--sinal-a)' : 'var(--sinal-b)'}
              className="anim-convergir" style={{ animationDelay: `${i * 0.18}s` }} />
          </g>
        ))}
      </g>
      <path className="anim-florescer" style={{ transformOrigin: '24px 24px' }} fill={`url(#${id}e)`}
        d="M24 13c.9 6.3 3.7 9.1 10 10-6.3.9-9.1 3.7-10 10-.9-6.3-3.7-9.1-10-10 6.3-.9 9.1-3.7 10-10Z" />
      <circle cx="24" cy="23" r="2" fill="white" className="anim-pulso" style={{ transformOrigin: '24px 23px' }} />
    </svg>
  )
}

/** Explosão de faíscas (fim de análise ou geração, favoritar). Mude a key para tocar de novo. */
export function Explosao({ tamanho = 64, cor = 'var(--sinal-b)' }: { tamanho?: number; cor?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" aria-hidden className="pointer-events-none overflow-visible">
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <line key={i} x1={32 + Math.cos(a) * 8} y1={32 + Math.sin(a) * 8} x2={32 + Math.cos(a) * 28} y2={32 + Math.sin(a) * 28}
            stroke={i % 2 ? cor : 'var(--sinal-a)'} strokeWidth="2.4" strokeLinecap="round" pathLength={1} className="anim-faisca" />
        )
      })}
      <circle cx="32" cy="32" r="10" fill="none" stroke={cor} strokeWidth="1.5" className="anim-onda" style={{ transformOrigin: '32px 32px' }} />
    </svg>
  )
}
