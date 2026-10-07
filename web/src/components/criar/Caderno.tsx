import { Button, toast } from '@heroui/react'
import { ArrowRight, Check, CircleCheck, Magnifier, Pin, PinFill, Sparkles, TrashBin, Xmark } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { criacao, notas as apiNotas, urlCapa, type IdeiaDasNotas, type Nota, type OrganizacaoNotas, type Provocacao, type TipoNota } from '../../api'
import { useAtividade } from '../Atividade'
import { AnimProcesso } from '../AnimProcessos'
import { fmtRelativo } from '../../formato'
import { tocar } from '../../sons'
import { useConfirmar } from '../ui/Confirmar'
import { Mascote } from '../Goust'
import { formatoDe, OBJETIVOS } from './comum'

const TIPOS: { id: TipoNota; nome: string; emoji: string; cor: string; dica: string }[] = [
  { id: 'ideia', nome: 'Ideia', emoji: '💡', cor: 'var(--accent)', dica: 'Uma ideia de post, série ou formato' },
  { id: 'observacao', nome: 'Observação', emoji: '👀', cor: 'var(--menta)', dica: 'Algo que você reparou no dia a dia' },
  { id: 'frase', nome: 'Frase', emoji: '💬', cor: 'var(--ambar)', dica: 'Uma frase boa, um gancho, uma opinião' },
  { id: 'bastidor', nome: 'Bastidor', emoji: '🎬', cor: 'var(--sinal-b)', dica: 'Uma história de bastidor do seu trabalho' },
  { id: 'pergunta', nome: 'Pergunta de cliente', emoji: '❓', cor: '#5ab0ff', dica: 'O que clientes e seguidores perguntam' },
  { id: 'referencia', nome: 'Referência', emoji: '🔖', cor: '#c084fc', dica: 'Algo de outro perfil que te inspirou' },
]
const tipoDe = (t: TipoNota) => TIPOS.find((x) => x.id === t) ?? TIPOS[0]
const EXEMPLOS = [
  'Cliente perguntou hoje se vale a pena anunciar no iFood…',
  'Reparei que todo mundo posta o prato e ninguém mostra a cozinha',
  '"Anúncio bom não salva cardápio ruim" #frase',
  'Série: um erro de delivery por semana #serie',
]
const DIRECOES = ['para Reels', 'uma série', 'para vender', 'polêmico', 'fácil de gravar hoje']

type Filtro = 'soltas' | 'todas' | 'usadas'

