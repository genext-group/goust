import { Check, ChevronDown } from '@gravity-ui/icons'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Flutuante } from './Flutuante'

export interface Opcao<T extends string> { valor: T; rotulo: ReactNode; texto?: string; descricao?: ReactNode; icone?: ReactNode }

/** Select do Design System (substitui <select>). Teclado: setas, Enter, Esc, e digitar para pular para a opção. */
export function Selecao<T extends string>({ valor, opcoes, aoMudar, rotulo, rotuloAcessivel, placeholder = 'Escolher', className = '', tamanho = 'md', variante = 'campo' }: {
  valor: T | null
  opcoes: Opcao<T>[]
  aoMudar: (v: T) => void
  rotulo?: string
  rotuloAcessivel?: string
  placeholder?: string
  className?: string
  tamanho?: 'sm' | 'md'
  variante?: 'campo' | 'pilula'
}) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const botao = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const busca = useRef({ texto: '', t: 0 })
  const id = useId()
  const atual = opcoes.find((o) => o.valor === valor)

  useEffect(() => {
    if (aberto) setAtivo(Math.max(0, opcoes.findIndex((o) => o.valor === valor)))
  }, [aberto, opcoes, valor])
  useEffect(() => {
    if (aberto) lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo])

  const escolher = (o: Opcao<T>) => { aoMudar(o.valor); setAberto(false); botao.current?.focus() }
  const teclado = (e: React.KeyboardEvent) => {
    if (!aberto && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setAberto(true); return }
    if (!aberto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, opcoes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setAtivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setAtivo(opcoes.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opcoes[ativo]) escolher(opcoes[ativo]) }
    else if (e.key === 'Tab') setAberto(false)
    else if (e.key.length === 1) {
      const agora = Date.now()
      busca.current = { texto: (agora - busca.current.t < 700 ? busca.current.texto : '') + e.key.toLowerCase(), t: agora }
      const i = opcoes.findIndex((o) => (o.texto ?? String(o.rotulo)).toLowerCase().replace(/^@/, '').startsWith(busca.current.texto))
      if (i >= 0) setAtivo(i)
    }
  }
  const altura = tamanho === 'sm' ? 'h-9 text-sm' : 'h-10'
  const aparencia = variante === 'pilula'
    ? 'rounded-full bg-surface-secondary/70 hover:bg-surface-secondary px-3.5'
    : 'rounded-xl border bg-[var(--field-background)] px-3 linha-fina hover:border-accent/40'

  return (
    <div className={className}>
      {rotulo && <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{rotulo}</label>}
      <button ref={botao} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-label={rotuloAcessivel ?? rotulo}
        onClick={() => setAberto((a) => !a)} onKeyDown={teclado}
        className={`flex w-full items-center gap-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${aparencia} ${altura} ${aberto ? 'border-accent/60' : ''}`}>
        {atual?.icone}
        <span className={`flex-1 truncate ${atual ? '' : 'text-muted'}`}>{atual ? atual.rotulo : placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <Flutuante aberto={aberto} ancora={botao} aoFechar={() => setAberto(false)}>
        <ul ref={lista} role="listbox" data-rolavel="y" className="max-h-72 overflow-y-auto p-1" onKeyDown={teclado}>
          {opcoes.map((o, i) => {
            const marcado = o.valor === valor
            return (
              <li key={o.valor} role="option" aria-selected={marcado} data-i={i}>
                <button type="button" onMouseEnter={() => setAtivo(i)} onClick={() => escolher(o)} tabIndex={-1}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${i === ativo ? 'bg-surface-secondary' : ''}`}>
                  {o.icone}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${marcado ? 'font-medium' : ''}`}>{o.rotulo}</span>
                    {o.descricao && <span className="block truncate text-xs text-muted">{o.descricao}</span>}
                  </span>
                  {marcado && <Check className="size-4 shrink-0 text-accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      </Flutuante>
    </div>
  )
}
