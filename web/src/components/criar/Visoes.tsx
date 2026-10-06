import { FileText, Plus } from '@gravity-ui/icons'
import type { CSSProperties } from 'react'
import type { Conteudo, StatusConteudo } from '../../api'
import { Menu } from '../Menu'
import { Carrossel } from '../ui/Carrossel'
import {
  AreaSoltar, CartaoConteudo, OBJETIVOS, ORDEM_STATUS, STATUS, atrasado, formatoDe, hojeIso, iso, rotuloDia, segunda, somarDias,
  type Previa,
} from './comum'

export interface Comum {
  itens: Conteudo[]
  capas: Record<number, string>
  arrastando: number | null
  setArrastando: (id: number | null) => void
  sobre: string | null
  setSobre: (k: string | null) => void
  mover: (id: number, data: string | null) => void
  mudarStatus: (c: Conteudo, s: StatusConteudo) => void
  abrir: (c: Conteudo) => void
  novo: (data: string | null) => void
  previa: { entrar: (c: Conteudo, el: HTMLElement) => void; sair: () => void; previa: Previa | null }
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function porDia(itens: Conteudo[]) {
  const m = new Map<string, Conteudo[]>()
  itens.forEach((c) => { if (c.data) m.set(c.data, [...(m.get(c.data) ?? []), c]) })
  return m
}

function Cartao({ x, c, detalhado, i }: { x: Comum; c: Conteudo; detalhado?: boolean; i?: number }) {
  return (
    <CartaoConteudo c={c} capa={x.capas[c.id]} detalhado={detalhado} arrastando={x.arrastando === c.id} aoArrastar={x.setArrastando}
      aoAbrir={() => x.abrir(c)} aoStatus={(s) => x.mudarStatus(c, s)} aoEntrar={(el) => x.previa.entrar(c, el)} aoSair={x.previa.sair}
      style={i !== undefined ? ({ '--i': i } as CSSProperties) : undefined} />
  )
}

function BotaoNovo({ aoClicar, rotulo = 'Nova ideia neste dia' }: { aoClicar: () => void; rotulo?: string }) {
  return (
    <button onClick={aoClicar} aria-label={rotulo} title={rotulo}
      className="grid size-6 place-items-center rounded-lg text-muted opacity-0 transition-all group-hover/dia:opacity-100 hover:bg-surface hover:text-foreground focus-visible:opacity-100">
      <Plus className="size-3.5" />
    </button>
  )
}

// ---------------------------------------------------------------- mês

export function VisaoMes({ x, mes }: { x: Comum; mes: Date }) {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const inicio = segunda(primeiro)
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
  const semanas = Math.ceil((((ultimo.getTime() - inicio.getTime()) / 864e5) + 1) / 7)
  const dias = Array.from({ length: semanas * 7 }, (_, i) => somarDias(inicio, i))
  const mapa = porDia(x.itens)
  const hoje = hojeIso()
  return (
    <div className="cartao p-3 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
        {DIAS.map((d) => <p key={d} className="text-center text-xs font-medium text-muted">{d}</p>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {dias.map((d) => {
          const k = iso(d)
          const lista = mapa.get(k) ?? []
          const fora = d.getMonth() !== mes.getMonth()
          const passado = k < hoje
          return (
            <AreaSoltar key={k} chave={k} sobre={x.sobre} setSobre={x.setSobre} aoSoltar={(id) => x.mover(id, k)}
              className={`group/dia flex min-h-14 flex-col gap-1.5 rounded-xl p-1.5 transition-colors sm:min-h-32 sm:rounded-2xl sm:p-2 ${
                k === hoje ? 'bg-accent/8 ring-1 ring-accent/40' : fora ? 'bg-surface-secondary/25' : 'bg-surface-secondary/45 hover:bg-surface-secondary/70'}`}>
              <div className="flex items-center justify-between">
                <span className={`num grid size-6 place-items-center rounded-full text-xs ${k === hoje ? 'botao-sinal font-semibold' : fora || passado ? 'text-muted/50' : 'text-muted'}`}>{d.getDate()}</span>
                <BotaoNovo aoClicar={() => x.novo(k)} />
              </div>
              <div className="hidden space-y-1.5 sm:block">{lista.map((c) => <Cartao key={c.id} x={x} c={c} />)}</div>
              {/* celular: só pontos coloridos por formato; toque abre o primeiro */}
              {lista.length > 0 && (
                <button onClick={() => x.abrir(lista[0])} aria-label={`${lista.length} conteúdo(s)`} className="flex flex-wrap gap-1 sm:hidden">
                  {lista.map((c) => <span key={c.id} className="size-2 rounded-full" style={{ background: formatoDe(c.formato).cor }} />)}
                </button>
              )}
            </AreaSoltar>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- semana

export function VisaoSemana({ x, inicio }: { x: Comum; inicio: Date }) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
  const mapa = porDia(x.itens)
  const hoje = hojeIso()
  return (
    <div data-rolavel="x" className="grid gap-2 overflow-x-auto pb-1 [grid-template-columns:repeat(7,minmax(150px,1fr))]">
      {dias.map((d, i) => {
        const k = iso(d)
        const lista = mapa.get(k) ?? []
        return (
          <AreaSoltar key={k} chave={k} sobre={x.sobre} setSobre={x.setSobre} aoSoltar={(id) => x.mover(id, k)}
            className={`group/dia flex min-h-[62vh] flex-col gap-2 rounded-3xl p-2.5 ${k === hoje ? 'bg-accent/8 ring-1 ring-accent/40' : 'bg-surface'}`}>
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <p className="text-xs text-muted">{DIAS[i]}</p>
                <p className={`num titulo-display text-2xl font-semibold ${k < hoje ? 'text-muted/60' : ''}`}>{d.getDate()}</p>
              </div>
              <BotaoNovo aoClicar={() => x.novo(k)} />
            </div>
            <div className="cascata space-y-2">{lista.map((c, n) => <Cartao key={c.id} x={x} c={c} detalhado i={n} />)}</div>
            {lista.length === 0 && (
              <button onClick={() => x.novo(k)} className="mt-1 flex-1 rounded-2xl border border-dashed text-xs text-muted/70 opacity-0 transition-opacity linha-fina group-hover/dia:opacity-100 hover:text-foreground">
                + Ideia
              </button>
            )}
          </AreaSoltar>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- lista

export function VisaoLista({ x }: { x: Comum }) {
  const hoje = hojeIso()
  const atrasados = x.itens.filter(atrasado).sort((a, b) => a.data!.localeCompare(b.data!))
  const futuros = x.itens.filter((c) => c.data && c.data >= hoje).sort((a, b) => a.data!.localeCompare(b.data!) || a.id - b.id)
  const semData = x.itens.filter((c) => !c.data)
  const publicadosPassados = x.itens.filter((c) => c.data && c.data < hoje && c.status === 'publicado').sort((a, b) => b.data!.localeCompare(a.data!))
  const grupos: [string, Conteudo[]][] = []
  if (atrasados.length) grupos.push(['Atrasados', atrasados])
  const porData = new Map<string, Conteudo[]>()
  futuros.forEach((c) => porData.set(c.data!, [...(porData.get(c.data!) ?? []), c]))
  porData.forEach((v, k) => grupos.push([rotuloDia(k), v]))
  if (semData.length) grupos.push(['Sem data', semData])
  if (publicadosPassados.length) grupos.push(['Já publicados', publicadosPassados.slice(0, 20)])

  if (!grupos.length) return <div className="cartao p-10 text-center text-sm text-muted">Nada com esses filtros.</div>
  return (
    <div className="space-y-5">
      {grupos.map(([titulo, lista]) => (
        <section key={titulo}>
          <h3 className={`mb-2 px-1 text-sm font-medium ${titulo === 'Atrasados' ? 'text-danger' : 'text-muted'}`}>{titulo}</h3>
          <div className="cartao divide-y overflow-hidden linha-fina [&>*]:linha-fina">
            {lista.map((c) => <LinhaLista key={c.id} x={x} c={c} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function LinhaLista({ x, c }: { x: Comum; c: Conteudo }) {
  const f = formatoDe(c.formato)
  const capa = x.capas[c.id]
  return (
    <div role="button" tabIndex={0} onClick={() => x.abrir(c)} onKeyDown={(e) => e.key === 'Enter' && x.abrir(c)}
      className="group flex cursor-pointer items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 transition-colors hover:bg-surface-secondary/50">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-xl sm:size-14" style={{ background: `color-mix(in srgb, ${f.cor} 22%, var(--surface-secondary))` }}>
        {capa ? <img src={capa} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[9px] font-semibold tracking-tight uppercase" style={{ color: f.cor }}>{f.nome}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{c.titulo}</p>
        <p className="truncate text-sm text-muted">{c.dados.gancho ? `“${c.dados.gancho}”` : c.dados.ideia || '—'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full px-2 py-0.5 font-medium text-black" style={{ background: f.cor }}>{f.nome}</span>
          {c.pilar && <span className="max-w-56 truncate rounded-full bg-surface-secondary px-2 py-0.5">{c.pilar}</span>}
          {c.dados.objetivo && <span className="rounded-full bg-surface-secondary px-2 py-0.5">{OBJETIVOS[c.dados.objetivo] ?? c.dados.objetivo}</span>}
          {c.roteiro && <span className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5"><FileText className="size-3" /> roteiro</span>}
        </div>
      </div>
      {c.data && <p className="num hidden w-28 shrink-0 text-right text-sm text-muted sm:block">{rotuloDia(c.data)}</p>}
      <div onClick={(e) => e.stopPropagation()}>
        <Menu titulo="Mudar status" gatilho={(abrir) => (
          <button onClick={abrir} aria-label={`Status: ${STATUS[c.status].nome}`}
            className="flex items-center gap-2 rounded-full bg-surface-secondary p-2.5 text-sm hover:bg-surface-tertiary sm:w-32 sm:px-3 sm:py-1.5">
            <span className="size-2 rounded-full" style={{ background: STATUS[c.status].cor }} /><span className="hidden sm:inline">{STATUS[c.status].nome}</span>
          </button>
        )} itens={ORDEM_STATUS.map((s) => ({ id: s, rotulo: STATUS[s].nome, marcado: s === c.status,
          icone: <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />, aoEscolher: () => x.mudarStatus(c, s) }))} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- quadro (por status)

export function VisaoQuadro({ x }: { x: Comum }) {
  const ordenar = (a: Conteudo, b: Conteudo) => (a.data ?? '9999').localeCompare(b.data ?? '9999')
  return (
    <div data-rolavel="x" className="grid gap-3 overflow-x-auto pb-1 [grid-template-columns:repeat(5,minmax(170px,1fr))]">
      {ORDEM_STATUS.map((s) => {
        const lista = x.itens.filter((c) => c.status === s).sort(ordenar)
        return (
          <AreaSoltar key={s} chave={`s:${s}`} sobre={x.sobre} setSobre={x.setSobre}
            aoSoltar={(id) => { const c = x.itens.find((i) => i.id === id); if (c && c.status !== s) x.mudarStatus(c, s) }}
            className="flex min-h-[62vh] flex-col gap-2 rounded-3xl bg-surface p-3">
            <div className="flex items-center gap-2 px-1 pb-1">
              <span className="size-2.5 rounded-full" style={{ background: STATUS[s].cor }} />
              <p className="flex-1 text-sm font-medium">{STATUS[s].nome}</p>
              <span className="num rounded-full bg-surface-secondary px-2 text-xs text-muted">{lista.length}</span>
            </div>
            <div className="cascata space-y-2">
              {lista.map((c, i) => (
                <div key={c.id} style={{ '--i': i } as CSSProperties}>
                  <Cartao x={x} c={c} detalhado />
                  {c.data && <p className={`num mt-1 px-1 text-[11px] ${atrasado(c) ? 'text-danger' : 'text-muted'}`}>{rotuloDia(c.data)}</p>}
                </div>
              ))}
            </div>
            {s === 'ideia' && (
              <button onClick={() => x.novo(null)} className="mt-auto rounded-2xl border border-dashed py-3 text-xs text-muted linha-fina hover:text-foreground">+ Nova ideia</button>
            )}
          </AreaSoltar>
        )
      })}
    </div>
  )
}

/** Faixa inferior: o que precisa andar nos próximos 7 dias, com o próximo passo de cada um. */
export function FilaProducao({ x }: { x: Comum }) {
  const hoje = hojeIso()
  const ate = iso(somarDias(new Date(), 7))
  const lista = x.itens.filter((c) => c.data && c.data <= ate && (c.data >= hoje || atrasado(c)) && !['pronto', 'publicado'].includes(c.status))
    .sort((a, b) => a.data!.localeCompare(b.data!))
  if (!lista.length) return null
  const proximo = (s: StatusConteudo) => ORDEM_STATUS[Math.min(ORDEM_STATUS.indexOf(s) + 1, ORDEM_STATUS.length - 1)]
  return (
    <section className="cartao p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="titulo-display text-lg font-semibold">Para produzir nos próximos 7 dias</h3>
        <span className="num text-sm text-muted">{lista.length}</span>
      </div>
      <Carrossel rotulo="Para produzir nos próximos 7 dias" className="gap-3 pb-1">
        {lista.map((c) => {
          const f = formatoDe(c.formato)
          const prox = proximo(c.status)
          return (
            <div key={c.id} className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl bg-surface-secondary/60 p-3">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-medium uppercase" style={{ color: f.cor }}>{f.nome}</span>
                <span className={`num ml-auto ${atrasado(c) ? 'text-danger' : 'text-muted'}`}>{rotuloDia(c.data!)}</span>
              </div>
              <button onClick={() => x.abrir(c)} className="line-clamp-2 text-left text-sm leading-snug font-medium hover:underline">{c.titulo}</button>
              <div className="mt-auto flex items-center gap-1">
                {ORDEM_STATUS.map((s, i) => (
                  <span key={s} title={STATUS[s].nome} className="h-1 flex-1 rounded-full"
                    style={{ background: i <= ORDEM_STATUS.indexOf(c.status) ? STATUS[c.status].cor : 'var(--surface-tertiary)' }} />
                ))}
              </div>
              <button onClick={() => (c.status === 'ideia' ? x.abrir(c) : x.mudarStatus(c, prox))}
                className="rounded-xl bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-tertiary">
                {c.status === 'ideia' ? 'Escrever roteiro →' : `Marcar como ${STATUS[prox].nome.toLowerCase()} →`}
              </button>
            </div>
          )
        })}
      </Carrossel>
    </section>
  )
}

