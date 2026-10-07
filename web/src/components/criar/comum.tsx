import { FileText, Picture } from '@gravity-ui/icons'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Conteudo, StatusConteudo } from '../../api'
import { Menu } from '../Menu'

export const STATUS: Record<StatusConteudo, { nome: string; cor: string }> = {
  ideia: { nome: 'Ideia', cor: 'var(--muted)' },
  roteiro: { nome: 'Roteiro', cor: 'var(--sinal-a)' },
  produzindo: { nome: 'Produzindo', cor: 'var(--ambar)' },
  pronto: { nome: 'Pronto', cor: 'var(--menta)' },
  publicado: { nome: 'Publicado', cor: 'var(--sinal-b)' },
}
export const ORDEM_STATUS = Object.keys(STATUS) as StatusConteudo[]
export const FORMATOS: Record<string, { nome: string; cor: string }> = {
  reel: { nome: 'Reel', cor: '#5b9dff' },
  carrossel: { nome: 'Carrossel', cor: '#fbbf24' },
  foto: { nome: 'Foto', cor: '#2ee6a6' },
  story: { nome: 'Story', cor: '#ffb547' },
}
export const OBJETIVOS: Record<string, string> = {
  alcance: 'Alcance', engajamento: 'Engajamento', conversao: 'Conversão', autoridade: 'Autoridade', relacionamento: 'Relacionamento',
}
export const formatoDe = (f: string | null | undefined) => FORMATOS[f ?? ''] ?? { nome: f || 'Post', cor: 'var(--muted)' }

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const deIso = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
export function segunda(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const somarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const hojeIso = () => iso(new Date())
export const atrasado = (c: Conteudo) => !!c.data && c.data < hojeIso() && c.status !== 'publicado'

/** Próximos dias livres (sem conteúdo), a partir de amanhã. */
export function diasLivres(itens: Conteudo[], n = 6, ocupar: string[] = []) {
  const ocupados = new Set([...itens.map((c) => c.data).filter(Boolean) as string[], ...ocupar])
  const saida: string[] = []
  for (let i = 1; saida.length < n && i < 90; i++) {
    const k = iso(somarDias(new Date(), i))
    if (!ocupados.has(k)) saida.push(k)
  }
  return saida
}
export const rotuloDia = (k: string) => {
  const d = deIso(k)
  const dif = Math.round((d.getTime() - deIso(hojeIso()).getTime()) / 864e5)
  if (dif === 0) return 'Hoje'
  if (dif === 1) return 'Amanhã'
  const t = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ---------------------------------------------------------------- prévia ao passar o mouse

export interface Previa { c: Conteudo; rect: DOMRect }

export function usePrevia() {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const entrar = (c: Conteudo, el: HTMLElement) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPrevia({ c, rect: el.getBoundingClientRect() }), 320)
  }
  const sair = () => { window.clearTimeout(timer.current); setPrevia(null) }
  useEffect(() => {
    const fechar = () => sair()
    window.addEventListener('scroll', fechar, true)
    return () => window.removeEventListener('scroll', fechar, true)
  }, [])
  return { previa, entrar, sair }
}

