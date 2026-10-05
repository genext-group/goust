import { Button, Label, ListBox, ProgressBar, Select, Skeleton, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowsRotateRight, CircleExclamation, Comments, Sparkles } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api, ia, type Conta, type Plataforma, type RegistroPanorama, type RegistroRelatorio, type ResumoRelatorio,
  type StatusIA, type TarefaIA, type Video,
} from '../api'
import { AvatarConta } from '../components/Avatar'
import { Chat } from '../components/ia/Chat'
import { ContextoIA } from '../components/ia/Compartilhado'
import { MarcaAprendizados } from '../components/ia/MarcaAprendizados'
import { PanoramaMercado } from '../components/ia/PanoramaMercado'
import { RelatorioPerfil } from '../components/ia/RelatorioPerfil'
import { SeloPlataforma } from '../components/Plataforma'
import { fmtRelativo } from '../formato'
import { ModalVideo } from './Biblioteca'
import { useNuvem } from '../ambiente'

type Visao = 'perfis' | 'mercado' | 'marca'
const chave = (c: Pick<Conta, 'plataforma' | 'conta'>) => `${c.plataforma}/${c.conta}`
const fmtVersao = (v: string) => `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(9, 11)}:${v.slice(11, 13)}`
const notaMedia = (n: ResumoRelatorio['notas']) =>
  (n.consistencia + n.ganchos + n.clareza_da_mensagem + n.producao + n.engajamento) / 5

