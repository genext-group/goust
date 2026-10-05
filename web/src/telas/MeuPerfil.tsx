import { Button, Label, ListBox, Select, Skeleton, toast } from '@heroui/react'
import { ArrowDownToLine, ArrowsRotateRight, Pencil, Sparkles } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ia, type Conta, type Marca, type RegistroEstrategia, type ResumoRelatorio, type Tarefa, type TarefaIA, type Video } from '../api'
import { aura, auraMarca } from '../aura'
import { AvatarConta } from '../components/Avatar'
import { ContextoIA } from '../components/ia/Compartilhado'
import { Assistente } from '../components/meuperfil/Assistente'
import { EstrategiaView } from '../components/meuperfil/EstrategiaView'
import { Pipeline } from '../components/meuperfil/Pipeline'
import { fmtNum } from '../formato'
import { ModalVideo } from './Biblioteca'

const fmtVersao = (v: string) => `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(9, 11)}:${v.slice(11, 13)}`

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  aoBaixar: () => void
  versaoBiblioteca: number
  tarefasDownload: Tarefa[]
  recarregarTarefas: () => void
}

export function TelaMeuPerfil({ contas, setContas, versaoBiblioteca, tarefasDownload, recarregarTarefas }: Props) {
  const proprias = contas.filter((c) => c.papel === 'proprio')
  const [brief, setBrief] = useState<Marca | null>(null)
  const [relatorios, setRelatorios] = useState<Record<string, ResumoRelatorio>>({})
  const [est, setEst] = useState<{ estrategia: RegistroEstrategia | null; versoes: string[]; proprias: number; concorrentes: number } | null>(null)
  const [versao, setVersao] = useState<string | undefined>()
  const [tarefasIA, setTarefasIA] = useState<TarefaIA[]>([])
  const [modo, setModo] = useState<'auto' | 'assistente' | 'painel'>('auto')
  const [etapaInicial, setEtapaInicial] = useState(0)
  const [videos, setVideos] = useState<Video[]>([])
  const [votos, setVotos] = useState<Record<string, number>>({})
  const [aberto, setAberto] = useState<Video | null>(null)

  const carregarBrief = useCallback(() => ia.marca().then(setBrief).catch(() => {}), [])
  const carregarEst = useCallback(() => ia.estrategia(versao).then(setEst).catch(() => {}), [versao])
  useEffect(() => { carregarBrief() }, [carregarBrief])
  useEffect(() => { carregarEst() }, [carregarEst])
  useEffect(() => { api.biblioteca().then(setVideos).catch(() => {}) }, [versaoBiblioteca])
  const ref = `estrategia/${est?.estrategia?.versao ?? ''}`
  useEffect(() => { ia.votos(ref).then(setVotos).catch(() => setVotos({})) }, [ref])

  // acompanha coleta + análise ao vivo
  useEffect(() => {
    let antes = new Set<number>()
    const tick = async () => {
      const ts = await ia.tarefas().catch(() => [] as TarefaIA[])
      setTarefasIA(ts)
      const fim = ts.filter((t) => antes.has(t.id) && (t.status === 'concluído' || t.status === 'erro'))
      fim.forEach((t) => t.status === 'erro'
        ? toast.danger('A análise falhou', { description: t.erro ?? '' })
        : toast.success(t.tipo === 'estrategia' ? 'Sua estratégia está pronta' : `Análise de @${t.conta} pronta`))
      if (fim.length) { carregarEst(); ia.relatorios().then(setRelatorios).catch(() => {}) }
      antes = new Set(ts.filter((t) => t.status === 'na fila' || t.status === 'rodando').map((t) => t.id))
    }
    tick()
    ia.relatorios().then(setRelatorios).catch(() => {})
    const id = setInterval(() => { if (!document.hidden) tick() }, 4000)
    return () => clearInterval(id)
  }, [carregarEst])

  const relatoriosProprios = useMemo(() => new Set(Object.keys(relatorios)), [relatorios])
  const camposBrief = brief ? Object.values(brief).filter((v) => v?.trim()).length : 0
  const completo = proprias.length > 0 && camposBrief >= 6
  const mostrarAssistente = modo === 'assistente' || (modo === 'auto' && brief !== null && !completo)
  const tarefaEst = tarefasIA.find((t) => t.tipo === 'estrategia' && (t.status === 'na fila' || t.status === 'rodando'))
  const principal = proprias[0]

  const gerarEstrategia = async () => {
    try {
      await ia.analisar({ tipo: 'estrategia' })
      setVersao(undefined)
      setTarefasIA(await ia.tarefas())
      toast.success('Gerando sua estratégia', { description: 'Leva cerca de 2 minutos.' })
    } catch (e) { toast.danger('Não deu para gerar', { description: (e as Error).message }) }
  }
  const coletarDeNovo = async (c: Conta) => {
    await api.baixar([c], { modo: 'todos', somente_reels: false, analisar_ao_fim: true })
    recarregarTarefas()
    toast.success('Atualizando seu perfil', { description: 'Coleta e nova análise em andamento.' })
  }

  const contexto = useMemo(() => ({
    videos: new Map(videos.map((v) => [v.id, v])), abrirVideo: setAberto, alvo: 'perfil' as const, refRelatorio: ref, votos,
    aoVotar: (k: string, v: number) => setVotos((s) => ({ ...s, [k]: v })),
  }), [videos, ref, votos])

  if (brief === null) return <Skeleton className="h-96 rounded-3xl" />

  if (mostrarAssistente) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="titulo-display text-4xl font-semibold">Vamos montar seu perfil</h1>
          <p className="mt-1 text-muted">Seis etapas rápidas. Com isso a IA para de dar conselho genérico e passa a falar do seu caso.</p>
        </div>
        <Assistente contas={contas} setContas={setContas} downloads={tarefasDownload} tarefasIA={tarefasIA}
          relatoriosProprios={relatoriosProprios} etapaInicial={etapaInicial} aoColetar={recarregarTarefas}
          aoConcluir={(gerar) => { carregarBrief(); setModo('painel'); if (gerar) gerarEstrategia() }} />
      </div>
    )
  }

  const editar = (etapa: number) => { setEtapaInicial(etapa); setModo('assistente') }

  return (
    <ContextoIA.Provider value={contexto}>
      <div className="space-y-6">
        {/* faixa do seu perfil */}
        <section className="aura overflow-hidden rounded-[1.75rem] text-white" style={aura(principal ? principal.conta : brief.nome || 'eu')}>
          <div className="flex flex-wrap items-end gap-5 px-7 pt-10 pb-7 sm:px-10">
            {principal && <div className="rounded-full ring-4 ring-white/20"><AvatarConta conta={principal} tamanho="lg" /></div>}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/70">Meu perfil</p>
              <h1 className="titulo-display truncate text-4xl font-semibold">{brief.nome || principal?.perfil?.nome || principal?.nome || 'Seu perfil'}</h1>
              {brief.posicionamento_desejado && <p className="mt-1 line-clamp-2 max-w-2xl text-white/80">{brief.posicionamento_desejado}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-white/15 text-white backdrop-blur-md" onPress={() => editar(1)}><Pencil /> Editar brief</Button>
              {principal && <Button size="sm" className="bg-white/15 text-white backdrop-blur-md" onPress={() => coletarDeNovo(principal)}><ArrowDownToLine /> Atualizar dados</Button>}
            </div>
          </div>
          {principal && (
            <div className="num grid grid-cols-3 border-t border-white/15 bg-black/15 text-sm backdrop-blur-sm">
              {[['Seguidores', fmtNum(principal.perfil?.seguidores)], ['Posts catalogados', fmtNum(principal.videos)],
                ['Nota da análise', relatorios[`${principal.plataforma}/${principal.conta}`]
                  ? (() => { const n = relatorios[`${principal.plataforma}/${principal.conta}`].notas; return ((n.consistencia + n.ganchos + n.clareza_da_mensagem + n.producao + n.engajamento) / 5).toFixed(1) })()
                  : '—']].map(([k, v]) => (
                <div key={k} className="border-r border-white/15 px-7 py-4 last:border-r-0 sm:px-10">
                  <p className="text-xs text-white/60">{k}</p><p className="mt-0.5 text-lg font-semibold">{v}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* seus perfis e o andamento */}
        {proprias.map((c) => (
          <section key={`${c.plataforma}/${c.conta}`} className="cartao p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <AvatarConta conta={c} tamanho="sm" />
              <p className="flex-1 font-medium">@{c.conta} <span className="text-sm font-normal text-muted">· {c.plataforma === 'tiktok' ? 'TikTok' : 'Instagram'}</span></p>
            </div>
            <Pipeline conta={c} downloads={tarefasDownload} tarefasIA={tarefasIA} temRelatorio={relatoriosProprios.has(`${c.plataforma}/${c.conta}`)} />
          </section>
        ))}

        {/* brief resumido */}
        <section className="cartao p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="titulo-display text-lg font-semibold">Seu brief</h2>
            <Button size="sm" variant="ghost" onPress={() => editar(1)}><Pencil /> Editar</Button>
          </div>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
            {([['Vende', 'produto'], ['Para quem', 'publico'], ['Objetivo', 'objetivos'], ['Metas', 'metas'], ['Tom', 'tom'], ['Frequência', 'frequencia_possivel']] as const)
              .map(([rotulo, k]) => (
                <div key={k}>
                  <p className="text-xs text-muted">{rotulo}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm leading-relaxed">{brief[k] || <span className="text-muted">—</span>}</p>
                </div>
              ))}
          </div>
        </section>

        {/* estratégia */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="titulo-display text-2xl font-semibold">Diagnóstico e estratégia</h2>
              <p className="text-sm text-muted">Você contra os {est?.concorrentes ?? '…'} concorrentes que acompanha, a partir do seu brief.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {est && est.versoes.length > 1 && (
                <Select className="w-48" value={est.estrategia?.versao ?? null} onChange={(v) => setVersao(String(v))} aria-label="Versão">
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {est.versoes.map((v) => (
                        <ListBox.Item key={v} id={v} textValue={fmtVersao(v)}><Label>{fmtVersao(v)}</Label><ListBox.ItemIndicator /></ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              )}
              <Button className={est?.estrategia ? '' : 'botao-sinal'} variant={est?.estrategia ? 'tertiary' : undefined}
                isDisabled={!!tarefaEst || !est?.concorrentes} onPress={gerarEstrategia}>
                {est?.estrategia ? <><ArrowsRotateRight /> Atualizar estratégia</> : <><Sparkles /> Gerar estratégia</>}
              </Button>
            </div>
          </div>

          {tarefaEst && (
            <div className="aura overflow-hidden rounded-[1.5rem] p-6 text-white" style={auraMarca}>
              <p className="flex items-center gap-2 font-medium"><Sparkles className="pulsando size-4" />
                {tarefaEst.status === 'na fila' ? 'Na fila…' : tarefaEst.etapa}</p>
              <p className="mt-1 text-sm text-white/70">A IA está cruzando o seu perfil, o seu brief e os concorrentes.</p>
            </div>
          )}

          {est === null ? <Skeleton className="h-48 rounded-3xl" /> : est.estrategia ? (
            <EstrategiaView r={est.estrategia} />
          ) : !tarefaEst && (
            <div className="cartao px-6 py-14 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl botao-sinal"><Sparkles className="size-6" /></span>
              <h3 className="titulo-display mt-4 text-xl font-semibold">Sua estratégia ainda não foi gerada</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Ela cruza o seu perfil, o seu brief e os concorrentes já analisados. Quanto mais completo o brief, mais específica ela fica.
              </p>
            </div>
          )}
        </section>
      </div>
      <ModalVideo video={aberto} onFechar={() => setAberto(null)} />
    </ContextoIA.Provider>
  )
}
