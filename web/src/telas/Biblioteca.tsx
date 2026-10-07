import { Button, Label, ListBox, Modal, SearchField, Select, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { toast } from '@heroui/react'
import { ArrowDownToLine, ArrowUpRightFromSquare, Check, CircleCheck, Comment, Eye, Folder, FolderOpen, FolderPlus, Heart, HeartFill, Palette, Pencil, Play, Plus, Sparkles, TrashBin, Xmark } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, bibliotecaEstado, baixarArquivo, baixarVarios, criacao, ia, notas as apiNotas, pastas as apiPastas, urlEmbed, urlThumb, type AnaliseVideo, type Comentario, type Conta, type Estilo, type Pasta, type Plataforma, type Video } from '../api'
import { Explosao } from '../components/AnimProcessos'
import { useAtividade } from '../components/Atividade'
import { Menu } from '../components/Menu'
import { tocar } from '../sons'
import { useDialogoTexto } from '../components/ui/DialogoTexto'
import { useNuvem } from '../ambiente'
import { IconePlataforma, NOME_PLATAFORMA, SeloPlataforma } from '../components/Plataforma'
import { fmtDec, fmtData, fmtDuracao, fmtInteiro, fmtNum, fmtRelativo } from '../formato'
import { useConfirmar } from '../components/ui/Confirmar'

type Ordem = 'recentes' | 'vistos' | 'curtidos' | 'engajamento' | 'antigos'
const ORDENS: { id: Ordem; nome: string }[] = [
  { id: 'recentes', nome: 'Mais recentes' },
  { id: 'vistos', nome: 'Mais vistos' },
  { id: 'curtidos', nome: 'Mais curtidos' },
  { id: 'engajamento', nome: 'Maior engajamento' },
  { id: 'antigos', nome: 'Mais antigos' },
]
const POR_PAGINA = 48

