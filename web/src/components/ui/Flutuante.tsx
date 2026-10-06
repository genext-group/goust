import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Painel flutuante ancorado a um elemento (base dos pickers do Design System).
 * - Fora de modais: portal no body com posição fixa (nunca é cortado por overflow).
 * - Dentro de modal/gaveta: portal dentro do próprio diálogo (senão o modal entende como "clique fora" e fecha),
 *   com posição calculada relativa a ele.
 * Fecha ao clicar fora ou com Esc; reposiciona ao rolar/redimensionar; abre para cima se faltar espaço embaixo.
 */
export function Flutuante({ aberto, ancora, aoFechar, children, alinhar = 'inicio', larguraMinima = 'ancora', className = '' }: {
  aberto: boolean
  ancora: RefObject<HTMLElement | null>
  aoFechar: () => void
  children: ReactNode
  alinhar?: 'inicio' | 'fim'
  larguraMinima?: 'ancora' | number
  className?: string
}) {
  const painel = useRef<HTMLDivElement>(null)
  const [alvo, setAlvo] = useState<HTMLElement | null>(null)
  const [estilo, setEstilo] = useState<CSSProperties>({ position: 'fixed', top: -9999, left: -9999 })

  useLayoutEffect(() => {
    if (!aberto || !ancora.current) return
    const dialogo = ancora.current.closest<HTMLElement>('[role="dialog"]')
    if (dialogo && getComputedStyle(dialogo).position === 'static') dialogo.style.position = 'relative'
    setAlvo(dialogo ?? document.body)
  }, [aberto, ancora])

  useLayoutEffect(() => {
    if (!aberto || !alvo || !ancora.current) return
    const posicionar = () => {
      const a = ancora.current!.getBoundingClientRect()
      const p = painel.current
      const largura = p?.offsetWidth ?? 280
      const altura = p?.offsetHeight ?? 320
      const minimo = larguraMinima === 'ancora' ? a.width : larguraMinima
      let left = alinhar === 'fim' ? a.right - Math.max(largura, minimo) : a.left
      left = Math.min(Math.max(8, left), window.innerWidth - Math.max(largura, minimo) - 8)
      let top = a.bottom + 6
      if (top + altura > window.innerHeight - 8 && a.top - altura - 6 > 8) top = a.top - altura - 6
      if (alvo === document.body) {
        setEstilo({ position: 'fixed', top, left, minWidth: minimo })
      } else {
        const c = alvo.getBoundingClientRect()
        setEstilo({ position: 'absolute', top: top - c.top + alvo.scrollTop, left: left - c.left + alvo.scrollLeft, minWidth: minimo })
      }
    }
    posicionar()
    const raf = requestAnimationFrame(posicionar) // de novo, já com o tamanho real do painel
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [aberto, alvo, ancora, alinhar, larguraMinima])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      const t = e.target as Node
      if (!painel.current?.contains(t) && !ancora.current?.contains(t)) aoFechar()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); ancora.current?.focus() }
    }
    document.addEventListener('pointerdown', fora, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', fora, true)
      document.removeEventListener('keydown', esc, true)
    }
  }, [aberto, aoFechar, ancora])

  if (!aberto || !alvo) return null
  return createPortal(
    <div ref={painel} style={estilo} onPointerDown={(e) => e.stopPropagation()}
      className={`entrar-cima z-[80] overflow-hidden rounded-2xl border bg-surface shadow-2xl linha-fina ${className}`}>
      {children}
    </div>,
    alvo,
  )
}
