import { ChevronLeft, ChevronRight } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Faixa horizontal com setas (aparecem só quando há mais conteúdo daquele lado), roda do mouse e fade nas pontas.
 *  A barra de rolagem nativa fica escondida; teclado: as setas são botões focáveis. */
export function Carrossel({ children, className = '', rotulo = 'Itens' }: { children: ReactNode; className?: string; rotulo?: string }) {
  const trilho = useRef<HTMLDivElement>(null)
  const [lados, setLados] = useState({ esq: false, dir: false })
  const medir = useCallback(() => {
    const el = trilho.current
    if (!el) return
    setLados({ esq: el.scrollLeft > 4, dir: el.scrollWidth - el.clientWidth - el.scrollLeft > 4 })
  }, [])
  useEffect(() => {
    const el = trilho.current
    if (!el) return
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c))
    el.addEventListener('scroll', medir, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', medir) }
  }, [medir, children])
  const ir = (lado: 1 | -1) => trilho.current?.scrollBy({ left: lado * trilho.current.clientWidth * 0.8, behavior: 'smooth' })
  const seta = 'absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border bg-surface/90 shadow-lg backdrop-blur-md linha-fina transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'
  return (
    <div className="group/carrossel relative" role="region" aria-label={rotulo}>
      <div ref={trilho} data-rolavel="x" className={`flex overflow-x-auto scroll-smooth ${className}`}>{children}</div>
      <button aria-label="Anterior" onClick={() => ir(-1)} tabIndex={lados.esq ? 0 : -1}
        className={`${seta} -left-3 ${lados.esq ? 'opacity-100 sm:opacity-0 sm:group-hover/carrossel:opacity-100 sm:focus-visible:opacity-100' : 'pointer-events-none opacity-0'}`}>
        <ChevronLeft className="size-4" />
      </button>
      <button aria-label="Próximo" onClick={() => ir(1)} tabIndex={lados.dir ? 0 : -1}
        className={`${seta} -right-3 ${lados.dir ? 'opacity-100 sm:opacity-0 sm:group-hover/carrossel:opacity-100 sm:focus-visible:opacity-100' : 'pointer-events-none opacity-0'}`}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