export function CartaoPrevia({ previa, capa }: { previa: Previa | null; capa?: string }) {
  if (!previa) return null
  const { c, rect } = previa
  const largura = 320
  const esquerda = rect.right + 12 + largura < window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - largura - 12)
  const topo = Math.min(Math.max(12, rect.top - 8), window.innerHeight - 360)
  const f = formatoDe(c.formato)
  // portal: a animação de troca de página deixa um filter no container, o que quebraria o position: fixed
  return createPortal(
    <div className="entrar-cima pointer-events-none fixed z-[60] overflow-hidden rounded-3xl border bg-surface shadow-2xl linha-fina"
      style={{ left: esquerda, top: topo, width: largura }}>
      {capa && <img src={capa} alt="" className="h-36 w-full object-cover" />}
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full px-2 py-0.5 font-medium text-black" style={{ background: f.cor }}>{f.nome}</span>
          <span className="flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5">
            <span className="size-1.5 rounded-full" style={{ background: STATUS[c.status].cor }} />{STATUS[c.status].nome}
          </span>
          {c.dados.objetivo && <span className="rounded-full bg-surface-secondary px-2 py-0.5">{OBJETIVOS[c.dados.objetivo] ?? c.dados.objetivo}</span>}
          {atrasado(c) && <span className="rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger">Atrasado</span>}
        </div>
        <p className="titulo-display text-lg leading-snug font-semibold">{c.titulo}</p>
        {c.pilar && <p className="text-xs text-muted">Pilar · {c.pilar}</p>}
        {c.dados.gancho && <p className="rounded-xl bg-surface-secondary/70 px-3 py-2 text-sm leading-relaxed italic">“{c.dados.gancho}”</p>}
        {c.dados.ideia && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{c.dados.ideia}</p>}
        <div className="flex items-center gap-3 pt-1 text-xs text-muted">
          <span className="flex items-center gap-1"><FileText className="size-3.5" />{c.roteiro ? (c.roteiro.duracao_segundos ? `Roteiro ~${c.roteiro.duracao_segundos}s` : `${c.roteiro.slides.length} slides`) : 'Sem roteiro'}</span>
          <span className="flex items-center gap-1"><Picture className="size-3.5" />{capa ? 'Com capa' : 'Sem capa'}</span>
          {c.data && <span className="ml-auto">{rotuloDia(c.data)}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- cartão do conteúdo

export function CartaoConteudo({ c, capa, detalhado = false, arrastando, aoArrastar, aoAbrir, aoStatus, aoEntrar, aoSair, style }: {
  c: Conteudo; capa?: string; detalhado?: boolean; arrastando?: boolean
  aoArrastar: (id: number | null) => void; aoAbrir: () => void; aoStatus: (s: StatusConteudo) => void
  aoEntrar: (el: HTMLElement) => void; aoSair: () => void; style?: CSSProperties
}) {
  const f = formatoDe(c.formato)
  return (
    <div role="button" tabIndex={0} draggable style={style}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); aoArrastar(c.id); aoSair() }}
      onDragEnd={() => aoArrastar(null)} onClick={aoAbrir} onKeyDown={(e) => e.key === 'Enter' && aoAbrir()}
      onMouseEnter={(e) => aoEntrar(e.currentTarget)} onMouseLeave={aoSair}
      className={`group/c relative cursor-grab overflow-hidden rounded-xl bg-surface-secondary/80 text-left text-xs transition-all outline-none hover:-translate-y-0.5 hover:bg-surface-secondary hover:shadow-lg focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${arrastando ? 'opacity-40' : ''} ${c.status === 'publicado' ? 'opacity-70' : ''}`}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: f.cor }} />
      {detalhado && capa && <img src={capa} alt="" className="h-20 w-full object-cover" />}
      <div className="py-2 pr-2 pl-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[10px] font-medium tracking-wide uppercase" style={{ color: f.cor }}>{f.nome}</span>
          {c.roteiro && <FileText className="size-3 text-muted" aria-label="Com roteiro" />}
          {!detalhado && capa && <Picture className="size-3 text-muted" aria-label="Com capa" />}
          {atrasado(c) && <span className="rounded bg-danger/15 px-1 text-[9px] font-semibold text-danger uppercase">atrasado</span>}
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            <Menu titulo="Mudar status" gatilho={(abrir) => (
              <button onClick={abrir} aria-label={`Status: ${STATUS[c.status].nome}`} title={STATUS[c.status].nome}
                className="grid size-4 place-items-center rounded-full hover:bg-surface"><span className="size-2 rounded-full" style={{ background: STATUS[c.status].cor }} /></button>
            )} itens={ORDEM_STATUS.map((s) => ({ id: s, rotulo: STATUS[s].nome, marcado: s === c.status,
              icone: <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />, aoEscolher: () => aoStatus(s) }))} />
          </span>
        </div>
        <p className={`leading-snug font-medium ${detalhado ? 'line-clamp-3 text-[13px]' : 'line-clamp-2'}`}>{c.titulo}</p>
        {detalhado && c.dados.gancho && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">“{c.dados.gancho}”</p>}
        {detalhado && c.pilar && <p className="mt-1.5 truncate text-[10px] text-muted">{c.pilar}</p>}
      </div>
    </div>
  )
}

/** Área que recebe um conteúdo arrastado. */
export function AreaSoltar({ chave, sobre, setSobre, aoSoltar, className = '', children }: {
  chave: string; sobre: string | null; setSobre: (k: string | null) => void; aoSoltar: (id: number) => void
  className?: string; children: ReactNode
}) {
  return (
    <div className={`${className} ${sobre === chave ? 'ring-2 ring-accent/60 ring-inset' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (sobre !== chave) setSobre(chave) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null) }}
      onDrop={(e) => { e.preventDefault(); setSobre(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id) aoSoltar(id) }}>
      {children}
    </div>
  )
}
