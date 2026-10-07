import { Button, toast } from '@heroui/react'
import { ChevronLeft, ChevronRight, Funnel, LayoutColumns3, ListUl, MagicWand, Plus, Sparkles, Calendar as IconeCalendario, Layers } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { criacao, ia, type Conteudo, type Estrategia, type StatusConteudo } from '../../api'
import type { PedidoImagem } from '../../telas/Criar'
import { tocar } from '../../sons'
import { AnimProcesso } from '../AnimProcessos'
import { useAoConcluir, useAtividade } from '../Atividade'
import { Menu } from '../Menu'
import { CartaoPrevia, FORMATOS, iso, segunda, somarDias, usePrevia } from './comum'
import { Criador } from './Criador'
import { DetalheConteudo } from './DetalheConteudo'
import { PainelLateral } from './PainelLateral'
import { Sessao } from './Sessao'
import { FilaProducao, VisaoLista, VisaoMes, VisaoQuadro, VisaoSemana, type Comum } from './Visoes'
import { Ilustracao } from '../Ilustracao'


type Visao = 'mes' | 'semana' | 'lista' | 'quadro'
const VISOES: { id: Visao; nome: string; icone: React.ReactNode }[] = [
  { id: 'mes', nome: 'Mês', icone: <IconeCalendario /> },
  { id: 'semana', nome: 'Semana', icone: <LayoutColumns3 /> },
  { id: 'lista', nome: 'Lista', icone: <ListUl /> },
  { id: 'quadro', nome: 'Quadro', icone: <Layers /> },
]

const lerVisao = (): Visao => {
  try { const v = localStorage.getItem('calendario:visao'); if (v && VISOES.some((x) => x.id === v)) return v as Visao } catch { /* ignora */ }
  return window.matchMedia('(max-width: 640px)').matches ? 'lista' : 'mes'
}

