import { Button, toast } from '@heroui/react'
import { ChevronLeft, ChevronRight, Plus, Sparkles } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { criacao, type Conteudo, type StatusConteudo } from '../../api'
import type { PedidoImagem } from '../../telas/Criar'
import { Radar } from '../Animacoes'
import { AnimProcesso } from '../AnimProcessos'
import { useAoConcluir, useAtividade } from '../Atividade'
import { Menu } from '../Menu'
import { DetalheConteudo } from './DetalheConteudo'

export const STATUS: Record<StatusConteudo, { nome: string; cor: string }> = {
  ideia: { nome: 'Ideia', cor: 'var(--muted)' },
  roteiro: { nome: 'Roteiro', cor: 'var(--sinal-a)' },
  produzindo: { nome: 'Produzindo', cor: 'var(--ambar)' },
  pronto: { nome: 'Pronto', cor: 'var(--menta)' },
  publicado: { nome: 'Publicado', cor: 'var(--sinal-b)' },
}
export const FORMATOS: Record<string, string> = { reel: 'Reel', carrossel: 'Carrossel', foto: 'Foto', story: 'Story' }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function segunda(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function Calendario({ aoGerarImagem }: { aoGerarImagem: (p: PedidoImagem) => void }) {
  const [itens, setItens] = useState<Conteudo[] | null>(null)
  const [inicio, setInicio] = useState(() => segunda(new Date()))
  const [aberto, setAberto] = useState<Conteudo | 'novo' | null>(null)
  const [dataNovo, setDataNovo] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const { ia: tarefas, recarregar } = useAtividade()
  const gerando = tarefas.find((t) => t.tipo === 'calendario' && ['na fila', 'rodando'].includes(t.status))

  const carregar = useCallback(() => criacao.conteudos().then(setItens).catch(() => setItens([])), [])
  useEffect(() => { carregar() }, [carregar])
  useAoConcluir(['calendario', 'roteiro'], (t) => {
    carregar()
    if (t.status === 'erro') toast.danger('A IA não conseguiu terminar', { description: t.erro ?? '' })
    else if (t.tipo === 'calendario') toast.success('Calendário pronto', { description: `${(t.resultado?.novos as number) ?? ''} conteúdos novos no seu plano.` })
  })

  const dias = useMemo(() => Array.from({ length: 28 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return d }), [inicio])
  const hoje = iso(new Date())
  const porDia = useMemo(() => {
    const m = new Map<string, Conteudo[]>()
    itens?.forEach((c) => { if (c.data) m.set(c.data, [...(m.get(c.data) ?? []), c]) })
    return m
  }, [itens])
  const semData = itens?.filter((c) => !c.data) ?? []

  const gerar = async (semanas: number) => {
    try {
      const amanha = new Date(); amanha.setDate(amanha.getDate() + 1)
      await criacao.gerarCalendario(semanas, iso(amanha))
      recarregar()
    } catch (e) { toast.danger('Não deu para gerar', { description: (e as Error).message }) }
  }
  const mover = async (id: number, data: string | null) => {
    setItens((xs) => xs?.map((c) => (c.id === id ? { ...c, data } : c)) ?? xs)
    await criacao.atualizarConteudo(id, { data }).catch(() => carregar())
  }
  const soltar = (data: string | null) => (e: React.DragEvent) => {
    e.preventDefault()
    const id = Number(e.dataTransfer.getData('text/plain'))
    setSobre(null); setArrastando(null)
    if (id) mover(id, data)
  }
  const alvo = (chave: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setSobre(chave) },
    onDragLeave: () => setSobre((s) => (s === chave ? null : s)),
  })
  const novo = (data: string | null) => { setDataNovo(data); setAberto('novo') }
  const mes = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long' })

  const Cartao = ({ c }: { c: Conteudo }) => (
    <button draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); setArrastando(c.id) }}
      onDragEnd={() => setArrastando(null)} onClick={() => setAberto(c)}
      className={`group w-full rounded-xl bg-surface p-2 text-left text-xs shadow-sm ring-1 ring-[var(--hairline)] transition-all hover:-translate-y-0.5 hover:ring-accent/50 ${arrastando === c.id ? 'opacity-40' : ''}`}>
      <span className="mb-1 flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS[c.status].cor }} />
        <span className="truncate text-[10px] tracking-wide text-muted uppercase">{FORMATOS[c.formato ?? ''] ?? c.formato ?? 'Post'}</span>
      </span>
      <span className="line-clamp-3 leading-snug font-medium">{c.titulo}</span>
    </button>
  )

  if (itens === null) return <div className="carregando h-96" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button isIconOnly size="sm" variant="ghost" aria-label="Semanas anteriores" onPress={() => setInicio((d) => { const x = new Date(d); x.setDate(x.getDate() - 14); return x })}><ChevronLeft /></Button>
          <Button size="sm" variant="ghost" onPress={() => setInicio(segunda(new Date()))}>Hoje</Button>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Próximas semanas" onPress={() => setInicio((d) => { const x = new Date(d); x.setDate(x.getDate() + 14); return x })}><ChevronRight /></Button>
        </div>
        <p className="titulo-display text-lg font-semibold capitalize">
          {mes(dias[0])}{mes(dias[0]) !== mes(dias[27]) ? ` – ${mes(dias[27])}` : ''} <span className="num text-sm font-normal text-muted">{dias[0].getFullYear()}</span>
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="tertiary" onPress={() => novo(null)}><Plus /> Nova ideia</Button>
          <Menu titulo="Planejar com IA" gatilho={(abrir) => (
            <Button className="botao-sinal" isDisabled={!!gerando} onPress={abrir}><Sparkles /> Gerar com IA</Button>
          )} itens={[1, 2, 4].map((s) => ({ id: s, rotulo: `Próxima${s > 1 ? 's' : ''} ${s} semana${s > 1 ? 's' : ''}`, aoEscolher: () => gerar(s) }))} />
        </div>
      </div>

      {gerando && (
        <div className="magico entrar-cima flex items-center gap-4 rounded-3xl p-5">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface/70 text-foreground"><AnimProcesso tipo="geracao" tamanho={44} /></span>
          <div>
            <p className="font-medium">{gerando.status === 'na fila' ? 'Na fila…' : gerando.etapa}</p>
            <p className="text-sm text-muted">A IA cruza sua estratégia, seu ritmo possível e o que funciona nos concorrentes.</p>
          </div>
        </div>
      )}

      {itens.length === 0 && !gerando ? (
        <div className="cartao flex flex-col items-center px-6 py-14 text-center">
          <div className="text-foreground"><Radar /></div>
          <h3 className="titulo-display mt-2 text-xl font-semibold">Seu calendário está vazio</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Peça para a IA planejar as próximas semanas a partir da sua estratégia, ou anote suas ideias e arraste para os dias.
          </p>
          <Button className="botao-sinal mt-5" onPress={() => gerar(2)}><Sparkles /> Planejar 2 semanas</Button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          {/* grade (desktop) */}
          <div className="cartao hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b linha-fina">
              {DIAS.map((d) => <p key={d} className="px-2 py-2 text-center text-xs font-medium text-muted">{d}</p>)}
            </div>
            <div className="grid grid-cols-7">
              {dias.map((d) => {
                const k = iso(d)
                const lista = porDia.get(k) ?? []
                const passado = k < hoje
                return (
                  <div key={k} {...alvo(k)} onDrop={soltar(k)}
                    className={`group/dia relative min-h-32 border-r border-b p-1.5 linha-fina transition-colors [&:nth-child(7n)]:border-r-0 ${sobre === k ? 'bg-accent/10' : passado ? 'bg-surface-secondary/30' : ''}`}>
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={`num grid size-6 place-items-center rounded-full text-xs ${k === hoje ? 'botao-sinal font-semibold' : passado ? 'text-muted/60' : 'text-muted'}`}>{d.getDate()}</span>
                      <button onClick={() => novo(k)} aria-label="Nova ideia neste dia"
                        className="grid size-5 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover/dia:opacity-100 hover:bg-surface-secondary hover:text-foreground">
                        <Plus className="size-3" />
                      </button>
                    </div>
                    <div className="space-y-1">{lista.map((c) => <Cartao key={c.id} c={c} />)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* lista (celular) */}
          <div className="space-y-2 md:hidden">
            {dias.filter((d) => porDia.has(iso(d))).map((d) => (
              <div key={iso(d)} className="cartao p-3">
                <p className="mb-2 text-xs font-medium text-muted capitalize">{d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                <div className="space-y-1.5">{porDia.get(iso(d))!.map((c) => <Cartao key={c.id} c={c} />)}</div>
              </div>
            ))}
          </div>

          {/* ideias sem data */}
          <aside {...alvo('sem')} onDrop={soltar(null)}
            className={`cartao h-fit space-y-2 p-3 transition-colors ${sobre === 'sem' ? 'ring-2 ring-accent/50' : ''}`}>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium">Ideias sem data</p>
              <span className="num text-xs text-muted">{semData.length}</span>
            </div>
            {semData.length === 0 && <p className="px-1 pb-2 text-xs leading-relaxed text-muted">Arraste um conteúdo para cá para tirá-lo do calendário.</p>}
            {semData.map((c) => <Cartao key={c.id} c={c} />)}
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-1 pt-2 linha-fina">
              {Object.entries(STATUS).map(([k, s]) => (
                <span key={k} className="flex items-center gap-1 text-[11px] text-muted"><span className="size-1.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span>
              ))}
            </div>
          </aside>
        </div>
      )}

      <DetalheConteudo conteudo={aberto === 'novo' ? null : aberto} novo={aberto === 'novo'} dataNovo={dataNovo}
        aoFechar={() => setAberto(null)} aoMudar={(c) => { carregar(); if (c) setAberto(c) }} aoGerarImagem={aoGerarImagem} />
    </div>
  )
}