export function TelaInteligencia({ contas, versaoBiblioteca }: { contas: Conta[]; versaoBiblioteca: number }) {
  const nuvem = useNuvem()
  const [visao, setVisao] = useState<Visao>('perfis')
  const [status, setStatus] = useState<StatusIA | null>(null)
  const [resumos, setResumos] = useState<Record<string, ResumoRelatorio>>({})
  const [tarefas, setTarefas] = useState<TarefaIA[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState<{ relatorio: RegistroRelatorio | null; versoes: string[] } | null>(null)
  const [versao, setVersao] = useState<string | undefined>()
  const [panorama, setPanorama] = useState<{ panorama: RegistroPanorama | null; versoes: string[] } | null>(null)
  const [versaoMercado, setVersaoMercado] = useState<string | undefined>()
  const [votos, setVotos] = useState<Record<string, number>>({})
  const [videoAberto, setVideoAberto] = useState<Video | null>(null)
  const [chatAberto, setChatAberto] = useState(false)

  const carregarStatus = useCallback(() => ia.status().then(setStatus).catch(() => {}), [])
  const carregarResumos = useCallback(() => ia.relatorios().then(setResumos).catch(() => {}), [])

  useEffect(() => { carregarStatus(); carregarResumos() }, [carregarStatus, carregarResumos])
  useEffect(() => { api.biblioteca().then(setVideos).catch(() => {}) }, [versaoBiblioteca])

  // contas com vídeos primeiro; as analisadas antes das que ainda não foram
  const qtdPorConta = useMemo(() => {
    const m = new Map<string, number>()
    videos.forEach((v) => m.set(`${v.plataforma}/${v.conta}`, (m.get(`${v.plataforma}/${v.conta}`) ?? 0) + 1))
    return m
  }, [videos])
  const ordenadas = useMemo(() => [...contas].sort((a, b) =>
    Number(!!resumos[chave(b)]) - Number(!!resumos[chave(a)]) || (qtdPorConta.get(chave(b)) ?? 0) - (qtdPorConta.get(chave(a)) ?? 0)),
  [contas, resumos, qtdPorConta])
  useEffect(() => { if (!selecionada && ordenadas.length) setSelecionada(chave(ordenadas[0])) }, [ordenadas, selecionada])

  const conta = contas.find((c) => chave(c) === selecionada)

  const carregarRelatorio = useCallback(() => {
    if (!conta) return
    ia.relatorio(conta.plataforma, conta.conta, versao).then(setRelatorio)
  }, [conta, versao])
  useEffect(() => { setRelatorio(null); carregarRelatorio() }, [carregarRelatorio])
  const carregarPanorama = useCallback(() => { ia.mercado(versaoMercado).then(setPanorama) }, [versaoMercado])
  useEffect(() => { if (visao === 'mercado') carregarPanorama() }, [visao, carregarPanorama])

  const ref = visao === 'mercado'
    ? `mercado/${panorama?.panorama?.versao ?? ''}`
    : `perfil/${selecionada}/${relatorio?.relatorio?.versao ?? ''}`
  useEffect(() => { ia.votos(ref).then(setVotos).catch(() => setVotos({})) }, [ref])

  // acompanha as análises em andamento
  const ativas = tarefas.filter((t) => t.status === 'na fila' || t.status === 'rodando')
  useEffect(() => {
    let antes = new Set<number>()
    const tick = async () => {
      const ts = await ia.tarefas().catch(() => [] as TarefaIA[])
      setTarefas(ts)
      const terminadas = ts.filter((t) => antes.has(t.id) && (t.status === 'concluído' || t.status === 'erro'))
      terminadas.forEach((t) => {
        if (t.status === 'erro') toast.danger('A análise falhou', { description: t.erro ?? '' })
        else toast.success(t.tipo === 'mercado' ? 'Panorama do mercado pronto' : `Análise de @${t.conta} pronta`)
      })
      if (terminadas.length) { carregarResumos(); carregarStatus(); carregarRelatorio(); carregarPanorama() }
      antes = new Set(ts.filter((t) => t.status === 'na fila' || t.status === 'rodando').map((t) => t.id))
    }
    tick()
    const id = setInterval(() => { if (!document.hidden) tick() }, nuvem ? 4000 : 2000)
    return () => clearInterval(id)
  }, [carregarResumos, carregarStatus, carregarRelatorio, carregarPanorama, nuvem])

  const tarefaDe = (c?: Conta) => c && ativas.find((t) => t.tipo === 'perfil' && t.plataforma === c.plataforma && t.conta === c.conta)
  const tarefaMercado = ativas.find((t) => t.tipo === 'mercado')

  const analisar = async (c: Conta) => {
    try {
      await ia.analisar({ tipo: 'perfil', plataforma: c.plataforma, conta: c.conta })
      setVersao(undefined)
      setTarefas(await ia.tarefas())
    } catch (e) { toast.danger('Não deu para analisar', { description: (e as Error).message }) }
  }
  const gerarPanorama = async () => {
    try {
      await ia.analisar({ tipo: 'mercado' })
      setVersaoMercado(undefined)
      setTarefas(await ia.tarefas())
    } catch (e) { toast.danger('Não deu para gerar o panorama', { description: (e as Error).message }) }
  }

  const contexto = useMemo(() => ({
    videos: new Map(videos.map((v) => [v.id, v])),
    abrirVideo: setVideoAberto,
    alvo: (visao === 'mercado' ? 'mercado' : 'perfil') as 'perfil' | 'mercado',
    refRelatorio: ref,
    votos,
    aoVotar: (k: string, v: number) => { setVotos((s) => ({ ...s, [k]: v })); carregarStatus() },
  }), [videos, visao, ref, votos, carregarStatus])

  const escopoChat = visao === 'perfis' && conta
    ? { tipo: 'perfil' as const, plataforma: conta.plataforma as Plataforma, conta: conta.conta }
    : { tipo: 'mercado' as const }
  const analisados = Object.keys(resumos).length

  return (
    <ContextoIA.Provider value={contexto}>
      <div className="space-y-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div>
            <h1 className="titulo-display text-4xl font-semibold">Inteligência</h1>
            <p className="mt-1 text-muted">Como cada concorrente se posiciona, o que funciona para ele e onde você pode ganhar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleButtonGroup selectionMode="single" disallowEmptySelection selectedKeys={[visao]}
              onSelectionChange={(k) => setVisao([...k][0] as Visao)} aria-label="Visão">
              <ToggleButton id="perfis">Perfis</ToggleButton>
              <ToggleButton id="mercado"><ToggleButtonGroup.Separator />Mercado</ToggleButton>
              <ToggleButton id="marca"><ToggleButtonGroup.Separator />Aprendizados</ToggleButton>
            </ToggleButtonGroup>
            {visao !== 'marca' && (
              <Button onPress={() => setChatAberto(true)}><Comments /> Pergunte à IA</Button>
            )}
          </div>
        </div>

        {status && !status.configurada && (
          <div className="cartao flex items-start gap-3 p-4 text-sm">
            <CircleExclamation className="mt-0.5 size-4 text-danger" />
            <p>A IA não está configurada. Coloque <code>OPENAI_API_KEY=...</code> no arquivo <code>.env</code> e reinicie o app.</p>
          </div>
        )}

        {visao === 'perfis' && (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-1 lg:sticky lg:top-20 lg:self-start">
              {ordenadas.map((c) => {
                const r = resumos[chave(c)]
                const t = tarefaDe(c)
                const qtd = qtdPorConta.get(chave(c)) ?? 0
                const ativa = chave(c) === selecionada
                return (
                  <button key={chave(c)} onClick={() => { setSelecionada(chave(c)); setVersao(undefined) }}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${ativa ? 'bg-surface shadow-sm' : 'hover:bg-surface/60'}`}>
                    <AvatarConta conta={c} tamanho="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.perfil?.nome || c.nome}</p>
                      <p className="truncate text-xs text-muted">
                        {t ? <span className="text-accent">{t.status === 'rodando' ? 'analisando…' : 'na fila'}</span> : r ? `analisado ${fmtRelativo(r.gerado)}` : qtd ? `${qtd} vídeos · não analisado` : 'sem vídeos baixados'}
                      </p>
                    </div>
                    {r && <span className="num text-sm font-semibold">{notaMedia(r.notas).toFixed(1)}</span>}
                  </button>
                )
              })}
            </aside>

            <div className="min-w-0 space-y-4">
              {conta && (
                <div className="flex flex-wrap items-center gap-3">
                  <AvatarConta conta={conta} tamanho="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="titulo-display truncate text-2xl font-semibold">{conta.perfil?.nome || conta.nome}</h2>
                    <div className="flex items-center gap-2 text-sm text-muted"><SeloPlataforma plataforma={conta.plataforma} /> @{conta.conta}</div>
                  </div>
                  {relatorio && relatorio.versoes.length > 1 && (
                    <Select className="w-48" value={relatorio.relatorio?.versao ?? null} onChange={(v) => setVersao(String(v))} aria-label="Versão">
                      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {relatorio.versoes.map((v, i) => (
                            <ListBox.Item key={v} id={v} textValue={fmtVersao(v)}>
                              <Label>{fmtVersao(v)}{i === 0 ? ' · atual' : ''}</Label><ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                  {relatorio?.relatorio && (
                    <Button variant="tertiary" isDisabled={!!tarefaDe(conta)} onPress={() => analisar(conta)}>
                      <ArrowsRotateRight /> Reanalisar
                    </Button>
                  )}
                </div>
              )}

              {conta && tarefaDe(conta) && <Progresso t={tarefaDe(conta)!} />}

              {!conta ? null : relatorio === null ? (
                <div className="space-y-4"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>
              ) : relatorio.relatorio ? (
                <RelatorioPerfil r={relatorio.relatorio} />
              ) : !tarefaDe(conta) && (
                <Vazio
                  titulo="Este perfil ainda não foi analisado"
                  texto={(qtdPorConta.get(chave(conta)) ?? 0)
                    ? `A IA vai assistir até 40 vídeos (os mais recentes e os de maior alcance): transcreve a fala, lê os quadros e a legenda, cruza com as métricas e escreve um relatório estratégico. Leva uns 3 minutos.`
                    : 'Baixe alguns vídeos desta conta primeiro (aba Contas).'}
                  acao={(qtdPorConta.get(chave(conta)) ?? 0) ? <Button onPress={() => analisar(conta)}><Sparkles /> Analisar com IA</Button> : null}
                />
              )}
            </div>
          </div>
        )}

        {visao === 'mercado' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {panorama && panorama.versoes.length > 1 && (
                <Select className="w-48" value={panorama.panorama?.versao ?? null} onChange={(v) => setVersaoMercado(String(v))} aria-label="Versão">
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {panorama.versoes.map((v) => (
                        <ListBox.Item key={v} id={v} textValue={fmtVersao(v)}><Label>{fmtVersao(v)}</Label><ListBox.ItemIndicator /></ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              )}
              {panorama?.panorama && (
                <Button variant="tertiary" isDisabled={!!tarefaMercado || analisados < 2} onPress={gerarPanorama}>
                  <ArrowsRotateRight /> Atualizar panorama
                </Button>
              )}
            </div>
            {tarefaMercado && <Progresso t={tarefaMercado} />}
            {panorama === null ? (
              <Skeleton className="h-64 rounded-3xl" />
            ) : panorama.panorama ? (
              <PanoramaMercado r={panorama.panorama} contas={contas} />
            ) : !tarefaMercado && (
              <Vazio
                titulo="Panorama do mercado"
                texto={analisados >= 2
                  ? `Compara os ${analisados} perfis analisados: quem é quem, narrativas saturadas, espaços em branco e o que você deveria fazer.`
                  : `Analise pelo menos 2 perfis na visão "Perfis" para comparar o mercado (hoje: ${analisados}).`}
                acao={analisados >= 2 ? <Button onPress={gerarPanorama}><Sparkles /> Gerar panorama</Button> : null}
              />
            )}
          </div>
        )}

        {visao === 'marca' && <MarcaAprendizados status={status} aoMudar={carregarStatus} semMarca />}
      </div>

      <ModalVideo video={videoAberto} onFechar={() => setVideoAberto(null)} />
      <Chat escopo={escopoChat} isOpen={chatAberto} onOpenChange={setChatAberto}
        titulo={escopoChat.tipo === 'perfil' ? `Sobre @${conta?.conta}` : 'Sobre o mercado inteiro'} />
    </ContextoIA.Provider>
  )
}

function Progresso({ t }: { t: TarefaIA }) {
  const pct = t.total ? Math.round((t.feito / t.total) * 100) : 0
  return (
    <div className="cartao space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 animate-pulse text-accent" />
        <p className="flex-1 text-sm font-medium">{t.status === 'na fila' ? 'Na fila…' : t.etapa}</p>
        {t.total > 1 && <span className="num text-sm text-muted">{t.feito}/{t.total}</span>}
      </div>
      <ProgressBar aria-label="Progresso da análise" size="sm" value={pct} isIndeterminate={t.status === 'na fila' || t.total <= 1}>
        <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
      </ProgressBar>
    </div>
  )
}

function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao: React.ReactNode }) {
  return (
    <div className="cartao flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles className="size-6" /></span>
      <h3 className="titulo-display mt-4 text-xl font-semibold">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{texto}</p>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}