export function Calendario({ aoGerarImagem }: { aoGerarImagem: (p: PedidoImagem) => void }) {
  const [itens, setItens] = useState<Conteudo[] | null>(null)
  const [visao, setVisao] = useState<Visao>(lerVisao)
  const [ref, setRef] = useState(() => new Date())
  const [aberto, setAberto] = useState<Conteudo | 'novo' | null>(null)
  const [dataNovo, setDataNovo] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [capas, setCapas] = useState<Record<number, string>>({})
  const [estrategia, setEstrategia] = useState<Estrategia | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusConteudo | null>(null)
  const [filtroFormato, setFiltroFormato] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [criador, setCriador] = useState<{ data: string | null } | null>(null)
  const [sessao, setSessao] = useState(false)
  const previa = usePrevia()
  const { ia: tarefas, recarregar } = useAtividade()
  const gerando = tarefas.find((t) => t.tipo === 'calendario' && ['na fila', 'rodando'].includes(t.status))

  const carregar = useCallback(() => criacao.conteudos().then(setItens).catch(() => setItens([])), [])
  const carregarCapas = useCallback(() => criacao.imagens().then((xs) => {
    const m: Record<number, string> = {}
    xs.forEach((i) => { if (i.conteudo_id && !m[i.conteudo_id]) m[i.conteudo_id] = i.url })
    setCapas(m)
  }).catch(() => {}), [])
  useEffect(() => {
    carregar(); carregarCapas()
    ia.estrategia().then((e) => setEstrategia(e.estrategia?.estrategia ?? null)).catch(() => {})
  }, [carregar, carregarCapas])
  useEffect(() => { try { localStorage.setItem('calendario:visao', visao) } catch { /* ignora */ } }, [visao])
  useAoConcluir(['calendario', 'roteiro', 'imagem'], (t) => {
    if (t.tipo === 'imagem') return carregarCapas()
    carregar()
    if (t.status === 'erro') toast.danger('A IA não conseguiu terminar', { description: t.erro ?? '' })
    else if (t.tipo === 'calendario') toast.success('Calendário pronto', { description: `${(t.resultado?.novos as number) ?? ''} conteúdos novos no seu plano.` })
  })

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (itens ?? []).filter((c) => (!filtroStatus || c.status === filtroStatus) && (!filtroFormato || c.formato === filtroFormato)
      && (!q || c.titulo.toLowerCase().includes(q) || (c.dados.gancho ?? '').toLowerCase().includes(q) || (c.pilar ?? '').toLowerCase().includes(q)))
  }, [itens, filtroStatus, filtroFormato, busca])

  const gerar = async (semanas: number) => {
    try {
      await criacao.gerarCalendario(semanas, iso(somarDias(new Date(), 1)))
      recarregar()
    } catch (e) { toast.danger('Não deu para gerar', { description: (e as Error).message }) }
  }
  const mover = async (id: number, data: string | null) => {
    tocar('pasta')
    setItens((xs) => xs?.map((c) => (c.id === id ? { ...c, data } : c)) ?? xs)
    await criacao.atualizarConteudo(id, { data }).catch(() => carregar())
  }
  const mudarStatus = async (c: Conteudo, status: StatusConteudo) => {
    tocar(status === 'publicado' ? 'geracaoFim' : status === 'pronto' ? 'coletaFim' : 'pasta')
    setItens((xs) => xs?.map((i) => (i.id === c.id ? { ...i, status } : i)) ?? xs)
    await criacao.atualizarConteudo(c.id, { status }).catch(() => carregar())
  }
  const roteirizar = async (ids: number[]) => {
    for (const id of ids) await criacao.gerarRoteiro(id).catch(() => {})
    if (ids.length) recarregar()
  }

  const x: Comum = {
    itens: filtrados, capas, arrastando, setArrastando, sobre, setSobre, mover, mudarStatus,
    abrir: (c) => { previa.sair(); setAberto(c) },
    novo: (data) => setCriador({ data }),
    previa,
  }

  // navegação conforme a visão
  const inicioSemana = segunda(ref)
  const navegar = (dir: number) => setRef((r) => visao === 'semana' ? somarDias(r, dir * 7) : new Date(r.getFullYear(), r.getMonth() + dir, 1))
  const tituloBruto = visao === 'semana'
    ? `${inicioSemana.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${somarDias(inicioSemana, 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
    : ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const titulo = tituloBruto.charAt(0).toUpperCase() + tituloBruto.slice(1)
  const comNavegacao = visao === 'mes' || visao === 'semana'
  const filtrosAtivos = (filtroStatus ? 1 : 0) + (filtroFormato ? 1 : 0)

  if (itens === null) return <div className="carregando h-[70vh] rounded-3xl" />

  return (
    <div className="space-y-5">
      {/* barra de ferramentas */}
      <div className="cartao flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
        <div className="flex rounded-2xl bg-surface-secondary/60 p-1">
          {VISOES.map((v) => (
            <button key={v.id} onClick={() => setVisao(v.id)} aria-pressed={visao === v.id}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-all [&_svg]:size-4 ${visao === v.id ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {v.icone}<span className="hidden sm:inline">{v.nome}</span>
            </button>
          ))}
        </div>
        {comNavegacao && (
          <div className="flex items-center gap-1">
            <Button isIconOnly size="sm" variant="ghost" aria-label="Anterior" onPress={() => navegar(-1)}><ChevronLeft /></Button>
            <Button size="sm" variant="ghost" onPress={() => setRef(new Date())}>Hoje</Button>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Próximo" onPress={() => navegar(1)}><ChevronRight /></Button>
            <p className="titulo-display ml-1 text-lg font-semibold">{titulo}</p>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label="Buscar conteúdos"
            className="h-9 w-40 rounded-xl bg-surface-secondary/70 px-3 text-sm outline-none focus:w-56 focus:ring-2 focus:ring-accent/40 transition-all" />
          <Menu titulo="Filtrar por formato" gatilho={(abrir) => (
            <Button size="sm" variant="tertiary" onPress={abrir}><Funnel /> Filtros{filtrosAtivos ? ` · ${filtrosAtivos}` : ''}</Button>
          )} itens={[
            ...Object.entries(FORMATOS).map(([k, f]) => ({ id: k, rotulo: f.nome, marcado: filtroFormato === k,
              icone: <span className="size-2.5 rounded-full" style={{ background: f.cor }} />, aoEscolher: () => setFiltroFormato(filtroFormato === k ? null : k) })),
            ...(filtrosAtivos ? [{ id: 'limpar', rotulo: 'Limpar filtros', aoEscolher: () => { setFiltroFormato(null); setFiltroStatus(null) } }] : []),
          ]} />
          <Button size="sm" variant="tertiary" onPress={() => setSessao(true)}><Layers /> Sessão de ideias</Button>
          <Button size="sm" variant="tertiary" onPress={() => setCriador({ data: null })}><MagicWand /> Criar com IA</Button>
          <Menu titulo="Planejar com a IA" gatilho={(abrir) => (
            <Button size="sm" className="botao-sinal" isDisabled={!!gerando} onPress={abrir}><Sparkles /> Planejar semanas</Button>
          )} itens={[1, 2, 4].map((s) => ({ id: s, rotulo: `Próxima${s > 1 ? 's' : ''} ${s} semana${s > 1 ? 's' : ''}`, aoEscolher: () => gerar(s) }))} />
          <Button isIconOnly size="sm" variant="ghost" aria-label="Nova ideia em branco" onPress={() => { setDataNovo(null); setAberto('novo') }}><Plus /></Button>
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
        <div className="cartao flex flex-col items-center px-6 py-16 text-center">
          <Ilustracao tipo="calendario" />
          <h3 className="titulo-display mt-2 text-2xl font-semibold">Vamos encher seu calendário</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Três jeitos de começar: a IA planeja as semanas, você escolhe ideias num baralho, ou monta uma ideia passo a passo.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button className="botao-sinal" onPress={() => gerar(2)}><Sparkles /> Planejar 2 semanas</Button>
            <Button variant="tertiary" onPress={() => setSessao(true)}><Layers /> Sessão de ideias</Button>
            <Button variant="tertiary" onPress={() => setCriador({ data: null })}><MagicWand /> Criar com IA</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <div key={visao} className="troca-pagina">
              {visao === 'mes' && <VisaoMes x={x} mes={ref} />}
              {visao === 'semana' && <VisaoSemana x={x} inicio={inicioSemana} />}
              {visao === 'lista' && <VisaoLista x={x} />}
              {visao === 'quadro' && <VisaoQuadro x={x} />}
            </div>
            {(visao === 'mes' || visao === 'semana') && <FilaProducao x={x} />}
          </div>
          <PainelLateral itens={itens} estrategia={estrategia} filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
            capas={capas} arrastando={arrastando} setArrastando={setArrastando} sobre={sobre} setSobre={setSobre}
            mover={mover} mudarStatus={mudarStatus} abrir={x.abrir} previa={previa} aoAbrirSessao={() => setSessao(true)} />
        </div>
      )}

      {!arrastando && <CartaoPrevia previa={previa.previa} capa={previa.previa ? capas[previa.previa.c.id] : undefined} />}

      <DetalheConteudo conteudo={aberto === 'novo' ? null : aberto} novo={aberto === 'novo'} dataNovo={dataNovo}
        aoFechar={() => setAberto(null)} aoMudar={(c) => { carregar(); if (c) setAberto(c) }} aoGerarImagem={aoGerarImagem} />
      <Criador aberto={!!criador} aoFechar={() => setCriador(null)} estrategia={estrategia} itens={itens} dataInicial={criador?.data ?? null}
        aoCriar={(c, rot) => {
          carregar()
          toast.success('No calendário!', { description: rot ? 'O roteiro está sendo escrito.' : c.titulo })
          if (rot) roteirizar([c.id])
        }} />
      <Sessao aberto={sessao} aoFechar={() => setSessao(false)} estrategia={estrategia} itens={itens}
        aoConcluir={(criados, rot) => {
          carregar()
          toast.success(`${criados.length} ideia${criados.length > 1 ? 's' : ''} no calendário`, { description: rot.length ? `${rot.length} roteiro${rot.length > 1 ? 's' : ''} sendo escrito${rot.length > 1 ? 's' : ''}.` : undefined })
          roteirizar(rot)
        }} />
    </div>
  )
}