export function TelaBiblioteca({ contas, versao, filtroConta }: { contas: Conta[]; versao: number; filtroConta?: { conta: string; n: number } | null }) {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [busca, setBusca] = useState('')
  const [plataforma, setPlataforma] = useState<'todas' | Plataforma>('todas')
  const [conta, setConta] = useState<string>(filtroConta?.conta ?? 'todas')
  useEffect(() => { if (filtroConta) { setConta(filtroConta.conta); setPastaSel(null); setPlataforma('todas'); setBusca('') } }, [filtroConta])
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [aberto, setAberto] = useState<Video | null>(null)
  const sentinela = useRef<HTMLDivElement>(null)
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [mapa, setMapa] = useState<Record<string, number[]>>({})
  const [pastaSel, setPastaSel] = useState<number | null>(null)
  const [novaPasta, setNovaPasta] = useState<string | null>(null)
  const { dialogo: dialogoTexto, pedir: pedirTexto } = useDialogoTexto()
  const { confirmacao, confirmar } = useConfirmar()
  const [selecionando, setSelecionando] = useState(false)
  const [estado, setEstado] = useState<{ verificado: number | null; ultimo_post: string | null; perfis: number } | null>(null)
  const [verificando, setVerificando] = useState(false)
  const { recarregar } = useAtividade()
  useEffect(() => { bibliotecaEstado.estado().then(setEstado).catch(() => {}) }, [versao])
  const verificar = async () => {
    setVerificando(true)
    try {
      const r = await bibliotecaEstado.verificar()
      tocar('coleta'); recarregar()
      setEstado((e) => e && { ...e, verificado: Date.now() / 1000 })
      toast.success(`Procurando posts novos em ${r.perfis} perfis`, { description: 'Eles aparecem aqui assim que chegarem.' })
    } catch (e) { toast((e as Error).message) } finally { setVerificando(false) }
  }
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState<{ feitos: number; total: number } | null>(null)
  const chaveV = (v: Video) => `${v.plataforma}/${v.id}`
  const alternarSel = (v: Video) => setSel((s) => { const n = new Set(s); if (n.has(chaveV(v))) n.delete(chaveV(v)); else n.add(chaveV(v)); return n })
  const sairSelecao = () => { setSelecionando(false); setSel(new Set()) }

  useEffect(() => {
    api.biblioteca().then(setVideos).catch(() => setVideos([]))
  }, [versao])
  const carregarPastas = useCallback(() => apiPastas.listar().then((r) => { setPastas(r.pastas); setMapa(r.mapa) }).catch(() => {}), [])
  useEffect(() => { carregarPastas() }, [carregarPastas])
  const favoritos = pastas.find((p) => p.sistema === 'favoritos')

  /** Põe ou tira o post da pasta, com resposta imediata na tela. */
  const colocar = async (v: Video, pasta: Pasta, dentro: boolean) => {
    const k = `${v.plataforma}/${v.id}`
    setMapa((m) => ({ ...m, [k]: dentro ? [...(m[k] ?? []), pasta.id] : (m[k] ?? []).filter((x) => x !== pasta.id) }))
    setPastas((ps) => ps.map((p) => (p.id === pasta.id ? { ...p, posts: p.posts + (dentro ? 1 : -1) } : p)))
    tocar(pasta.sistema ? (dentro ? 'favorito' : 'clique') : 'pasta')
    try {
      await (pasta.sistema ? apiPastas.favoritar(v, dentro) : apiPastas.colocar(pasta.id, v, dentro))
    } catch { carregarPastas() }
  }
  const criarPasta = async (nome: string, comPost?: Video) => {
    if (!nome.trim()) return
    const lista = await apiPastas.criar(nome)
    setPastas(lista)
    setNovaPasta(null)
    const nova = lista.at(-1)
    if (comPost && nova) colocar(comPost, nova, true)
  }
  const renomearPasta = async (p: Pasta) => {
    const nome = await pedirTexto({ titulo: 'Renomear pasta', rotulo: 'Nome da pasta', valor: p.nome })
    if (nome?.trim()) setPastas(await apiPastas.renomear(p.id, nome))
  }
  const apagarPasta = async (p: Pasta) => {
    if (!await confirmar({ titulo: `Apagar a pasta “${p.nome}”?`, texto: 'Os posts não são apagados, só saem dessa pasta.', confirmar: 'Apagar pasta' })) return
    setPastas(await apiPastas.apagar(p.id))
    setPastaSel(null)
    carregarPastas()
  }

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
        (pastaSel === null || (mapa[`${v.plataforma}/${v.id}`] ?? []).includes(pastaSel)) &&
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
  }, [videos, busca, plataforma, conta, ordem, pastaSel, mapa])

  useEffect(() => setLimite(POR_PAGINA), [busca, plataforma, conta, ordem, pastaSel])

  const escolhidos = useMemo(() => (videos ?? []).filter((v) => sel.has(chaveV(v))), [videos, sel])
  const todosVisiveis = filtrados.length > 0 && filtrados.every((v) => sel.has(chaveV(v)))
  const baixaveis = (l: Video[]) => l.filter((v) => (v.tipo ?? 'video') !== 'carrossel' && v.tipo !== 'foto')
  const baixarSelecionados = async (lista: Video[]) => {
    const LIMITE = 50
    const todosOk = baixaveis(lista)
    const ok = todosOk.slice(0, LIMITE)
    if (todosOk.length > LIMITE) toast.warning(`Baixando os primeiros ${LIMITE}`, { description: 'Para não travar o navegador, os downloads vão em levas de até 50 vídeos.' })
    if (!ok.length) { toast.warning('Nada para baixar', { description: 'Carrosséis e fotos abrem na plataforma; só vídeos são baixados.' }); return }
    if (ok.length < lista.length) toast(`${lista.length - ok.length} carrossel/foto ficaram de fora`, { description: 'Só vídeos são baixados.' })
    tocar('coleta')
    setBaixando({ feitos: 0, total: ok.length })
    try { await baixarVarios(ok, (f) => setBaixando({ feitos: f, total: ok.length })) } finally {
      setTimeout(() => setBaixando(null), 1500)
      toast.success(`${ok.length} ${ok.length === 1 ? 'vídeo enviado' : 'vídeos enviados'} para download`, { description: 'Se o navegador perguntar, permita vários downloads.' })
    }
  }
  const colocarVarios = async (pasta: Pasta) => {
    const fora = escolhidos.filter((v) => !(mapa[chaveV(v)] ?? []).includes(pasta.id))
    await Promise.all(fora.map((v) => colocar(v, pasta, true)))
    toast.success(`${escolhidos.length} ${escolhidos.length === 1 ? 'post' : 'posts'} em ${pasta.sistema ? 'Favoritos' : pasta.nome}`)
    sairSelecao()
  }
  const novaPastaComSelecionados = async () => {
    const n = await pedirTexto({ titulo: 'Nova pasta', rotulo: 'Nome da pasta', placeholder: 'Ex.: Ganchos bons', confirmar: `Criar com ${escolhidos.length}` })
    if (!n) return
    const lista = await apiPastas.criar(n)
    setPastas(lista)
    const nova = lista.at(-1)
    if (nova) await colocarVarios(nova)
  }

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
      {confirmacao}
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="titulo-display text-4xl font-semibold">Biblioteca</h1>
          <p className="mt-1 text-muted">Os posts dos perfis que você acompanha, prontos para estudar, guardar e baixar.</p>
          {estado && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-[var(--menta)]" />
              {estado.verificado ? `Perfis verificados ${fmtRelativo(new Date(estado.verificado * 1000).toISOString())}` : 'Verificação automática todo dia de manhã'}
              {estado.ultimo_post && <span>· post mais recente {fmtRelativo(estado.ultimo_post)}</span>}
              <button onClick={verificar} disabled={verificando} className="ml-1 font-medium text-foreground/80 hover:text-foreground disabled:opacity-50">
                {verificando ? 'Verificando…' : 'Verificar agora'}
              </button>
            </p>
          )}
        </div>
        <div className="flex gap-6">
          <Resumo rotulo="Vídeos" valor={fmtInteiro(filtrados.length)} />
          <Resumo rotulo="Views somadas" valor={fmtNum(totalViews)} />
          <Resumo rotulo="Engajamento médio" valor={mediaEng == null ? '—' : `${fmtDec(mediaEng, 1)}%`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ChipPasta ativo={pastaSel === null} onPress={() => setPastaSel(null)}>Todos os posts</ChipPasta>
        {pastas.map((p) => (
          <div key={p.id} className="flex items-center">
            <ChipPasta ativo={pastaSel === p.id} onPress={() => setPastaSel(p.id)}>
              {p.sistema ? <HeartFill className="size-3.5 text-[#ff4d6d]" /> : <Folder className="size-3.5" />}
              {p.nome} <span className="num text-xs text-muted">{p.posts}</span>
            </ChipPasta>
            {pastaSel === p.id && !p.sistema && (
              <Menu gatilho={(abrir) => (
                <button onClick={abrir} aria-label="Opções da pasta" className="ml-0.5 grid size-7 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground">⋯</button>
              )} itens={[
                { id: 'r', rotulo: 'Renomear', icone: <Pencil />, aoEscolher: () => renomearPasta(p) },
                { id: 'a', rotulo: 'Apagar pasta', icone: <TrashBin />, perigo: true, aoEscolher: () => apagarPasta(p) },
              ]} />
            )}
          </div>
        ))}
        {novaPasta === null ? (
          <button onClick={() => setNovaPasta('')} className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted linha-fina hover:text-foreground">
            <FolderPlus className="size-3.5" /> Nova pasta
          </button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); criarPasta(novaPasta) }} className="flex items-center gap-1">
            <input autoFocus value={novaPasta} onChange={(e) => setNovaPasta(e.target.value)} onBlur={() => !novaPasta.trim() && setNovaPasta(null)}
              placeholder="Nome da pasta" className="h-8 w-40 rounded-full bg-surface-secondary px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
            <Button size="sm" type="submit" isDisabled={!novaPasta.trim()}>Criar</Button>
          </form>
        )}
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
        <Button size="sm" variant={selecionando ? 'secondary' : 'ghost'} className="ml-auto" onPress={() => (selecionando ? sairSelecao() : setSelecionando(true))}>
          {selecionando ? <><Xmark /> Cancelar seleção</> : <><CircleCheck /> Selecionar</>}
        </Button>
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
            <div key={i} className="carregando aspect-[9/16] rounded-2xl" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="cartao py-20 text-center text-muted">
          {pastaSel !== null && pastas.find((p) => p.id === pastaSel)?.sistema
            ? 'Toque no coração de um post para guardá-lo aqui.'
            : pastaSel !== null ? 'Pasta vazia. Use o ícone de pasta nos posts para adicionar.'
              : videos.length ? 'Nada encontrado com esses filtros.' : 'Nenhum post ainda. Acompanhe perfis em Concorrentes e os posts aparecem aqui.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {filtrados.slice(0, limite).map((v) => (
            <CartaoVideo key={`${v.plataforma}/${v.id}`} v={v} nome={nomes[`${v.plataforma}/${v.conta}`]}
              onAbrir={() => (selecionando ? alternarSel(v) : setAberto(v))}
              selecionando={selecionando} selecionado={sel.has(chaveV(v))}
              aoSegurar={() => { if (!selecionando) { tocar('clique'); setSelecionando(true); alternarSel(v) } }}
              aoBaixar={() => baixarArquivo(v)}
              pastas={pastas} dentro={mapa[`${v.plataforma}/${v.id}`] ?? []} favoritos={favoritos}
              aoColocar={(p, d) => colocar(v, p, d)} aoNovaPasta={async () => { const n = await pedirTexto({ titulo: 'Nova pasta', rotulo: 'Nome da pasta', placeholder: 'Ex.: Ganchos bons', confirmar: 'Criar e guardar' }); if (n) criarPasta(n, v) }} />
          ))}
        </div>
      )}
      <div ref={sentinela} />

      {createPortal(
      <div className={`fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-all duration-300 ${selecionando ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}>
        <div className="vidro flex max-w-full flex-wrap items-center justify-center gap-2 rounded-3xl border p-2 pl-4 shadow-xl linha-fina sm:rounded-full">
          <span className="text-sm"><span className="num font-semibold">{sel.size}</span> {sel.size === 1 ? 'selecionado' : 'selecionados'}</span>
          <Button size="sm" variant="ghost" className="rounded-full" onPress={() => setSel(todosVisiveis ? new Set() : new Set(filtrados.map(chaveV)))}>
            {todosVisiveis ? 'Limpar' : `Todos (${filtrados.length})`}
          </Button>
          <Menu titulo="Colocar na pasta" alinhar="esquerda" gatilho={(abrir) => (
            <Button size="sm" variant="ghost" className="rounded-full" isDisabled={!sel.size} onPress={abrir}><FolderPlus /> Pasta</Button>
          )} itens={[
            ...(favoritos ? [{ id: 'fav', rotulo: 'Favoritos', icone: <HeartFill className="text-[#ff4d6d]" />, aoEscolher: () => colocarVarios(favoritos) }] : []),
            ...pastas.filter((p) => !p.sistema).map((p) => ({ id: p.id, rotulo: p.nome, icone: <Folder />, aoEscolher: () => colocarVarios(p) })),
            { id: 'nova', rotulo: 'Nova pasta…', icone: <Plus />, aoEscolher: novaPastaComSelecionados },
          ]} />
          <Button size="sm" className="botao-sinal rounded-full" isDisabled={!sel.size || !!baixando} onPress={() => baixarSelecionados(escolhidos)}>
            <ArrowDownToLine /> {baixando ? `Baixando ${baixando.feitos}/${baixando.total}` : 'Baixar'}
          </Button>
          <Button isIconOnly size="sm" variant="ghost" className="rounded-full" aria-label="Sair da seleção" onPress={sairSelecao}><Xmark /></Button>
        </div>
      </div>,
        document.body)}

      <ModalVideo video={aberto} nome={aberto ? nomes[`${aberto.plataforma}/${aberto.conta}`] : undefined} onFechar={() => setAberto(null)}
        aoMudarPastas={carregarPastas} />
      {dialogoTexto}
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

function ChipPasta({ ativo, onPress, children }: { ativo: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onPress}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${ativo ? 'bg-surface font-medium shadow-sm ring-1 ring-[var(--hairline)]' : 'text-muted hover:text-foreground'}`}>
      {children}
    </button>
  )
}

