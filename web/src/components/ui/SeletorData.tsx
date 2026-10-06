import { Calendar, ChevronLeft, ChevronRight, Xmark } from '@gravity-ui/icons'
import { useEffect, useId, useRef, useState } from 'react'
import { Flutuante } from './Flutuante'

const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deIso = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
const somar = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export function formatarData(s: string | null, curto = false) {
  if (!s) return ''
  const t = deIso(s).toLocaleDateString('pt-BR', curto ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Seletor de data do Design System (substitui <input type="date">).
 * Valor em ISO (AAAA-MM-DD) ou null. Teclado: setas mudam o dia, PageUp/PageDown o mês, Enter escolhe, Esc fecha.
 * Clicar no mês/ano abre a grade de meses (month/year picker).
 */
export function SeletorData({ valor, aoMudar, rotulo, placeholder = 'Escolher data', min, max, limpavel = true, className = '', tamanho = 'md' }: {
  valor: string | null
  aoMudar: (v: string | null) => void
  rotulo?: string
  placeholder?: string
  min?: string
  max?: string
  limpavel?: boolean
  className?: string
  tamanho?: 'sm' | 'md'
}) {
  const [aberto, setAberto] = useState(false)
  const [visao, setVisao] = useState<'dias' | 'meses'>('dias')
  const [foco, setFoco] = useState<Date>(() => (valor ? deIso(valor) : new Date()))
  const botao = useRef<HTMLButtonElement>(null)
  const grade = useRef<HTMLDivElement>(null)
  const id = useId()
  const hoje = iso(new Date())

  useEffect(() => {
    if (aberto) { setFoco(valor ? deIso(valor) : new Date()); setVisao('dias') }
  }, [aberto, valor])
  useEffect(() => {
    if (aberto && visao === 'dias') grade.current?.querySelector<HTMLButtonElement>(`[data-dia="${iso(foco)}"]`)?.focus()
  }, [aberto, foco, visao])

  const fora = (d: string) => (min && d < min) || (max && d > max)
  const escolher = (d: string) => {
    if (fora(d)) return
    aoMudar(d)
    setAberto(false)
    botao.current?.focus()
  }
  const inicioGrade = (() => {
    const p = new Date(foco.getFullYear(), foco.getMonth(), 1)
    return somar(p, -((p.getDay() + 6) % 7))
  })()
  const dias = Array.from({ length: 42 }, (_, i) => somar(inicioGrade, i))
  const mudarMes = (n: number) => setFoco((f) => new Date(f.getFullYear(), f.getMonth() + n, Math.min(f.getDate(), 28)))
  const teclado = (e: React.KeyboardEvent) => {
    const mapa: Record<string, () => Date> = {
      ArrowLeft: () => somar(foco, -1), ArrowRight: () => somar(foco, 1), ArrowUp: () => somar(foco, -7), ArrowDown: () => somar(foco, 7),
      PageUp: () => new Date(foco.getFullYear(), foco.getMonth() - 1, foco.getDate()),
      PageDown: () => new Date(foco.getFullYear(), foco.getMonth() + 1, foco.getDate()),
      Home: () => somar(foco, -((foco.getDay() + 6) % 7)), End: () => somar(foco, 6 - ((foco.getDay() + 6) % 7)),
    }
    if (mapa[e.key]) { e.preventDefault(); setFoco(mapa[e.key]()) }
  }
  const altura = tamanho === 'sm' ? 'h-9 text-sm' : 'h-10'

  return (
    <div className={className}>
      {rotulo && <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{rotulo}</label>}
      <div className="relative">
        <button ref={botao} id={id} type="button" onClick={() => setAberto((a) => !a)} aria-haspopup="dialog" aria-expanded={aberto}
          className={`flex w-full items-center gap-2 rounded-xl border bg-[var(--field-background)] px-3 text-left transition-colors outline-none linha-fina hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50 ${altura} ${aberto ? 'border-accent/60' : ''}`}>
          <Calendar className="size-4 shrink-0 text-muted" />
          <span className={`flex-1 truncate ${valor ? '' : 'text-muted'} ${limpavel && valor ? 'pr-6' : ''}`}>{valor ? formatarData(valor) : placeholder}</span>
        </button>
        {limpavel && valor && (
          <button type="button" aria-label="Limpar data" onClick={() => aoMudar(null)}
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground">
            <Xmark className="size-3.5" />
          </button>
        )}
      </div>

      <Flutuante aberto={aberto} ancora={botao} aoFechar={() => setAberto(false)} larguraMinima={288}>
        <div role="dialog" aria-label="Escolher data" className="w-72 p-3">
          <div className="mb-2 flex items-center gap-1">
            <button type="button" onClick={() => setVisao((v) => (v === 'dias' ? 'meses' : 'dias'))}
              className="flex-1 rounded-lg px-2 py-1 text-left text-sm font-semibold hover:bg-surface-secondary">
              {visao === 'dias' ? (() => { const t = foco.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1) })() : foco.getFullYear()}
            </button>
            <button type="button" aria-label="Anterior" onClick={() => (visao === 'dias' ? mudarMes(-1) : setFoco((f) => new Date(f.getFullYear() - 1, f.getMonth(), 1)))}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"><ChevronLeft className="size-4" /></button>
            <button type="button" aria-label="Próximo" onClick={() => (visao === 'dias' ? mudarMes(1) : setFoco((f) => new Date(f.getFullYear() + 1, f.getMonth(), 1)))}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"><ChevronRight className="size-4" /></button>
          </div>

          {visao === 'meses' ? (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MESES.map((m, i) => {
                const ativo = foco.getMonth() === i
                return (
                  <button key={m} type="button" onClick={() => { setFoco(new Date(foco.getFullYear(), i, 1)); setVisao('dias') }}
                    className={`rounded-xl py-2.5 text-sm capitalize transition-colors ${ativo ? 'botao-sinal font-semibold' : 'hover:bg-surface-secondary'}`}>{m}</button>
                )
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 text-center text-[11px] text-muted">{DIAS.map((d, i) => <span key={i} className="py-1">{d}</span>)}</div>
              <div ref={grade} role="grid" onKeyDown={teclado} className="grid grid-cols-7 gap-0.5">
                {dias.map((d) => {
                  const k = iso(d)
                  const selecionado = k === valor
                  const doMes = d.getMonth() === foco.getMonth()
                  const desabilitado = !!fora(k)
                  return (
                    <button key={k} type="button" data-dia={k} tabIndex={k === iso(foco) ? 0 : -1} disabled={desabilitado}
                      onClick={() => escolher(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(k) } }}
                      aria-selected={selecionado} aria-label={formatarData(k)}
                      className={`num grid aspect-square place-items-center rounded-xl text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60
                        ${selecionado ? 'botao-sinal font-semibold' : k === hoje ? 'ring-1 ring-accent/60' : ''}
                        ${!selecionado && doMes ? 'hover:bg-surface-secondary' : ''} ${!doMes && !selecionado ? 'text-muted/50 hover:bg-surface-secondary/50' : ''}
                        ${desabilitado ? 'pointer-events-none opacity-30' : ''}`}>
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t pt-2 linha-fina">
            <button type="button" onClick={() => escolher(hoje)} disabled={!!fora(hoje)} className="rounded-lg px-2 py-1 text-sm text-accent hover:bg-surface-secondary disabled:opacity-40">Hoje</button>
            {limpavel && <button type="button" onClick={() => { aoMudar(null); setAberto(false) }} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-secondary hover:text-foreground">Limpar</button>}
          </div>
        </div>
      </Flutuante>
    </div>
  )
}
