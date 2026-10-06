import { Button, Drawer, toast } from '@heroui/react'
import {
  ArrowRight, ArrowRotateRight, ArrowUpRightFromSquare, Check, ChevronDown, Eye, EyeSlash, FileText, Plus, Sparkles,
  ThumbsDown, ThumbsUp, Xmark,
} from '@gravity-ui/icons'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { api, central as apiCentral, criacao, type Central, type Conta, type DescobertaRef, type Evidencia, type IdeiaGerada,
  type Insight, type Metrica, type Video } from '../api'
import { aura, auraMarca } from '../aura'
import { CheckDesenhado, Radar } from '../components/Animacoes'
import { AnimProcesso, Explosao } from '../components/AnimProcessos'
import { useAoConcluir } from '../components/Atividade'
import { FORMATOS } from '../components/criar/comum'
import { fmtNum } from '../formato'
import { tocar } from '../sons'
import { ModalVideo } from './Biblioteca'

type Aba = 'inicio' | 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'criar' | 'downloads'

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  irPara: (a: Aba) => void
}

const BASE_IDEIA: Record<string, string> = {
  seu_historico: 'Do seu histórico', tendencia: 'Tendência', concorrente: 'Concorrente', referencia: 'Referência',
  estrategia: 'Sua estratégia', publico: 'Seu público',
}
const CATEGORIA_REF: Record<string, string> = {
  crescendo: 'Crescendo', criativo: 'Criativo', player: 'Player relevante', engajamento: 'Comunidade forte',
  emergente: 'Emergente', mesmo_publico: 'Mesmo público',
}

function quando(ts: number | null) {
  if (!ts) return null
  const d = new Date(ts * 1000)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `ontem às ${hora}`
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ` às ${hora}`
}

function valorMetrica(m: Metrica) {
  if (m.valor === null || m.valor === undefined) return '—'
  if (m.chave === 'engajamento') return `${m.valor.toFixed(m.valor < 1 ? 2 : 1)}%`
  return fmtNum(m.valor)
}

