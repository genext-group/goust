import { Button, Input, Label, ListBox, ProgressBar, Select, Skeleton, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowDownToLine, ArrowsRotateRight, Person, Plus, Sparkles } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ia, type Conta, type Plataforma, type RegistroEstrategia, type TarefaIA, type Video } from '../api'
import { AvatarConta } from '../components/Avatar'
import { ContextoIA } from '../components/ia/Compartilhado'
import { BriefGuiado } from '../components/meuperfil/Brief'
import { EstrategiaView } from '../components/meuperfil/EstrategiaView'
import { fmtNum, fmtRelativo } from '../formato'
import { ModalVideo } from './Biblioteca'

const fmtVersao = (v: string) => `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)} ${v.slice(9, 11)}:${v.slice(11, 13)}`

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  aoBaixar: () => void
  versaoBiblioteca: number
}

export function TelaMeuPerfil({ contas, setContas, aoBaixar, versaoBiblioteca }: Props) {
  const proprias = contas.filter((c) => c.papel === 'proprio')
  const [novo, setNovo] = useState('')
  const [plat, setPlat] = useState<Plataforma>('instagram')
  const [est, setEst] = useState<{ estrategia: RegistroEstrategia | null; versoes: string[]; proprias: number; concorrentes: number } | null>(null)
  const [versao, setVersao] = useState<string | undefined>()
  const [tarefas, setTarefas] = useState<TarefaIA[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [votos, setVotos] = useState<Record<string, number>>({})
  const [aberto, setAberto] = useState<Video | null>(null)

  const carregarEst = useCallback(() => ia.estrategia(versao).then(setEst).catch(() => {}), [versao])
  useEffect(() => { carregarEst() }, [carregarEst])
  useEffect(() => { api.biblioteca().then(setVideos).catch(() => {}) }, [versaoBiblioteca])
  const ref = `estrategia/${est?.estrategia?.versao ?? ''}`
  useEffect(() => { ia.votos(ref).then(setVotos).catch(() => setVotos({})) }, [ref])

  // acompanha as análises (do seu perfil e da estratégia)
  useEffect(() => {
    let antes = new Set<number>()
    const tick = async () => {
      const ts = await ia.tarefas().catch(() => [] as TarefaIA[])
      setTarefas(ts)
      const fim = ts.filter((t) => antes.has(t.id) && (t.status === 'concluído' || t.status === 'erro'))
      fim.forEach((t) => t.status === 'erro'
        ? toast.danger('A análise falhou', { description: t.erro ?? '' })
        : toast.success(t.tipo === 'estrategia' ? 'Estratégia pronta' : `Análise de @${t.conta} pronta`))
      if (fim.length) carregarEst()
      antes = new Set(ts.filter((t) => t.status === 'na fila' || t.status === 'rodando').map((t) => t.id))
    }
    tick()
    const id = setInterval(() => { if (!document.hidden) tick() }, 4000)
    return () => clearInterval(id)
  }, [carregarEst])

  const ativa = (tipo: string, conta?: string) =>
    tarefas.find((t) => t.tipo === tipo && (!conta || t.conta === conta) && (t.status === 'na fila' || t.status === 'rodando'))
  const tarefaEst = ativa('estrategia')

  const adicionar = async () => {
    if (!novo.trim()) return
    try {
      setContas(await api.adicionarConta(novo.trim(), plat, 'proprio'))
      setNovo('')
      toast.success('Perfil adicionado', { description: 'Agora baixe os posts e rode a análise dele.' })
    } catch (e) { toast.danger('Não deu certo', { description: (e as Error).message }) }
  }
  const baixarTudo = async (c: Conta) => {
    await api.baixar([c], { modo: 'todos', somente_reels: false })
    toast.success(`Coletando @${c.conta}`, { description: 'Acompanhe em Downloads.' })
    aoBaixar()
  }
  const analisar = async (c: Conta) => {
    try {
      await ia.analisar({ tipo: 'perfil', plataforma: c.plataforma, conta: c.conta })
      setTarefas(await ia.tarefas())
    } catch (e) { toast.danger('Não deu para analisar', { description: (e as Error).message }) }
  }
  const gerarEstrategia = async () => {
    try {
      await ia.analisar({ tipo: 'estrategia' })
      setVersao(undefined)
      setTarefas(await ia.tarefas())
    } catch (e) { toast.danger('Não deu para gerar', { description: (e as Error).message }) }
  }

  const contexto = useMemo(() => ({
    videos: new Map(videos.map((v) => [v.id, v])), abrirVideo: setAberto, alvo: 'perfil' as const, refRelatorio: ref, votos,
    aoVotar: (k: string, v: number) => setVotos((s) => ({ ...s, [k]: v })),
  }), [videos, ref, votos])

  return (
    <ContextoIA.Provider value={contexto}>
      <div className="space-y-6 pb-16">
        <div className="pt-2">
          <h1 className="titulo-display text-4xl font-semibold">Meu perfil</h1>
          <p className="mt-1 text-muted">Seu perfil, seus objetivos e a estratégia para chegar lá, a partir do que funciona no seu mercado.</p>
        </div>

        {/* 1. Minhas contas */}
        <section className="cartao space-y-4 p-5 sm:p-6">
          <header className="flex items-center gap-2">
            <Person className="size-4 text-accent" />
            <h2 className="titulo-display text-lg font-semibold">Minhas contas</h2>
          </header>
          {proprias.length === 0 && (
            <p className="text-sm text-muted">Adicione o seu @ para a IA analisar o seu perfil com o mesmo motor dos concorrentes.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {proprias.map((c) => {
              const t = ativa('perfil', c.conta)
              return (
                <div key={`${c.plataforma}/${c.conta}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-secondary p-3">
                  <AvatarConta conta={c} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.perfil?.nome || c.nome}</p>
                    <p className="num truncate text-xs text-muted">
                      @{c.conta} · {fmtNum(c.perfil?.seguidores)} seguidores · {c.videos} posts · {c.ultimo ? fmtRelativo(c.ultimo) : 'sem posts'}
                    </p>
                    {t && <p className="text-xs text-accent">{t.status === 'rodando' ? t.etapa : 'Análise na fila…'}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="tertiary" onPress={() => baixarTudo(c)}><ArrowDownToLine /> Coletar</Button>
                    <Button size="sm" variant="tertiary" isDisabled={!c.videos || !!t} onPress={() => analisar(c)}><Sparkles /> Analisar</Button>
                  </div>
                </div>
              )
            })}
          </div>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); adicionar() }}>
            <Input aria-label="Seu @" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Seu @ ou link do perfil" className="min-w-52 flex-1" />
            <ToggleButtonGroup size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[plat]}
              onSelectionChange={(k) => setPlat([...k][0] as Plataforma)} aria-label="Plataforma">
              <ToggleButton id="instagram">Instagram</ToggleButton>
              <ToggleButton id="tiktok"><ToggleButtonGroup.Separator />TikTok</ToggleButton>
            </ToggleButtonGroup>
            <Button type="submit" isDisabled={!novo.trim()}><Plus /> Adicionar</Button>
          </form>
        </section>

        {/* 2. Brief */}
        <BriefGuiado />

        {/* 3. Diagnóstico e estratégia */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="titulo-display text-2xl font-semibold">Diagnóstico e estratégia</h2>
              <p className="text-sm text-muted">
                Cruza seu brief, a análise do seu perfil e a dos {est?.concorrentes ?? '…'} concorrentes que você acompanha.
              </p>
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
              <Button isDisabled={!!tarefaEst || !est?.concorrentes} onPress={gerarEstrategia}>
                {est?.estrategia ? <><ArrowsRotateRight /> Atualizar estratégia</> : <><Sparkles /> Gerar estratégia</>}
              </Button>
            </div>
          </div>

          {tarefaEst && (
            <div className="cartao space-y-3 p-5">
              <p className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 animate-pulse text-accent" />
                {tarefaEst.status === 'na fila' ? 'Na fila…' : tarefaEst.etapa}</p>
              <ProgressBar aria-label="Progresso" size="sm" isIndeterminate><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
            </div>
          )}

          {est === null ? <Skeleton className="h-48 rounded-3xl" /> : est.estrategia ? (
            <EstrategiaView r={est.estrategia} />
          ) : !tarefaEst && (
            <div className="cartao px-6 py-14 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Sparkles className="size-6" /></span>
              <h3 className="titulo-display mt-4 text-xl font-semibold">Sua estratégia ainda não foi gerada</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Para um resultado forte: preencha o brief, adicione seu perfil e analise-o, e tenha pelo menos um concorrente analisado
                (aba Inteligência). Depois clique em <strong>Gerar estratégia</strong>.
              </p>
            </div>
          )}
        </section>
      </div>
      <ModalVideo video={aberto} onFechar={() => setAberto(null)} />
    </ContextoIA.Provider>
  )
}
