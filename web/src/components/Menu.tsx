import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ItemMenu { id: string | number; rotulo: ReactNode; icone?: ReactNode; perigo?: boolean; marcado?: boolean; aoEscolher: () => void }

/** Menu suspenso leve: abre ao clicar no gatilho, fecha ao clicar fora, rolar ou apertar Esc.
 *  Renderiza num portal com posição fixa, então nunca é cortado por um cartão com overflow escondido. */
export function Menu({ gatilho, itens, titulo, alinhar = 'direita', className = '' }: {
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode
  itens: ItemMenu[]
  titulo?: string
  alinhar?: 'direita' | 'esquerda'
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ancora = useRef<HTMLDivElement>(null)
  const caixa = useRef<HTMLDivElement>(null)
  // dentro de um modal, o portal no body contaria como "clique fora" e fecharia o modal: fica inline
  const [emDialogo, setEmDialogo] = useState(false)

  useLayoutEffect(() => {
    if (!aberto || !ancora.current) return
    setEmDialogo(!!ancora.current.closest('[role="dialog"]'))
    const r = ancora.current.getBoundingClientRect()
    const largura = caixa.current?.offsetWidth ?? 220
    const altura = caixa.current?.offsetHeight ?? 200
    let left = alinhar === 'direita' ? r.right - largura : r.left
    left = Math.min(Math.max(8, left), window.innerWidth - largura - 8)
    let top = r.bottom + 6
    if (top + altura > window.innerHeight - 8) top = Math.max(8, r.top - altura - 6)
    setPos({ top, left })
  }, [aberto, alinhar, itens.length])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (!caixa.current?.contains(alvo) && !ancora.current?.contains(alvo)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    const rolar = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', rolar, true)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', rolar, true)
    }
  }, [aberto])

  return (
    <div ref={ancora} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      {gatilho(() => setAberto((a) => !a), aberto)}
      {aberto && emDialogo && (
        <div ref={caixa} role="menu" className={`entrar-cima absolute top-full z-50 mt-1.5 min-w-52 overflow-hidden rounded-2xl border bg-surface p-1 shadow-2xl linha-fina ${alinhar === 'direita' ? 'right-0' : 'left-0'}`}>
          {titulo && <p className="px-3 pt-2 pb-1 text-xs text-muted">{titulo}</p>}
          {itens.map((it) => (
            <button key={it.id} role="menuitem" onClick={() => { setAberto(false); it.aoEscolher() }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-secondary [&_svg]:size-4 ${it.perigo ? 'text-danger' : ''}`}>
              {it.icone}<span className="flex-1">{it.rotulo}</span>{it.marcado && <span className="size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
      {aberto && !emDialogo && createPortal(
        <div ref={caixa} role="menu" onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          className="entrar-cima z-[70] min-w-52 overflow-hidden rounded-2xl border bg-surface p-1 shadow-2xl linha-fina">
          {titulo && <p className="px-3 pt-2 pb-1 text-xs text-muted">{titulo}</p>}
          {itens.map((it) => (
            <button key={it.id} role="menuitem" onClick={() => { setAberto(false); it.aoEscolher() }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-secondary [&_svg]:size-4 ${it.perigo ? 'text-danger' : ''}`}>
              {it.icone}
              <span className="flex-1">{it.rotulo}</span>
              {it.marcado && <span className="size-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