export function TelaInicio({ contas, setContas, irPara }: Props) {
  const [c, setC] = useState<Central | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<Video | null>(null)
  const [todosSinais, setTodosSinais] = useState(false)
  const [nome, setNome] = useState('')

  const carregar = useCallback(() => apiCentral.ler().then(setC).catch((e) => setErro((e as Error).message)), [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { import('../api').then(({ ia }) => ia.marca().then((m) => setNome(m.nome?.split('(')[0].trim() || '')).catch(() => {})) }, [])
  useAoConcluir(['inteligencia'], (t) => { if (t.status === 'concluído') carregar() })

  const abrirPost = async (e: Evidencia) => {
    const vs = await api.biblioteca().catch(() => [] as Video[])
    const v = vs.find((x) => x.plataforma === e.plataforma && x.id === e.id)
    if (v) setAberto(v)
    else toast('Esse post não está na sua biblioteca')
  }
  const avaliar = async (i: Insight, estado: 'interessante' | 'irrelevante' | 'oculto' | 'feito') => {
    tocar(estado === 'interessante' ? 'favorito' : 'clique')
    setC((x) => x && ({
      ...x,
      ...(['irrelevante', 'oculto', 'feito'].includes(estado) ? {
        atencao: x.atencao.filter((y) => y.id !== i.id), mercado: x.mercado.filter((y) => y.id !== i.id),
        ideias: x.ideias.filter((y) => y.id !== i.id), desde: x.desde.filter((y) => y.id !== i.id),
      } : {}),
    }))
    await apiCentral.avaliar(i.id, estado).catch(() => {})
    if (estado === 'interessante') toast.success('Anotado', { description: 'Vamos trazer mais coisas assim.' })
    if (estado === 'irrelevante') toast('Entendido', { description: 'Vamos mostrar menos sugestões parecidas.' })
  }
  const agir = async (i: Insight) => {
    const a = i.dados.acao
    if (!a) return
    if (a.tipo === 'ir' && a.destino) irPara(a.destino as Aba)
    if (a.tipo === 'rolar') document.getElementById(a.alvo ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (a.tipo === 'reclassificar') {
      const lista = await apiCentral.reclassificar(i.id)
      setContas(lista)
      tocar('coletaFim')
      toast.success('Perfis reclassificados como referência', { description: 'As comparações agora usam só seus concorrentes diretos.' })
      setC((x) => x && ({ ...x, atencao: x.atencao.filter((y) => y.id !== i.id), desde: x.desde.filter((y) => y.id !== i.id) }))
    }
  }
  const atualizar = async () => {
    await apiCentral.atualizar().catch(() => {})
    setC((x) => x && { ...x, rodando: true })
    toast('Atualizando em segundo plano', { description: 'Você pode continuar usando a plataforma.' })
  }

  if (erro) return <div className="cartao p-10 text-center text-muted">{erro}</div>
  if (!c) return <div className="space-y-5"><div className="carregando h-72 rounded-[1.75rem]" /><div className="carregando h-48" /></div>

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const passos = Object.values(c.jornada).filter(Boolean).length
  const atualizadoTexto = c.rodando ? 'Atualizando em segundo plano' : c.atualizado ? `Atualizado ${quando(c.atualizado)}` : 'Primeira análise a caminho'
  const mercadoVisivel = c.mercado.slice(0, 4)

  return (
    <div className="space-y-6">
      {/* BLOCO 1 · situação atual */}
      <Situacao c={c} nome={nome} saudacao={saudacao} atualizadoTexto={atualizadoTexto} aoAtualizar={atualizar} irPara={irPara} />

      {passos < 6 && <JornadaCompacta jornada={c.jornada} irPara={irPara} />}

      {c.desde.length > 0 && (
        <section className="cartao entrar-cima p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full bg-accent pulsando" /> Desde sua última visita</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {c.desde.map((i) => (
              <li key={i.id}>
                <button onClick={() => (i.dados.acao ? agir(i) : document.getElementById(`insight-${i.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))}
                  className="flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-secondary/60">
                  <Seta direcao={i.dados.direcao} tipo={i.tipo} />
                  <span className="leading-snug">{i.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* BLOCO 2 · merece sua atenção */}
        <Bloco titulo="Merece sua atenção">
          {c.atencao.length === 0 ? (
            <Vazio texto="Nada pedindo sua atenção agora. Quando algo mudar de verdade no seu perfil ou no mercado, aparece aqui." />
          ) : (
            <div className="cascata space-y-3">
              {c.atencao.map((i, n) => <CartaoAtencao key={i.id} i={i} n={n} agir={agir} avaliar={avaliar} abrirPost={abrirPost} />)}
            </div>
          )}
        </Bloco>

        {/* BLOCO 4 · mercado */}
        <Bloco titulo="O que está acontecendo no seu mercado">
          {c.mercado.length === 0 ? (
            <Vazio texto={contas.some((x) => x.papel !== 'proprio')
              ? 'Ainda não há sinais com dados suficientes. Não vamos mostrar tendência sem evidência.'
              : 'Acompanhe concorrentes e referências para começarmos a observar seu mercado.'} />
          ) : (
            <div className="cartao divide-y linha-fina [&>*]:linha-fina">
              {mercadoVisivel.map((i) => <LinhaSinal key={i.id} i={i} avaliar={avaliar} abrirPost={abrirPost} />)}
              {c.mercado.length > 4 && (
                <button onClick={() => setTodosSinais(true)} className="w-full px-5 py-3 text-left text-sm text-muted hover:text-foreground">
                  Ver todos os {c.mercado.length} sinais <ArrowRight className="inline size-3.5" />
                </button>
              )}
            </div>
          )}
        </Bloco>
      </div>

      {/* BLOCO 3 · ideias para hoje */}
      <Bloco titulo="Ideias para hoje" extra={c.ideias.length ? <button onClick={() => irPara('criar')} className="text-sm text-muted hover:text-foreground">Abrir calendário <ArrowRight className="inline size-3.5" /></button> : null}>
        {c.ideias.length === 0 ? (
          <Vazio texto={c.rodando || c.primeira_vez ? 'Estamos analisando seus conteúdos e seu mercado. As primeiras ideias chegam em instantes.' : 'Estamos conhecendo seu perfil. Conforme coletarmos mais informações, as ideias ficam mais personalizadas.'} />
        ) : (
          <div className="cascata grid gap-3 md:grid-cols-3">
            {c.ideias.map((i, n) => <CartaoIdeia key={i.id} i={i} n={n} avaliar={avaliar} abrirPost={abrirPost} />)}
          </div>
        )}
      </Bloco>

      {/* BLOCO 5 · descoberta */}
      <section id="descobertas" className="scroll-mt-24">
        <Bloco titulo="Novas referências para você" extra={<span className="text-xs text-muted">Descobertas automaticamente · você decide quem acompanhar</span>}>
          {c.descobertas.length === 0 ? (
            <Vazio texto="Procuramos perfis do seu nicho todos os dias. Quando surgir algo que valha a pena, aparece aqui." />
          ) : (
            <Descobertas lista={c.descobertas} setLista={(l) => setC((x) => x && { ...x, descobertas: l })} setContas={setContas} />
          )}
        </Bloco>
      </section>

      <Drawer.Backdrop isOpen={todosSinais} onOpenChange={setTodosSinais}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex h-full w-screen max-w-full flex-col sm:w-[520px]">
            <Drawer.CloseTrigger />
            <Drawer.Header><Drawer.Heading className="titulo-display text-lg font-semibold">Sinais do seu mercado</Drawer.Heading></Drawer.Header>
            <Drawer.Body data-rolavel="y" className="flex-1 overflow-y-auto">
              <div className="divide-y linha-fina [&>*]:linha-fina">
                {c.mercado.map((i) => <LinhaSinal key={i.id} i={i} avaliar={avaliar} abrirPost={abrirPost} aberto />)}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
      <ModalVideo video={aberto} onFechar={() => setAberto(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- bloco 1

function Situacao({ c, nome, saudacao, atualizadoTexto, aoAtualizar, irPara }: {
  c: Central; nome: string; saudacao: string; atualizadoTexto: string; aoAtualizar: () => void; irPara: (a: Aba) => void
}) {
  const p = c.perfil
  const corTom = { alerta: 'var(--sinal-b)', atencao: 'var(--ambar)', positivo: 'var(--menta)', neutro: 'rgb(255 255 255 / .6)' }[p.tom ?? 'neutro']
  return (
    <section className="aura overflow-hidden rounded-[1.75rem] text-white" style={p.tem_perfil ? aura(p.contas?.[0] ?? 'perfil', 0.85) : auraMarca}>
      <div className="px-6 pt-7 pb-6 sm:px-9 sm:pt-9">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/75">
          <span>{saudacao}{nome ? `, ${nome}` : ''}</span>
          <span className="ml-auto flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs backdrop-blur-md">
            <span className={`size-1.5 rounded-full ${c.rodando ? 'bg-[var(--ambar)] pulsando' : 'bg-[var(--menta)]'}`} />{atualizadoTexto}
            {!c.rodando && <button onClick={aoAtualizar} aria-label="Atualizar agora" title="Atualizar agora" className="ml-1 opacity-70 hover:opacity-100"><ArrowRotateRight className="size-3" /></button>}
          </span>
        </div>
        {p.tem_perfil ? (
          <>
            <p className="mt-5 text-xs tracking-wide text-white/60 uppercase">Seu perfil esta semana · {p.contas?.join(', ')}</p>
            <h1 className="titulo-display mt-2 max-w-3xl text-2xl leading-[1.15] font-semibold sm:text-[2rem]">
              <span className="mr-2 inline-block size-2.5 -translate-y-1 rounded-full" style={{ background: corTom }} />{p.leitura}
            </h1>
            {p.dias_sem_postar != null && p.dias_sem_postar >= 10 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" className="bg-white font-semibold text-black" onPress={() => document.getElementById('ideias-hoje')?.scrollIntoView({ behavior: 'smooth' })}>Ver ideias para hoje</Button>
                <Button size="sm" className="bg-white/15 text-white backdrop-blur-md" onPress={() => irPara('criar')}>Abrir calendário</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="titulo-display mt-5 max-w-2xl text-3xl leading-tight font-semibold sm:text-4xl">Estamos conhecendo seu perfil.</h1>
            <p className="mt-2 max-w-xl text-white/75">Conecte seu Instagram ou TikTok para ver como ele está, o que mudou e o que fazer agora.</p>
            <Button className="mt-5 bg-white font-semibold text-black" onPress={() => irPara('meuperfil')}>Conectar meu perfil <ArrowRight /></Button>
          </>
        )}
      </div>
      {p.tem_perfil && p.metricas && (
        <div className="grid grid-cols-2 border-t border-white/12 bg-black/15 backdrop-blur-sm md:grid-cols-4">
          {p.metricas.map((m, i) => (
            <div key={m.chave} className={`px-6 py-4 sm:px-9 ${i % 2 ? '' : 'border-r'} border-white/12 md:border-r md:last:border-r-0 ${i < 2 ? 'border-b md:border-b-0' : ''}`}>
              <p className="text-xs text-white/60">{m.rotulo}</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="num text-xl font-semibold">{valorMetrica(m)}</span>
                {m.delta !== null && <Variacao delta={m.delta} direcao={m.direcao} />}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-white/55">{m.delta !== null ? m.comparacao : m.nota ?? m.comparacao ?? ''}</p>
              {m.chave === 'engajamento' && m.referencia?.concorrentes != null && (
                <p className="truncate text-[11px] text-white/45">concorrentes: {m.referencia.concorrentes.toFixed(2)}%</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Variacao({ delta, direcao }: { delta: number; direcao: Metrica['direcao'] }) {
  const cor = direcao === 'alta' ? 'var(--menta)' : direcao === 'queda' ? '#ff7a7a' : 'rgb(255 255 255 / .6)'
  const seta = direcao === 'alta' ? '▲' : direcao === 'queda' ? '▼' : '→'
  return <span className="num text-xs font-semibold" style={{ color: cor }}>{seta} {delta > 0 ? '+' : ''}{delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}%</span>
}

const NOMES_JORNADA: [keyof Central['jornada'], string, Aba][] = [
  ['perfil', 'Conectar seu perfil', 'meuperfil'], ['brief', 'Preencher o brief', 'meuperfil'], ['concorrentes', 'Escolher concorrentes', 'contas'],
  ['analise', 'Analisar o mercado', 'inteligencia'], ['estrategia', 'Gerar a estratégia', 'meuperfil'], ['planejamento', 'Planejar conteúdo', 'criar'],
]

function JornadaCompacta({ jornada, irPara }: { jornada: Central['jornada']; irPara: (a: Aba) => void }) {
  const feitos = NOMES_JORNADA.filter(([k]) => jornada[k]).length
  const prox = NOMES_JORNADA.find(([k]) => !jornada[k])
  return (
    <section className="cartao flex flex-wrap items-center gap-4 px-5 py-3.5">
      <p className="text-sm"><span className="font-medium">Configuração</span> <span className="num text-muted">{feitos}/6</span></p>
      <div className="flex flex-1 gap-1">
        {NOMES_JORNADA.map(([k, n]) => <span key={k} title={n} className={`h-1.5 flex-1 rounded-full ${jornada[k] ? 'botao-sinal' : 'bg-surface-tertiary'}`} />)}
      </div>
      {prox && <Button size="sm" variant="tertiary" onPress={() => irPara(prox[2])}>{prox[1]} <ArrowRight /></Button>}
    </section>
  )
}

// ---------------------------------------------------------------- peças comuns

function Bloco({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  const id = titulo === 'Ideias para hoje' ? 'ideias-hoje' : undefined
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="titulo-display text-xl font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="cartao flex items-center gap-4 p-5 text-sm leading-relaxed text-muted">
      <span className="shrink-0 text-foreground"><Radar tamanho={56} /></span>
      <p>{texto}</p>
    </div>
  )
}

function Seta({ direcao, tipo }: { direcao?: 'alta' | 'queda'; tipo: Insight['tipo'] }) {
  if (direcao === 'alta') return <span className="mt-0.5 shrink-0 text-[var(--menta)]">↑</span>
  if (direcao === 'queda') return <span className="mt-0.5 shrink-0 text-[#ff7a7a]">↓</span>
  return <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tipo === 'sistema' ? 'bg-accent' : 'bg-muted'}`} />
}

function Avaliacao({ i, avaliar }: { i: Insight; avaliar: (i: Insight, e: 'interessante' | 'irrelevante' | 'oculto') => void }) {
  const b = 'grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground [&_svg]:size-3.5'
  return (
    <span className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
      <button className={b} aria-label="Interessante" title="Interessante" onClick={() => avaliar(i, 'interessante')}>
        {i.estado === 'interessante' ? <Check className="text-accent" /> : <ThumbsUp />}
      </button>
      <button className={b} aria-label="Não é relevante" title="Não é relevante" onClick={() => avaliar(i, 'irrelevante')}><ThumbsDown /></button>
      <button className={b} aria-label="Ocultar" title="Ocultar" onClick={() => avaliar(i, 'oculto')}><EyeSlash /></button>
    </span>
  )
}

function Miniaturas({ lista, abrir }: { lista?: Evidencia[]; abrir: (e: Evidencia) => void }) {
  if (!lista?.length) return null
  return (
    <div className="flex gap-1.5">
      {lista.slice(0, 3).map((e) => (
        <button key={e.id} onClick={() => abrir(e)} title={`@${e.conta}${e.lift ? ` · ${e.lift}× a média` : ''}`}
          className="relative h-14 w-10 overflow-hidden rounded-lg bg-surface-secondary ring-1 ring-[var(--hairline)] transition-transform hover:scale-105">
          <img src={`/thumb/${e.plataforma}/${encodeURIComponent(e.conta)}/${encodeURIComponent(e.id)}`} alt="" loading="lazy" className="size-full object-cover"
            onError={(ev) => { const b = ev.currentTarget.parentElement; if (b) b.style.display = 'none' }} />
          {e.lift && <span className="num absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] text-white">{e.lift}×</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- bloco 2

function CartaoAtencao({ i, n, agir, avaliar, abrirPost }: {
  i: Insight; n: number; agir: (i: Insight) => void; avaliar: (i: Insight, e: 'interessante' | 'irrelevante' | 'oculto') => void
  abrirPost: (e: Evidencia) => void
}) {
  const [mais, setMais] = useState(false)
  const { gerar, gerando, painel } = useGeradorDeIdeia(i, avaliar)
  const cor = i.dados.direcao === 'queda' || i.dados.tom === 'alerta' ? 'var(--sinal-b)' : i.tipo === 'sistema' ? 'var(--sinal-a)' : i.dados.direcao === 'alta' ? 'var(--menta)' : 'var(--ambar)'
  const temDetalhe = !!(i.dados.por_que_importa || i.dados.estatistica || i.dados.contas)
  return (
    <article id={`insight-${i.id}`} style={{ '--i': n } as CSSProperties} className="group cartao relative overflow-hidden p-5 pl-6">
      <span className="absolute inset-y-4 left-0 w-1 rounded-r-full" style={{ background: cor }} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
            {i.tipo === 'sistema' ? 'Sua conta' : i.tipo === 'conta' ? (i.dados.rotulo ?? 'Concorrente') : 'Seu perfil'}{i.novo && <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-accent normal-case">novo</span>}
          </p>
          <h3 className="mt-1 leading-snug font-semibold">{i.titulo}</h3>
          {i.texto && <p className={`mt-1 text-sm leading-relaxed text-muted ${mais ? '' : 'line-clamp-2'}`}>{i.texto}</p>}
        </div>
        <Avaliacao i={i} avaliar={avaliar} />
      </div>
      {mais && (
        <div className="entrar-cima mt-3 space-y-2 text-sm">
          {i.dados.por_que_importa && <p className="leading-relaxed"><span className="font-medium">Por que importa: </span>{i.dados.por_que_importa}</p>}
          {i.dados.contas && (
            <ul className="space-y-1 text-muted">{i.dados.contas.map((x) => <li key={x.conta}><span className="text-foreground">@{x.conta.replace(/^@/, '')}</span> — {x.motivo}</li>)}</ul>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {i.dados.acao?.tipo === 'gerar_ideia'
          ? <Button size="sm" variant="tertiary" isDisabled={gerando} onPress={gerar}><Sparkles /> {i.dados.acao.rotulo}</Button>
          : i.dados.acao && <Button size="sm" className={i.tipo === 'sistema' ? 'botao-sinal' : ''} variant={i.tipo === 'sistema' ? undefined : 'tertiary'} onPress={() => { agir(i); if (i.dados.acao?.tipo === 'ir') avaliar(i, 'interessante') }}>{i.dados.acao.rotulo} <ArrowRight /></Button>}
        {temDetalhe && <Button size="sm" variant="ghost" onPress={() => setMais((m) => !m)}>{mais ? 'Menos' : 'Ver detalhes'} <ChevronDown className={mais ? 'rotate-180' : ''} /></Button>}
        <span className="ml-auto"><Miniaturas lista={i.dados.evidencias} abrir={abrirPost} /></span>
      </div>
      {painel}
    </article>
  )
}

// ---------------------------------------------------------------- bloco 3

function CartaoIdeia({ i, n, avaliar, abrirPost }: {
  i: Insight; n: number; avaliar: (i: Insight, e: 'interessante' | 'irrelevante' | 'oculto' | 'feito') => void; abrirPost: (e: Evidencia) => void
}) {
  const [estado, setEstado] = useState<'livre' | 'criando' | 'criado'>('livre')
  const [porque, setPorque] = useState(false)
  const f = FORMATOS[i.dados.formato ?? ''] ?? { nome: i.dados.formato ?? 'Post', cor: 'var(--muted)' }
  const criar = async (roteiro: boolean) => {
    setEstado('criando')
    try {
      const hoje = new Date()
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
      const conteudo = await criacao.criarConteudo({ titulo: i.titulo, formato: i.dados.formato, pilar: i.dados.pilar, data,
        gancho: i.dados.gancho, ideia: i.texto ?? '', inspirado_em: i.dados.evidencias?.map((e) => e.id) })
      if (roteiro) await criacao.gerarRoteiro(conteudo.id)
      setEstado('criado')
      tocar('geracaoFim')
      await avaliar(i, 'feito')
      toast.success(roteiro ? 'No calendário de hoje, com roteiro a caminho' : 'No calendário de hoje', { description: i.titulo })
    } catch (e) {
      setEstado('livre')
      toast.danger('Não deu para criar', { description: (e as Error).message })
    }
  }
  return (
    <article style={{ '--i': n } as CSSProperties} className="group cartao relative flex flex-col gap-2.5 p-5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="num titulo-display text-lg font-semibold text-accent/50">{String(n + 1).padStart(2, '0')}</span>
        <span className="rounded-full px-2 py-0.5 font-medium text-black" style={{ background: f.cor }}>{f.nome}</span>
        {i.dados.base && <span className="truncate rounded-full bg-surface-secondary px-2 py-0.5">{BASE_IDEIA[i.dados.base] ?? i.dados.base}</span>}
      </div>
      <h3 className="leading-snug font-semibold">{i.titulo}</h3>
      {i.dados.gancho && <p className="text-sm leading-relaxed italic">“{i.dados.gancho}”</p>}
      <button onClick={() => setPorque((x) => !x)} className={`text-left text-xs leading-relaxed text-muted ${porque ? '' : 'line-clamp-3'}`}>
        <span className="font-medium text-foreground/80">Por quê: </span>{i.dados.por_que}
      </button>
      <Miniaturas lista={i.dados.evidencias} abrir={abrirPost} />
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {estado === 'criado' ? <span className="flex items-center gap-1.5 text-sm text-[var(--menta)]"><CheckDesenhado tamanho={14} /> No calendário</span> : (
          <>
            <Button size="sm" className="botao-sinal" isPending={estado === 'criando'} onPress={() => criar(true)}><FileText /> Criar com roteiro</Button>
            <Button size="sm" variant="tertiary" isDisabled={estado === 'criando'} onPress={() => criar(false)}><Plus /> Só a ideia</Button>
          </>
        )}
        <button aria-label="Não é relevante" title="Não é relevante" onClick={() => avaliar(i, 'irrelevante')}
          className="ml-auto grid size-7 place-items-center rounded-full text-muted opacity-60 hover:bg-surface-secondary hover:text-foreground group-hover:opacity-100"><Xmark className="size-3.5" /></button>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- bloco 4

/** Insight → ação: transforma um sinal numa ideia, ali mesmo, e deixa guardar no calendário. */
function useGeradorDeIdeia(i: Insight, avaliar: (i: Insight, e: 'interessante') => void) {
  const [ideia, setIdeia] = useState<IdeiaGerada | 'carregando' | null>(null)
  const [salva, setSalva] = useState(false)
  const [demorando, setDemorando] = useState(false)
  useEffect(() => {
    if (ideia !== 'carregando') { setDemorando(false); return }
    const t = setTimeout(() => setDemorando(true), 12000)
    return () => clearTimeout(t)
  }, [ideia])
  const gerar = async () => {
    setIdeia('carregando')
    tocar('geracao')
    try {
      const [r] = await apiCentral.ideia(i.dados.acao?.tema || i.titulo, [i.titulo, i.texto, i.dados.por_que_importa].filter(Boolean).join(' '))
      setIdeia(r ?? null)
      tocar('geracaoFim')
      avaliar(i, 'interessante')
    } catch (e) { setIdeia(null); toast.danger('Não deu para gerar', { description: (e as Error).message }) }
  }
  const salvarIdeia = async (x: IdeiaGerada) => {
    await criacao.criarConteudo({ titulo: x.titulo, formato: x.formato, pilar: x.pilar, gancho: x.gancho, ideia: x.ideia, objetivo: x.objetivo, cta: x.cta, inspirado_em: x.inspirado_em })
    criacao.escolherIdeia(x, true).catch(() => {})
    setSalva(true)
    tocar('pasta')
    toast.success('Ideia no banco do calendário', { description: x.titulo })
  }
  const painel = ideia === 'carregando' ? (
    <div className="magico mt-3 flex items-center gap-3 rounded-2xl p-3 text-sm">
      <span className="text-foreground"><AnimProcesso tipo="geracao" tamanho={30} /></span>
      {demorando ? 'A IA está mais lenta agora, mas a ideia está chegando…' : 'Transformando em uma ideia…'}
    </div>
  ) : ideia ? (
    <div className="entrar-cima relative mt-3 rounded-2xl bg-surface-secondary/70 p-3.5">
      <span className="absolute -top-3 -right-2"><Explosao tamanho={40} /></span>
      <p className="text-[11px] font-medium uppercase" style={{ color: FORMATOS[ideia.formato]?.cor }}>{FORMATOS[ideia.formato]?.nome}</p>
      <p className="mt-0.5 font-semibold">{ideia.titulo}</p>
      <p className="mt-1 text-sm italic">“{ideia.gancho}”</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{ideia.ideia}</p>
      <div className="mt-2.5">
        {salva ? <span className="flex items-center gap-1.5 text-sm text-[var(--menta)]"><CheckDesenhado tamanho={14} /> No banco de ideias</span>
          : <Button size="sm" className="botao-sinal" onPress={() => salvarIdeia(ideia)}><Plus /> Guardar no calendário</Button>}
      </div>
    </div>
  ) : null
  return { gerar, gerando: ideia === 'carregando', painel }
}

function LinhaSinal({ i, avaliar, abrirPost, aberto = false }: {
  i: Insight; avaliar: (i: Insight, e: 'interessante' | 'irrelevante' | 'oculto') => void; abrirPost: (e: Evidencia) => void; aberto?: boolean
}) {
  const [mais, setMais] = useState(aberto)
  const alta = i.dados.direcao !== 'queda'
  const { gerar, gerando, painel } = useGeradorDeIdeia(i, avaliar)
  return (
    <div id={`insight-${i.id}`} className="group px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${alta ? 'bg-[var(--menta)]/15 text-[var(--menta)]' : 'bg-[#ff7a7a]/15 text-[#ff7a7a]'}`}>{alta ? '↑' : '↓'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-wide text-muted uppercase">{i.dados.rotulo}{i.novo && <span className="ml-1.5 text-accent normal-case">· novo</span>}</p>
          <h3 className="mt-0.5 text-[15px] leading-snug font-semibold">{i.titulo}</h3>
          <p className={`mt-1 text-sm leading-relaxed text-muted ${mais ? '' : 'line-clamp-2'}`}>{i.texto}</p>
          {mais && i.dados.por_que_importa && <p className="entrar-cima mt-2 text-sm leading-relaxed"><span className="font-medium">Por que importa: </span>{i.dados.por_que_importa}</p>}
          {mais && i.dados.acao_texto && <p className="mt-1.5 text-sm leading-relaxed text-accent">→ {i.dados.acao_texto}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="tertiary" isDisabled={gerando} onPress={gerar}><Sparkles /> Gerar ideia</Button>
            <Button size="sm" variant="ghost" onPress={() => setMais((m) => !m)}><Eye /> {mais ? 'Menos' : 'Detalhes'}</Button>
            <span className="ml-auto"><Avaliacao i={i} avaliar={avaliar} /></span>
          </div>
          {mais && <div className="mt-2"><Miniaturas lista={i.dados.evidencias} abrir={abrirPost} /></div>}
          {painel}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- bloco 5

function Descobertas({ lista, setLista, setContas }: { lista: DescobertaRef[]; setLista: (l: DescobertaRef[]) => void; setContas: (c: Conta[]) => void }) {
  const [feitos, setFeitos] = useState<Record<number, string>>({})
  const decidir = async (d: DescobertaRef, acao: 'adicionar' | 'ignorar' | 'interessante', papel?: 'concorrente' | 'referencia') => {
    if (acao === 'ignorar') {
      tocar('clique')
      setLista(lista.filter((x) => x.id !== d.id))
      await apiCentral.descoberta(d.id, 'ignorar').catch(() => {})
      return
    }
    if (acao === 'interessante') {
      tocar('favorito')
      setFeitos((f) => ({ ...f, [d.id]: 'interessante' }))
      await apiCentral.descoberta(d.id, 'interessante').catch(() => {})
      return
    }
    setFeitos((f) => ({ ...f, [d.id]: 'adicionando' }))
    try {
      const r = await apiCentral.descoberta(d.id, 'adicionar', papel)
      if (r.contas) setContas(r.contas)
      setFeitos((f) => ({ ...f, [d.id]: 'adicionada' }))
      tocar('coleta')
      toast.success(`@${d.conta} adicionado como ${papel === 'concorrente' ? 'concorrente' : 'referência'}`, { description: 'A coleta e a análise já começaram.' })
    } catch (e) {
      setFeitos((f) => ({ ...f, [d.id]: '' }))
      toast.danger('Não deu para adicionar', { description: (e as Error).message })
    }
  }
  return (
    <div data-rolavel="x" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
      {lista.map((d, n) => {
        const estado = feitos[d.id]
        const papel = d.tipo
        return (
          <article key={d.id} style={{ '--i': n } as CSSProperties} className="group cartao flex w-[300px] shrink-0 snap-start flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <span className="aura grid size-11 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white uppercase" style={aura(d.conta)}>{d.conta.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.nome || `@${d.conta}`}</p>
                <a href={d.plataforma === 'tiktok' ? `https://www.tiktok.com/@${d.conta}` : `https://www.instagram.com/${d.conta}/`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 truncate text-xs text-muted hover:text-foreground">
                  @{d.conta}{d.seguidores ? ` · ${fmtNum(d.seguidores)} seguidores` : ''} <ArrowUpRightFromSquare className="size-3" />
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className={`rounded-full px-2 py-0.5 font-medium ${papel === 'concorrente' ? 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]' : 'bg-accent/15 text-accent'}`}>
                {papel === 'concorrente' ? 'Concorrente direto' : 'Referência'}
              </span>
              {d.categoria && <span className="rounded-full bg-surface-secondary px-2 py-0.5">{CATEGORIA_REF[d.categoria] ?? d.categoria}</span>}
            </div>
            <p className="flex-1 text-sm leading-relaxed text-muted">{d.motivo}</p>
            {estado === 'adicionada' ? (
              <p className="flex items-center gap-1.5 text-sm text-[var(--menta)]"><CheckDesenhado tamanho={14} /> Acompanhando</p>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="botao-sinal" isPending={estado === 'adicionando'} onPress={() => decidir(d, 'adicionar', papel)}>
                  <Plus /> Acompanhar
                </Button>
                <Button size="sm" variant="ghost" onPress={() => decidir(d, 'ignorar')}>Ignorar</Button>
                <button aria-label="Interessante" title="Interessante, mais assim" onClick={() => decidir(d, 'interessante')}
                  className="ml-auto grid size-7 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground">
                  {estado === 'interessante' ? <Check className="size-3.5 text-accent" /> : <ThumbsUp className="size-3.5" />}
                </button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
