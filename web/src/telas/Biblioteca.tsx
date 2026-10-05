import { Button, Label, ListBox, Modal, SearchField, Select, Skeleton, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { ArrowDownToLine, ArrowUpRightFromSquare, Comment, Eye, FolderOpen, Heart, Play, Sparkles } from '@gravity-ui/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, baixarArquivo, ia, urlEmbed, urlThumb, type AnaliseVideo, type Conta, type Plataforma, type Video } from '../api'
import { useNuvem } from '../ambiente'
import { NOME_PLATAFORMA, SeloPlataforma } from '../components/Plataforma'
import { fmtData, fmtDuracao, fmtInteiro, fmtNum } from '../formato'

type Ordem = 'recentes' | 'vistos' | 'curtidos' | 'engajamento' | 'antigos'
const ORDENS: { id: Ordem; nome: string }[] = [
  { id: 'recentes', nome: 'Mais recentes' },
  { id: 'vistos', nome: 'Mais vistos' },
  { id: 'curtidos', nome: 'Mais curtidos' },
  { id: 'engajamento', nome: 'Maior engajamento' },
  { id: 'antigos', nome: 'Mais antigos' },
]
const POR_PAGINA = 48

export function TelaBiblioteca({ contas, versao }: { contas: Conta[]; versao: number }) {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [busca, setBusca] = useState('')
  const [plataforma, setPlataforma] = useState<'todas' | Plataforma>('todas')
  const [conta, setConta] = useState<string>('todas')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [aberto, setAberto] = useState<Video | null>(null)
  const sentinela = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.biblioteca().then(setVideos).catch(() => setVideos([]))
  }, [versao])

  const nomes = useMemo(() => Object.fromEntries(contas.map((c) => [`${c.plataforma}/${c.conta}`, c.perfil?.nome || c.nome])), [contas])
  const contasComVideo = useMemo(() => {
    const s = new Map<string, Video>()
    videos?.forEach((v) => s.set(`${v.plataforma}/${v.conta}`, v))
    return [...s.keys()].sort()
  }, [videos])

  const filtrados = useMemo(() => {
    if (!videos) return []
    const q = busca.trim().toLowerCase()
    const lista = videos.filter(
      (v) =>
        (plataforma === 'todas' || v.plataforma === plataforma) &&
        (conta === 'todas' || `${v.plataforma}/${v.conta}` === conta) &&
        (!q || v.legenda.toLowerCase().includes(q) || v.conta.toLowerCase().includes(q)),
    )
    const por = (f: (v: Video) => number) => (a: Video, b: Video) => f(b) - f(a)
    const ord = {
      recentes: (a: Video, b: Video) => b.data.localeCompare(a.data),
      antigos: (a: Video, b: Video) => a.data.localeCompare(b.data),
      vistos: por((v) => v.views ?? -1),
      curtidos: por((v) => v.likes ?? -1),
      engajamento: por((v) => v.engajamento ?? -1),
    }[ordem]
    return [...lista].sort(ord)
  }, [videos, busca, plataforma, conta, ordem])

  useEffect(() => setLimite(POR_PAGINA), [busca, plataforma, conta, ordem])

  // rolagem infinita
  useEffect(() => {
    const el = sentinela.current
    if (!el) return
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && setLimite((l) => l + POR_PAGINA), { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtrados.length])

  const totalViews = filtrados.reduce((s, v) => s + (v.views ?? 0), 0)
  const mediaEng = (() => {
    const c = filtrados.filter((v) => v.engajamento != null)
    return c.length ? c.reduce((s, v) => s + (v.engajamento ?? 0), 0) / c.length : null
  })()

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="titulo-display text-4xl font-semibold">Biblioteca</h1>
          <p className="mt-1 text-muted">Tudo o que você já baixou, pronto para estudar.</p>
        </div>
        <div className="flex gap-6">
          <Resumo rotulo="Vídeos" valor={fmtInteiro(filtrados.length)} />
          <Resumo rotulo="Views somadas" valor={fmtNum(totalViews)} />
          <Resumo rotulo="Engajamento médio" valor={mediaEng == null ? '—' : `${mediaEng.toFixed(1)}%`} />
        </div>
      </div>

      <div className="vidro sticky top-16 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-2xl px-2 py-2">
        <SearchField value={busca} onChange={setBusca} aria-label="Buscar na legenda" className="min-w-56 flex-1">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Buscar na legenda ou @conta" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[plataforma]}
          onSelectionChange={(k) => {
            setPlataforma([...k][0] as 'todas' | Plataforma)
            setConta('todas')
          }}
          aria-label="Plataforma"
        >
          <ToggleButton id="todas">Todas</ToggleButton>
          <ToggleButton id="tiktok">
            <ToggleButtonGroup.Separator />
            TikTok
          </ToggleButton>
          <ToggleButton id="instagram">
            <ToggleButtonGroup.Separator />
            Instagram
          </ToggleButton>
        </ToggleButtonGroup>
        <Select className="w-52" value={conta} onChange={(v) => setConta(String(v))} aria-label="Conta">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="todas" textValue="Todas as contas">
                <Label>Todas as contas</Label>
              </ListBox.Item>
              {contasComVideo
                .filter((k) => plataforma === 'todas' || k.startsWith(plataforma))
                .map((k) => (
                  <ListBox.Item key={k} id={k} textValue={nomes[k] ?? k}>
                    <Label>{nomes[k] ?? k.split('/')[1]}</Label>
                    <span className="text-xs text-muted">{NOME_PLATAFORMA[k.split('/')[0] as Plataforma]}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select className="w-48" value={ordem} onChange={(v) => setOrdem(v as Ordem)} aria-label="Ordenar">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ORDENS.map((o) => (
                <ListBox.Item key={o.id} id={o.id} textValue={o.nome}>
                  <Label>{o.nome}</Label>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {videos === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="cartao py-20 text-center text-muted">
          {videos.length ? 'Nada encontrado com esses filtros.' : 'Nenhum vídeo baixado ainda.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {filtrados.slice(0, limite).map((v) => (
            <CartaoVideo key={`${v.plataforma}/${v.id}`} v={v} nome={nomes[`${v.plataforma}/${v.conta}`]} onAbrir={() => setAberto(v)} />
          ))}
        </div>
      )}
      <div ref={sentinela} />

      <ModalVideo video={aberto} nome={aberto ? nomes[`${aberto.plataforma}/${aberto.conta}`] : undefined} onFechar={() => setAberto(null)} />
    </div>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="text-right">
      <p className="num titulo-display text-2xl font-semibold">{valor}</p>
      <p className="text-xs text-muted">{rotulo}</p>
    </div>
  )
}

function CartaoVideo({ v, nome, onAbrir }: { v: Video; nome?: string; onAbrir: () => void }) {
  return (
    <button onClick={onAbrir} className="group text-left outline-none">
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-surface-secondary ring-accent transition-shadow group-focus-visible:ring-2">
        <img
          src={urlThumb(v)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="grid size-12 place-items-center rounded-full bg-white/25 text-white backdrop-blur-md">
            <Play className="size-5" />
          </span>
        </div>
        <div className="num absolute inset-x-0 bottom-0 flex items-center justify-between p-2.5 text-xs font-medium text-white">
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" />
            {fmtNum(v.views)}
          </span>
          {v.duracao != null && <span>{fmtDuracao(v.duracao)}</span>}
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium">{nome ?? `@${v.conta}`}</p>
        <p className="num truncate text-xs text-muted">
          {fmtData(v.data)}
          {v.engajamento != null && ` · ${v.engajamento.toFixed(1)}% eng.`}
        </p>
      </div>
    </button>
  )
}

export function ModalVideo({ video, nome, onFechar }: { video: Video | null; nome?: string; onFechar: () => void }) {
  const nuvem = useNuvem()
  return (
    <Modal.Backdrop isOpen={!!video} onOpenChange={(v) => !v && onFechar()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="w-full max-w-[880px] overflow-hidden p-0 sm:max-w-[880px]">
          <Modal.CloseTrigger className="z-10" />
          {video && (
            <div className="grid md:grid-cols-[minmax(0,400px)_1fr]">
              <div className="bg-black">
                {video.url_video ? (
                  <video key={video.id} src={video.url_video} controls autoPlay className="mx-auto max-h-[78vh] w-full" />
                ) : (
                  <iframe key={video.id} src={urlEmbed(video)} title="Vídeo" allow="autoplay; encrypted-media; fullscreen"
                    className="mx-auto aspect-[9/16] max-h-[78vh] w-full border-0" />
                )}
              </div>
              <div className="flex max-h-[78vh] flex-col gap-5 overflow-y-auto p-6">
                <div className="space-y-1">
                  <SeloPlataforma plataforma={video.plataforma} />
                  <h3 className="titulo-display text-xl font-semibold">{nome ?? `@${video.conta}`}</h3>
                  <p className="text-sm text-muted">
                    @{video.conta} · {fmtData(video.data)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Estat icone={<Eye />} rotulo="Views" valor={fmtInteiro(video.views)} />
                  <Estat icone={<Heart />} rotulo="Curtidas" valor={fmtInteiro(video.likes)} />
                  <Estat icone={<Comment />} rotulo="Comentários" valor={fmtInteiro(video.comentarios)} />
                </div>
                {video.engajamento != null && (
                  <p className="text-sm text-muted">
                    Engajamento de <span className="font-medium text-foreground">{video.engajamento.toFixed(2)}%</span>{' '}
                    (curtidas + comentários ÷ views).
                  </p>
                )}
                <AnaliseIA video={video} />
                <div className="flex-1">
                  <p className="mb-1 text-xs tracking-wide text-muted uppercase">Legenda</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{video.legenda || 'Sem legenda.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {video.url && (
                    <Button size="sm" variant="tertiary" onPress={() => window.open(video.url, '_blank')}>
                      <ArrowUpRightFromSquare />
                      Abrir no {NOME_PLATAFORMA[video.plataforma]}
                    </Button>
                  )}
                  <Button size="sm" variant="tertiary" onPress={() => baixarArquivo(video)}>
                    <ArrowDownToLine />
                    Baixar
                  </Button>
                  {!nuvem && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() => api.abrirPasta({ plataforma: video.plataforma, conta: video.conta, arquivo: video.arquivo })}
                    >
                      <FolderOpen />
                      Mostrar na pasta
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

const NOME_FORMATO: Record<string, string> = {
  talking_head: 'Pessoa falando para a câmera', tutorial_tela: 'Tutorial de tela', demonstracao_produto: 'Demonstração do produto',
  depoimento: 'Depoimento', esquete_humor: 'Esquete de humor', trend_meme: 'Trend/meme', bastidores: 'Bastidores',
  storytelling: 'Storytelling', lista_dicas: 'Lista de dicas', entrevista_podcast: 'Entrevista/podcast',
  anuncio_produzido: 'Anúncio produzido', ugc_influenciador: 'UGC/influenciador', slides_texto: 'Slides de texto', outro: 'Outro',
}

/** Análise do vídeo pela IA (gancho, formato, transcrição…), gerada sob demanda e guardada em cache. */
function AnaliseIA({ video }: { video: Video }) {
  const [a, setA] = useState<AnaliseVideo | null | undefined>(undefined)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setA(undefined)
    setErro('')
    ia.video(video.plataforma, video.id).then(setA).catch(() => setA(null))
  }, [video.plataforma, video.id])

  const analisar = async () => {
    setCarregando(true)
    setErro('')
    try {
      setA(await ia.analisarVideo(video.plataforma, video.id))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  if (a === undefined) return null
  if (!a)
    return (
      <div className="rounded-2xl bg-surface-secondary p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-accent" /> Análise com IA</p>
        <p className="mt-1 text-sm text-muted">Transcreve a fala, lê os quadros e explica gancho, formato, mensagem e por que performou assim.</p>
        <Button size="sm" className="mt-3" isPending={carregando} onPress={analisar}>
          {carregando ? 'Analisando (~15s)…' : 'Analisar este vídeo'}
        </Button>
        {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}
      </div>
    )

  return (
    <div className="space-y-3 rounded-2xl bg-surface-secondary p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase"><Sparkles className="size-3.5" /> Análise com IA</p>
      <p className="text-sm leading-relaxed">{a.resumo}</p>
      <dl className="grid gap-2 text-sm">
        <Campo r="Gancho" v={<><span className="italic">“{a.gancho.frase_ou_texto}”</span> <span className="text-muted">— {a.gancho.descricao}</span></>} />
        <Campo r="Formato" v={`${NOME_FORMATO[a.formato] ?? a.formato} · pilar “${a.pilar}”`} />
        <Campo r="Mensagem" v={a.mensagem_central} />
        <Campo r="Promessa" v={a.promessa} />
        <Campo r="CTA" v={a.cta} />
        <Campo r="Por que performou assim" v={a.hipotese_desempenho} />
      </dl>
      {a.transcricao && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Transcrição</summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap text-muted">{a.transcricao}</p>
        </details>
      )}
    </div>
  )
}

function Campo({ r, v }: { r: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{r}</dt>
      <dd className="leading-relaxed">{v}</dd>
    </div>
  )
}

function Estat({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-surface-secondary p-3">
      <div className="flex items-center gap-1 text-xs text-muted [&_svg]:size-3.5">
        {icone}
        {rotulo}
      </div>
      <p className="num mt-1 font-semibold">{valor}</p>
    </div>
  )
}