/** Caderno de ideias: anotar rápido → a IA destrincha, organiza em temas e desenvolve → vira conteúdo no calendário. */
export function Caderno({ aoIrCalendario }: { aoIrCalendario: () => void }) {
  const { confirmacao, confirmar } = useConfirmar()
  const { recarregar } = useAtividade()
  const [lista, setLista] = useState<Nota[] | null>(null)
  const [temas, setTemas] = useState<OrganizacaoNotas | null>(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<TipoNota>('ideia')
  const [filtro, setFiltro] = useState<Filtro>('soltas')
  const [tipoFiltro, setTipoFiltro] = useState<TipoNota | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [temaAtivo, setTemaAtivo] = useState<number | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [direcao, setDirecao] = useState('')
  const [gerando, setGerando] = useState(false)
  const [ideias, setIdeias] = useState<IdeiaDasNotas[]>([])
  const [organizando, setOrganizando] = useState(false)
  const [exemplo, setExemplo] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const painel = useRef<HTMLDivElement>(null)

  const carregar = useCallback(() => apiNotas.listar().then((r) => { setLista(r.notas); setTemas(r.temas) }).catch(() => setLista([])), [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const t = setInterval(() => setExemplo((e) => (e + 1) % EXEMPLOS.length), 4000); return () => clearInterval(t) }, [])

  const soltas = (lista ?? []).filter((n) => n.estado === 'solta')
  const tags = useMemo(() => [...new Set((lista ?? []).flatMap((n) => n.tags))].sort(), [lista])
  const notasDoTema = temaAtivo !== null && temas ? new Set(temas.temas[temaAtivo]?.notas ?? []) : null
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (lista ?? []).filter((n) =>
      (filtro === 'todas' || (filtro === 'soltas' ? n.estado === 'solta' : n.estado === 'usada'))
      && (!tipoFiltro || n.tipo === tipoFiltro) && (!tag || n.tags.includes(tag))
      && (!notasDoTema || notasDoTema.has(n.id)) && (!q || n.texto.toLowerCase().includes(q)))
  }, [lista, filtro, tipoFiltro, tag, busca, notasDoTema])

  // ---------------- ações
  const anotar = async () => {
    const t = texto.trim()
    if (!t) return
    setTexto('')
    try {
      const n = await apiNotas.criar({ texto: t, tipo })
      setLista((l) => [n, ...(l ?? [])])
      tocar('bolha')
      campo.current?.focus()
    } catch (e) { setTexto(t); toast.danger('Não deu para salvar', { description: (e as Error).message }) }
  }
  const mudar = async (n: Nota, d: Partial<Pick<Nota, 'texto' | 'tipo' | 'fixada' | 'estado'>>) => {
    setLista((l) => l?.map((x) => (x.id === n.id ? { ...x, ...d } : x)) ?? l)
    try { const r = await apiNotas.atualizar(n.id, d); setLista((l) => l?.map((x) => (x.id === n.id ? r : x)) ?? l) } catch { carregar() }
  }
  const apagar = async (n: Nota) => {
    if (!await confirmar({ titulo: 'Apagar esta nota?', texto: 'Ela sai do seu caderno. Conteúdos que já nasceram dela continuam no calendário.', confirmar: 'Apagar' })) return
    setLista((l) => l?.filter((x) => x.id !== n.id) ?? l)
    setSel((s) => { const x = new Set(s); x.delete(n.id); return x })
    await apiNotas.apagar(n.id).catch(carregar)
  }
  const alternarSel = (n: Nota) => {
    tocar('clique')
    setSel((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x })
  }
  const desenvolver = async (ids: number[], pedido = direcao) => {
    setGerando(true); setIdeias([])
    tocar('geracao')
    painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      const r = await apiNotas.desenvolver(ids, pedido)
      setIdeias(r.ideias)
      tocar('geracaoFim')
    } catch (e) { toast.danger('A IA não conseguiu desenvolver agora', { description: (e as Error).message }) } finally { setGerando(false) }
  }
  const organizar = async (forcar = false) => {
    setOrganizando(true)
    tocar('analise')
    try { setTemas(await apiNotas.organizar(forcar)); tocar('analiseFim') }
    catch (e) { toast.warning('Ainda não dá para organizar', { description: (e as Error).message }) } finally { setOrganizando(false) }
  }
  const aceitar = async (ideia: IdeiaDasNotas, roteiro: boolean) => {
    try {
      const r = await apiNotas.virarConteudo(ideia, roteiro)
      setIdeias((xs) => xs.filter((x) => x !== ideia))
      setLista((l) => l?.map((n) => (ideia.origem.includes(n.id) ? { ...n, estado: 'usada', conteudo_id: r.conteudo.id } : n)) ?? l)
      setSel(new Set())
      tocar('sucesso')
      if (r.tarefa) recarregar()
      toast.success(`“${r.conteudo.titulo}” está no calendário`, {
        description: roteiro ? 'A IA já está escrevendo o roteiro.' : 'Está no banco de ideias, ao lado do calendário. Arraste para um dia quando quiser.',
        actionProps: { children: 'Abrir calendário', onPress: aoIrCalendario },
      })
    } catch (e) { toast.danger('Não deu para adicionar', { description: (e as Error).message }) }
  }
  const descartar = (ideia: IdeiaDasNotas) => {
    setIdeias((xs) => xs.filter((x) => x !== ideia))
    criacao.escolherIdeia(ideia, false).catch(() => {})
  }
  const responder = async (origem: Nota, pergunta: string, resposta: string) => {
    const n = await apiNotas.criar({ texto: `${pergunta}\n→ ${resposta}`, tipo: origem.tipo === 'pergunta' ? 'ideia' : origem.tipo, tags: origem.tags })
    setLista((l) => [n, ...(l ?? [])])
    tocar('bolha')
    toast('Resposta guardada como nota', { description: 'Ela entra junto quando você desenvolver as ideias.' })
  }

  const contagem = (f: Filtro) => (lista ?? []).filter((n) => f === 'todas' || (f === 'soltas' ? n.estado === 'solta' : n.estado === 'usada')).length
  const viraram = contagem('usadas')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {confirmacao}
      <div className="min-w-0 space-y-4">
        {/* captura */}
        <section className="cartao p-4 sm:p-5">
          <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(6, Math.max(2, texto.split('\n').length))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); anotar() } }}
            placeholder={EXEMPLOS[exemplo]} aria-label="Nova nota"
            className="w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-muted/70" />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {TIPOS.map((t) => (
              <button key={t.id} onClick={() => { tocar('clique'); setTipo(t.id) }} title={t.dica} aria-pressed={tipo === t.id}
                className={`rounded-full px-2.5 py-1 text-xs transition-all ${tipo === t.id ? 'bg-surface-secondary font-medium text-foreground ring-1' : 'text-muted hover:text-foreground'}`}
                style={tipo === t.id ? { boxShadow: `inset 0 0 0 1px ${t.cor}` } : undefined}>
                {t.emoji} {t.nome}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 linha-fina">
            <span className="text-[11px] text-muted max-sm:hidden">Enter salva · Shift+Enter quebra linha · #tag organiza</span>
            <Button size="sm" className="botao-sinal ml-auto" isDisabled={!texto.trim()} onPress={anotar}>Anotar</Button>
          </div>
        </section>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-surface-secondary/70 p-0.5 text-sm">
            {([['soltas', 'Para trabalhar'], ['usadas', 'Viraram conteúdo'], ['todas', 'Todas']] as const).map(([k, n]) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`rounded-full px-3 py-1 transition-colors ${filtro === k ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>
                {n} <span className="num text-xs text-muted">{contagem(k)}</span>
              </button>
            ))}
          </div>
          <div className="cartao flex min-w-[160px] flex-1 items-center gap-2 px-3">
            <Magnifier className="size-3.5 text-muted" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas notas" aria-label="Buscar nas notas"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          </div>
        </div>
        {(tags.length > 0 || tipoFiltro || notasDoTema) && (
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {notasDoTema && temas && (
              <button onClick={() => setTemaAtivo(null)} className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
                Tema: {temas.temas[temaAtivo!]?.nome} <Xmark className="size-3" />
              </button>
            )}
            {TIPOS.filter((t) => (lista ?? []).some((n) => n.tipo === t.id)).map((t) => (
              <button key={t.id} onClick={() => setTipoFiltro(tipoFiltro === t.id ? null : t.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${tipoFiltro === t.id ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>{t.emoji} {t.nome}</button>
            ))}
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${tag === t ? 'bg-accent/15 font-medium text-accent' : 'text-muted hover:text-foreground'}`}>#{t}</button>
            ))}
          </div>
        )}

        {/* notas */}
        {lista === null ? (
          <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="carregando mb-3 h-28 break-inside-avoid rounded-2xl" />)}</div>
        ) : !lista.length ? (
          <div className="cartao px-6 py-14 text-center">
            <div className="mx-auto w-fit text-muted"><Mascote tamanho={48} variante="mono" /></div>
            <h3 className="titulo-display mt-2 text-xl font-semibold">Seu caderno de ideias</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Jogue aqui o que aparecer no dia a dia: uma pergunta de cliente, uma frase boa, um bastidor, algo que você reparou.
              Não precisa estar pronto. Depois a IA organiza em temas e transforma em conteúdo para o calendário.
            </p>
          </div>
        ) : !visiveis.length ? (
          <div className="cartao py-12 text-center text-sm text-muted">
            {filtro === 'usadas' ? 'Nenhuma nota virou conteúdo ainda. Desenvolva algumas com a IA.' : 'Nada com esses filtros.'}
          </div>
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
            {visiveis.map((n) => (
              <CartaoNota key={n.id} n={n} selecionada={sel.has(n.id)} aoSelecionar={() => alternarSel(n)}
                aoMudar={(d) => mudar(n, d)} aoApagar={() => apagar(n)} aoDesenvolver={(pedido) => desenvolver([n.id], pedido)}
                aoResponder={(p, r) => responder(n, p, r)} aoTag={setTag} />
            ))}
          </div>
        )}
      </div>

      {/* brainstorm com a IA */}
      <aside ref={painel} className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="cartao p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <h3 className="titulo-display font-semibold">Brainstorm com a IA</h3>
          </div>
          <p className="mt-1 text-sm text-muted">
            {sel.size ? `${sel.size} ${sel.size === 1 ? 'nota escolhida' : 'notas escolhidas'}. A IA parte delas e mantém a sua ideia.`
              : soltas.length ? 'Escolha notas no caderno (ou use as mais recentes) e a IA transforma em ideias de post.'
                : 'Anote algumas ideias e a IA transforma em posts para o calendário.'}
          </p>
          <input value={direcao} onChange={(e) => setDirecao(e.target.value)} placeholder="Direção (opcional): ex. quero vender o diagnóstico"
            aria-label="Direção para a IA" className="mt-3 h-10 w-full rounded-xl bg-surface-secondary/70 px-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIRECOES.map((d) => (
              <button key={d} onClick={() => setDirecao(direcao === d ? '' : d)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${direcao === d ? 'bg-accent/15 text-accent' : 'text-muted ring-1 ring-[var(--border)] hover:text-foreground'}`}>{d}</button>
            ))}
          </div>
          <Button className="botao-sinal mt-3 w-full" isPending={gerando} isDisabled={!soltas.length && !sel.size}
            onPress={() => desenvolver([...sel])}>
            <Sparkles /> {sel.size ? `Desenvolver ${sel.size === 1 ? 'esta nota' : `estas ${sel.size} notas`}` : 'Desenvolver minhas notas recentes'}
          </Button>
          {sel.size > 0 && <button onClick={() => setSel(new Set())} className="mt-2 w-full text-center text-xs text-muted hover:text-foreground">Limpar seleção</button>}

          {gerando && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-secondary/60 p-4 text-sm text-muted">
              <AnimProcesso tipo="geracao" tamanho={36} /> Transformando suas notas em ideias…
            </div>
          )}
          {ideias.length > 0 && (
            <div className="mt-4 space-y-3">
              {ideias.map((i, k) => (
                <CartaoIdeia key={`${i.titulo}${k}`} i={i} notas={lista ?? []} aoAceitar={(r) => aceitar(i, r)} aoDescartar={() => descartar(i)} />
              ))}
              <button onClick={() => desenvolver([...sel])} className="w-full text-center text-xs text-muted hover:text-foreground">Gerar outras</button>
            </div>
          )}
        </section>

        <section className="cartao p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="titulo-display font-semibold">Temas do caderno</h3>
            {temas && <button onClick={() => organizar(true)} className="text-xs text-muted hover:text-foreground">Reorganizar</button>}
          </div>
          {!temas ? (
            <>
              <p className="mt-1 text-sm text-muted">A IA agrupa suas notas soltas no que se repete e diz o que vale virar conteúdo primeiro.</p>
              <Button className="mt-3 w-full" variant="tertiary" isPending={organizando} isDisabled={soltas.length < 3} onPress={() => organizar()}>
                {soltas.length < 3 ? `Precisa de 3 notas soltas (tem ${soltas.length})` : 'Organizar com a IA'}
              </Button>
            </>
          ) : (
            <div className="mt-3 space-y-2.5">
              {temas.observacao && <p className="rounded-xl bg-accent/10 p-3 text-sm leading-relaxed">{temas.observacao}</p>}
              {temas.temas.map((t, k) => (
                <div key={t.nome} className={`rounded-2xl p-3 transition-colors ${temaAtivo === k ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-surface-secondary/60'}`}>
                  <button onClick={() => setTemaAtivo(temaAtivo === k ? null : k)} className="w-full text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.nome}</span>
                      <span className="num shrink-0 text-xs text-muted">{t.notas.length} {t.notas.length === 1 ? 'nota' : 'notas'}</span>
                      <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.potencial === 'alto' ? 'bg-[var(--menta)]/15 text-[var(--menta)]' : t.potencial === 'medio' ? 'bg-[var(--ambar)]/15 text-[var(--ambar)]' : 'bg-surface-tertiary text-muted'}`}>
                        potencial {t.potencial === 'medio' ? 'médio' : t.potencial}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{t.resumo}</p>
                  </button>
                  <p className="mt-2 text-xs leading-relaxed"><span className="text-muted">Próximo passo:</span> {t.proximo_passo}</p>
                  <button onClick={() => { setSel(new Set(t.notas)); desenvolver(t.notas, t.proximo_passo) }}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-accent hover:underline">Desenvolver este tema <ArrowRight className="size-3" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {viraram > 0 && (
          <p className="px-1 text-center text-xs text-muted">
            <span className="num font-semibold text-foreground">{viraram}</span> {viraram === 1 ? 'nota já virou conteúdo' : 'notas já viraram conteúdo'} ✨
          </p>
        )}
      </aside>

      {sel.size > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 lg:hidden">
          <div className="vidro flex items-center gap-2 rounded-full border p-1.5 pl-4 shadow-xl linha-fina">
            <span className="text-sm"><span className="num font-semibold">{sel.size}</span> {sel.size === 1 ? 'nota' : 'notas'}</span>
            <Button size="sm" className="botao-sinal rounded-full" isPending={gerando} onPress={() => desenvolver([...sel])}><Sparkles /> Desenvolver</Button>
            <Button isIconOnly size="sm" variant="ghost" className="rounded-full" aria-label="Limpar seleção" onPress={() => setSel(new Set())}><Xmark /></Button>
          </div>
        </div>, document.body)}
    </div>
  )
}

// ---------------------------------------------------------------- cartões

function CartaoNota({ n, selecionada, aoSelecionar, aoMudar, aoApagar, aoDesenvolver, aoResponder, aoTag }: {
  n: Nota; selecionada: boolean; aoSelecionar: () => void
  aoMudar: (d: Partial<Pick<Nota, 'texto' | 'tipo' | 'fixada' | 'estado'>>) => void; aoApagar: () => void
  aoDesenvolver: (pedido: string) => void; aoResponder: (pergunta: string, resposta: string) => void; aoTag: (t: string) => void
}) {
  const t = tipoDe(n.tipo)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(n.texto)
  const [prov, setProv] = useState<Provocacao | null>(null)
  const [pensando, setPensando] = useState(false)
  const usada = n.estado === 'usada'

  const destrinchar = async () => {
    if (prov) { setProv(null); return }
    setPensando(true); tocar('analise')
    try { setProv(await apiNotas.provocar(n.id)); tocar('neuronio') }
    catch (e) { toast.danger('A IA não conseguiu agora', { description: (e as Error).message }) } finally { setPensando(false) }
  }
  const salvarEdicao = () => { setEditando(false); if (rascunho.trim() && rascunho !== n.texto) aoMudar({ texto: rascunho }) }

  return (
    <article className={`group surgir relative mb-3 break-inside-avoid rounded-2xl border p-4 transition-all linha-fina ${selecionada ? 'bg-accent/8 ring-2 ring-accent' : 'bg-surface hover:-translate-y-0.5'} ${usada ? 'opacity-75' : ''}`}>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="size-2 rounded-full" style={{ background: t.cor }} />
        <span className="font-medium" style={{ color: t.cor }}>{t.nome}</span>
        <span className="text-muted">· {fmtRelativo(n.criado)}</span>
        {usada && <span className="rounded-full bg-[var(--menta)]/15 px-1.5 py-0.5 text-[10px] text-[var(--menta)]">virou conteúdo</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => aoMudar({ fixada: !n.fixada })} aria-label={n.fixada ? 'Desafixar' : 'Fixar no topo'}
            className={`grid size-7 place-items-center rounded-full transition-opacity hover:bg-surface-secondary ${n.fixada ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100 max-sm:opacity-100'}`}>
            {n.fixada ? <PinFill className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button onClick={aoSelecionar} aria-label={selecionada ? 'Tirar da seleção' : 'Escolher para a IA'} aria-pressed={selecionada}
            className={`grid size-7 place-items-center rounded-full transition-opacity hover:bg-surface-secondary ${selecionada ? 'text-accent' : 'text-muted opacity-0 group-hover:opacity-100 max-sm:opacity-100'}`}>
            {selecionada ? <Check className="size-4" /> : <CircleCheck className="size-3.5" />}
          </button>
        </div>
      </div>

      {editando ? (
        <textarea autoFocus value={rascunho} onChange={(e) => setRascunho(e.target.value)} onBlur={salvarEdicao}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarEdicao() } if (e.key === 'Escape') { setRascunho(n.texto); setEditando(false) } }}
          rows={Math.max(2, rascunho.split('\n').length)} aria-label="Editar nota"
          className="mt-2 w-full resize-none rounded-lg bg-surface-secondary/60 p-2 text-[15px] leading-relaxed outline-none" />
      ) : (
        <p onClick={() => { setRascunho(n.texto); setEditando(true) }} title="Clique para editar"
          className="mt-2 cursor-text text-[15px] leading-relaxed whitespace-pre-wrap">{n.texto.replace(/(^|\s)#[\wÀ-ÿ-]+/g, '$1').trim() || n.texto}</p>
      )}

      {n.ref && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-secondary/60 p-1.5">
          <img src={urlCapa(n.ref.plataforma, n.ref.conta, n.ref.id)} alt="" className="h-12 w-9 rounded-lg object-cover" />
          <span className="min-w-0 text-xs text-muted"><span className="block font-medium text-foreground">@{n.ref.conta}</span><span className="line-clamp-2">{n.ref.legenda}</span></span>
        </div>
      )}
      {n.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{n.tags.map((g) => <button key={g} onClick={() => aoTag(g)} className="text-xs text-accent hover:underline">#{g}</button>)}</div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t pt-2.5 linha-fina">
        <button onClick={destrinchar} disabled={pensando}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10">
          {pensando ? <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <Sparkles className="size-3.5" />}
          {prov ? 'Fechar' : 'Destrinchar'}
        </button>
        <button onClick={() => aoDesenvolver('')} className="rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">Virar post</button>
        <button onClick={aoApagar} aria-label="Apagar nota"
          className="ml-auto grid size-7 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger max-sm:opacity-100"><TrashBin className="size-3.5" /></button>
      </div>

      {prov && (
        <div className="entrar-cima mt-3 space-y-3 rounded-xl bg-accent/8 p-3">
          <p className="text-sm leading-relaxed"><span className="text-accent">✦</span> {prov.leitura}</p>
          <div>
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Para aprofundar</p>
            <div className="space-y-2">{prov.perguntas.filter((p) => p.trim()).map((p) => <Pergunta key={p} pergunta={p} aoResponder={(r) => aoResponder(p, r)} />)}</div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Ângulos possíveis</p>
            <div className="space-y-1.5">
              {prov.angulos.filter((a) => a.trim()).map((a) => (
                <button key={a} onClick={() => aoDesenvolver(a)} className="group/a flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-sm leading-snug transition-colors hover:bg-surface/60">
                  <span className="mt-0.5 text-accent">→</span><span className="flex-1">{a}</span>
                  <span className="shrink-0 text-[11px] text-accent opacity-0 group-hover/a:opacity-100">desenvolver</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function Pergunta({ pergunta, aoResponder }: { pergunta: string; aoResponder: (r: string) => void }) {
  const [r, setR] = useState('')
  const [feito, setFeito] = useState(false)
  return (
    <div>
      <p className="text-sm leading-snug">{pergunta}</p>
      {feito ? <p className="mt-1 text-xs text-[var(--menta)]">✓ Guardado no caderno</p> : (
        <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (r.trim()) { aoResponder(r.trim()); setFeito(true) } }}>
          <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Responder…" aria-label={`Responder: ${pergunta}`}
            className="h-8 min-w-0 flex-1 rounded-lg bg-surface/70 px-2.5 text-xs outline-none placeholder:text-muted focus:ring-1 focus:ring-accent/50" />
          {r.trim() && <button type="submit" className="rounded-lg px-2 text-xs font-medium text-accent">Guardar</button>}
        </form>
      )}
    </div>
  )
}

function CartaoIdeia({ i, notas, aoAceitar, aoDescartar }: { i: IdeiaDasNotas; notas: Nota[]; aoAceitar: (roteiro: boolean) => void; aoDescartar: () => void }) {
  const f = formatoDe(i.formato)
  const [enviando, setEnviando] = useState<boolean | null>(null)
  const origem = notas.filter((n) => i.origem.includes(n.id))
  return (
    <div className="entrar-cima rounded-2xl bg-surface-secondary/60 p-4">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-medium uppercase" style={{ color: f.cor }}>{f.nome}</span>
        <span className="text-muted">· {OBJETIVOS[i.objetivo] ?? i.objetivo}</span>
        <button onClick={aoDescartar} aria-label="Descartar ideia" className="ml-auto grid size-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"><Xmark className="size-3.5" /></button>
      </div>
      <p className="mt-1.5 font-semibold leading-snug">{i.titulo}</p>
      <p className="mt-2 text-sm leading-relaxed italic">“{i.gancho}”</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{i.ideia}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted"><span className="text-foreground">Por que funciona:</span> {i.por_que}</p>
      {origem.length > 0 && (
        <p className="mt-2 line-clamp-2 text-[11px] text-muted" title={origem.map((n) => n.texto).join('\n')}>
          Das suas notas: {origem.map((n) => `“${n.texto.slice(0, 50)}${n.texto.length > 50 ? '…' : ''}”`).join(' · ')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" className="botao-sinal" isPending={enviando === true} isDisabled={enviando !== null} onPress={() => { setEnviando(true); aoAceitar(true) }}>
          Calendário + roteiro
        </Button>
        <Button size="sm" variant="tertiary" isPending={enviando === false} isDisabled={enviando !== null} onPress={() => { setEnviando(false); aoAceitar(false) }}>
          Só adicionar
        </Button>
      </div>
    </div>
  )
}
