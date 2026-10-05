import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ItemMenu { id: string | number; rotulo: ReactNode; icone?: ReactNode; perigo?: boolean; marcado?: boolean; aoEscolher: () => void }

/** Menu suspenso leve: abre ao clicar no gatilho, fecha ao clicar fora ou apertar Esc. */
export function Menu({ gatilho, itens, titulo, alinhar = 'direita', className = '' }: {
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode
  itens: ItemMenu[]
  titulo?: string
  alinhar?: 'direita' | 'esquerda'
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  return (
    <div ref={caixa} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      {gatilho(() => setAberto((a) => !a), aberto)}
      {aberto && (
        <div role="menu" className={`entrar-cima absolute top-full z-50 bg-surface mt-1.5 min-w-52 overflow-hidden rounded-2xl border p-1 shadow-2xl linha-fina ${alinhar === 'direita' ? 'right-0' : 'left-0'}`}>
          {titulo && <p className="px-3 pt-2 pb-1 text-xs text-muted">{titulo}</p>}
          {itens.map((it) => (
            <button key={it.id} role="menuitem" onClick={() => { setAberto(false); it.aoEscolher() }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-secondary [&_svg]:size-4 ${it.perigo ? 'text-danger' : ''}`}>
              {it.icone}
              <span className="flex-1">{it.rotulo}</span>
              {it.marcado && <span className="size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