function CartaoVideo({ v, nome, onAbrir, pastas, dentro, favoritos, aoColocar, aoNovaPasta, selecionando, selecionado, aoSegurar, aoBaixar }: {
  v: Video; nome?: string; onAbrir: () => void; pastas: Pasta[]; dentro: number[]; favoritos?: Pasta
  aoColocar: (p: Pasta, dentro: boolean) => void; aoNovaPasta: () => void
  selecionando: boolean; selecionado: boolean; aoSegurar: () => void; aoBaixar: () => void
}) {
  const segurar = useRef<number | null>(null)
  const segurou = useRef(false)
  const ehVideo = (v.tipo ?? 'video') !== 'carrossel' && v.tipo !== 'foto'
  const fav = !!favoritos && dentro.includes(favoritos.id)
  const [festa, setFesta] = useState(0)
  const minhas = pastas.filter((p) => !p.sistema)
  const emPasta = dentro.some((id) => minhas.some((p) => p.id === id))
  return (
    <div className="group relative">
      <button onClick={() => { if (segurou.current) { segurou.current = false; return } onAbrir() }} aria-pressed={selecionando ? selecionado : undefined}
        onPointerDown={() => { segurou.current = false; segurar.current = window.setTimeout(() => { segurou.current = true; aoSegurar() }, 550) }}
        onPointerUp={() => segurar.current && clearTimeout(segurar.current)} onPointerLeave={() => segurar.current && clearTimeout(segurar.current)}
        className="block w-full text-left outline-none">
        <div className={`relative aspect-[9/16] overflow-hidden rounded-2xl bg-surface-secondary ring-accent transition-all group-focus-visible:ring-2 ${selecionado ? 'scale-[0.94] ring-[3px]' : ''}`}>
          <img src={urlThumb(v)} alt="" loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          {/* marca d'água da plataforma de origem */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            {selecionando ? (
              <span className={`grid size-6 place-items-center rounded-full border-2 transition-all ${selecionado ? 'border-transparent bg-accent text-white' : 'border-white/80 bg-black/30'}`}>
                {selecionado && <Check className="size-3.5" />}
              </span>
            ) : (
              <span title={NOME_PLATAFORMA[v.plataforma]} className="grid size-6 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur-md">
                <IconePlataforma plataforma={v.plataforma} className="size-3.5" />
              </span>
            )}
            {(v.tipo === 'carrossel' || v.tipo === 'foto') && (
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
                {v.tipo === 'carrossel' ? 'Carrossel' : 'Foto'}
              </span>
            )}
          </div>
          <div className={`absolute inset-0 grid place-items-center opacity-0 transition-opacity ${selecionando ? '' : 'group-hover:opacity-100'}`}>
            <span className="grid size-12 place-items-center rounded-full bg-white/25 text-white backdrop-blur-md"><Play className="size-5" /></span>
          </div>
          <div className="num absolute inset-x-0 bottom-0 flex items-center justify-between p-2.5 text-xs font-medium text-white">
            <span className="flex items-center gap-1"><Eye className="size-3.5" />{v.views != null ? fmtNum(v.views) : `♥ ${fmtNum(v.likes)}`}</span>
            {v.duracao != null && <span>{fmtDuracao(v.duracao)}</span>}
          </div>
        </div>
        <div className="mt-2 px-0.5">
          <p className="truncate text-sm font-medium">{nome ?? `@${v.conta}`}</p>
          <p className="num truncate text-xs text-muted">{fmtData(v.data)}{v.engajamento != null && ` · ${fmtDec(v.engajamento, 1)}% eng.`}</p>
        </div>
      </button>
      <div className={`absolute top-2 right-2 flex flex-col gap-1.5 ${selecionando ? 'hidden' : ''}`}>
        {favoritos && (
          <button aria-label={fav ? 'Tirar dos favoritos' : 'Favoritar'} onClick={() => { if (!fav) setFesta(Date.now()); aoColocar(favoritos, !fav) }}
            className={`relative grid size-8 place-items-center rounded-full backdrop-blur-md transition-all hover:scale-110 ${fav ? 'bg-white text-[#ff4d6d] opacity-100' : 'bg-black/45 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-100'}`}>
            {fav ? <HeartFill key={festa} className="anim-coracao size-4" /> : <Heart className="size-4" />}
            {festa > 0 && fav && <span key={`e${festa}`} className="pointer-events-none absolute -inset-4"><Explosao tamanho={64} cor="#ff4d6d" /></span>}
          </button>
        )}
        <Menu titulo="Guardar na pasta" gatilho={(abrir) => (
          <button aria-label="Guardar na pasta" onClick={abrir}
            className={`grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-all hover:scale-110 ${emPasta ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-sm:opacity-100'}`}>
            <Folder className="size-4" />
          </button>
        )} itens={[
          ...minhas.map((p) => ({ id: p.id, rotulo: p.nome, icone: <Folder />, marcado: dentro.includes(p.id), aoEscolher: () => aoColocar(p, !dentro.includes(p.id)) })),
          { id: 'nova', rotulo: 'Nova pasta…', icone: <Plus />, aoEscolher: aoNovaPasta },
        ]} />
        {ehVideo && (
          <button aria-label="Baixar vídeo" onClick={() => { tocar('clique'); aoBaixar() }}
            className="grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition-all group-hover:opacity-100 hover:scale-110 max-sm:opacity-100">
            <ArrowDownToLine className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export function ModalVideo({ video, nome, onFechar, aoMudarPastas }: { video: Video | null; nome?: string; onFechar: () => void; aoMudarPastas?: () => void }) {
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
              <div data-rolavel="y" className="flex max-h-[78vh] flex-col gap-5 overflow-y-auto p-6">
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
                    Engajamento de <span className="font-medium text-foreground">{fmtDec(video.engajamento, 2)}%</span>{' '}
                    (curtidas + comentários ÷ views).
                  </p>
                )}
                <AcoesPost video={video} aoMudarPastas={aoMudarPastas} />
                <AnaliseIA video={video} />
                <Comentarios video={video} />
                <div className="flex-1">
                  <p className="mb-1 text-xs tracking-wide text-muted uppercase">Legenda</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{video.legenda || 'Sem legenda.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AnotarPost video={video} />
                  {video.url && (
                    <Button size="sm" variant="tertiary" onPress={() => window.open(video.url, '_blank')}>
                      <ArrowUpRightFromSquare />
                      Abrir no {NOME_PLATAFORMA[video.plataforma]}
                    </Button>
                  )}
                  {(video.tipo ?? 'video') !== 'carrossel' && video.tipo !== 'foto' && (
                    <Button size="sm" variant="tertiary" onPress={() => baixarArquivo(video)}>
                      <ArrowDownToLine />
                      Baixar
                    </Button>
                  )}
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
  depoimento: 'Depoimento', carrossel_educativo: 'Carrossel educativo', carrossel_storytelling: 'Carrossel de história', foto_unica: 'Foto', esquete_humor: 'Esquete de humor', trend_meme: 'Trend/meme', bastidores: 'Bastidores',
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

/** Comentários coletados do post (os mais curtidos primeiro). */
function Comentarios({ video }: { video: Video }) {
  const [lista, setLista] = useState<Comentario[] | null>(null)
  useEffect(() => {
    setLista(null)
    api.comentarios(video.plataforma, video.id).then(setLista).catch(() => setLista([]))
  }, [video.plataforma, video.id])
  if (!lista?.length) return null
  return (
    <details className="rounded-2xl bg-surface-secondary p-4" open>
      <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted uppercase">
        Comentários ({lista.length})
      </summary>
      <ul data-rolavel="y" className="mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {lista.map((c, i) => (
          <li key={i} className="text-sm leading-relaxed">
            {c.texto}
            {!!c.likes && <span className="num ml-1.5 text-xs text-muted">♥ {fmtNum(c.likes)}</span>}
          </li>
        ))}
      </ul>
    </details>
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


/** Favoritar, guardar em pasta e usar como referência de estilo visual (dentro do modal do post). */
function AcoesPost({ video, aoMudarPastas }: { video: Video; aoMudarPastas?: () => void }) {
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [dentro, setDentro] = useState<number[]>([])
  const [estilos, setEstilos] = useState<Estilo[]>([])
  const k = `${video.plataforma}/${video.id}`
  useEffect(() => {
    apiPastas.listar().then((r) => { setPastas(r.pastas); setDentro(r.mapa[k] ?? []) }).catch(() => {})
    criacao.estilos().then((r) => setEstilos(r.estilos)).catch(() => {})
  }, [k])
  const fav = pastas.find((p) => p.sistema)
  const minhas = pastas.filter((p) => !p.sistema)
  const alternar = async (p: Pasta) => {
    const vai = !dentro.includes(p.id)
    setDentro((d) => (vai ? [...d, p.id] : d.filter((x) => x !== p.id)))
    tocar(p.sistema ? (vai ? 'favorito' : 'clique') : 'pasta')
    await (p.sistema ? apiPastas.favoritar(video, vai) : apiPastas.colocar(p.id, video, vai)).catch(() => {})
    aoMudarPastas?.()
  }
  const referencia = async (e: Estilo | null) => {
    try {
      const id = e?.id ?? (await criacao.criarEstilo(`Estilo de @${video.conta}`)).id
      await criacao.refDoPost(id, video)
      tocar('pasta')
      toast.success(e ? `Adicionado ao estilo "${e.nome}"` : 'Novo estilo criado com este post', { description: 'Veja em Criar → Estilos visuais.' })
    } catch (err) { toast.danger('Não deu', { description: (err as Error).message }) }
  }
  const favorito = !!fav && dentro.includes(fav.id)
  return (
    <div className="flex flex-wrap gap-2">
      {fav && (
        <Button size="sm" variant="tertiary" onPress={() => alternar(fav)}>
          {favorito ? <HeartFill className="anim-coracao text-[#ff4d6d]" /> : <Heart />} {favorito ? 'Favorito' : 'Favoritar'}
        </Button>
      )}
      <Menu titulo="Guardar na pasta" alinhar="esquerda" gatilho={(abrir) => <Button size="sm" variant="tertiary" onPress={abrir}><Folder /> Pasta</Button>}
        itens={minhas.length ? minhas.map((p) => ({ id: p.id, rotulo: p.nome, icone: <Folder />, marcado: dentro.includes(p.id), aoEscolher: () => alternar(p) }))
          : [{ id: 'x', rotulo: 'Crie pastas na Biblioteca', aoEscolher: () => {} }]} />
      <Menu titulo="Usar como referência visual" alinhar="esquerda" gatilho={(abrir) => <Button size="sm" variant="tertiary" onPress={abrir}><Palette /> Referência de estilo</Button>}
        itens={[...estilos.map((e) => ({ id: e.id, rotulo: e.nome, icone: <Palette />, aoEscolher: () => referencia(e) })),
          { id: 'novo', rotulo: 'Novo estilo com este post', icone: <Plus />, aoEscolher: () => referencia(null) }]} />
    </div>
  )
}

/** Guarda no Caderno de ideias o que esse post te fez pensar (com o post como referência). */
function AnotarPost({ video }: { video: Video }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvo, setSalvo] = useState(false)
  useEffect(() => { setAberto(false); setTexto(''); setSalvo(false) }, [video.id])
  const salvar = async () => {
    try {
      await apiNotas.criar({ texto: texto.trim(), tipo: 'referencia', ref: { plataforma: video.plataforma, conta: video.conta, id: video.id, legenda: video.legenda.slice(0, 300) } })
      tocar('bolha'); setSalvo(true); setAberto(false); setTexto('')
      toast.success('Anotado no Caderno de ideias', { description: 'Está em Criar → Caderno de ideias, com este post como referência.' })
    } catch (e) { toast.danger('Não deu para anotar', { description: (e as Error).message }) }
  }
  if (!aberto) {
    return (
      <Button size="sm" variant="tertiary" onPress={() => setAberto(true)}>
        <Pencil /> {salvo ? 'Anotar outra coisa' : 'Anotar no caderno'}
      </Button>
    )
  }
  return (
    <form className="w-full space-y-2" onSubmit={(e) => { e.preventDefault(); salvar() }}>
      <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} aria-label="Anotação sobre o post"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar() } if (e.key === 'Escape') setAberto(false) }}
        placeholder="O que esse post te fez pensar? Ex.: dá para fazer isso com o cardápio dos meus clientes"
        className="w-full resize-none rounded-xl bg-surface-secondary/70 p-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={() => setAberto(false)}>Cancelar</Button>
        <Button size="sm" type="submit" className="botao-sinal">Guardar nota</Button>
      </div>
    </form>
  )
}
