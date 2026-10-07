import { Button, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { FolderOpen, TrashBin } from '@gravity-ui/icons'
import { useMemo, useState } from 'react'
import { COLETA_INICIAL, api, marcas as marcasApi, type Conta, type Opcoes, type Plataforma } from '../api'
import { useDialogoTexto } from '../components/ui/DialogoTexto'
import { IconePlataforma } from '../components/Plataforma'
import { Parecidos } from '../components/Parecidos'
import { AnimProcesso } from '../components/AnimProcessos'
import { useAtividade } from '../components/Atividade'
import { BuscaPerfis } from '../components/BuscaPerfis'
import { ContextoPerfil } from '../components/ContextoPerfil'
import { AvatarConta } from '../components/Avatar'
import { Menu } from '../components/Menu'
import { tocar } from '../sons'
import { ModalDownload } from '../components/ModalDownload'
import { fmtNum, fmtRelativo } from '../formato'
import { useNuvem } from '../ambiente'
import { useConfirmar } from '../components/ui/Confirmar'

type Filtro = 'todas' | Plataforma
const chave = (c: Pick<Conta, 'plataforma' | 'conta'>) => `${c.plataforma}/${c.conta}`

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  aoBaixar: () => void
}

export function TelaContas({ contas, setContas, aoBaixar }: Props) {
  const { confirmacao, confirmar } = useConfirmar()
  const nuvem = useNuvem()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [papel, setPapel] = useState<'todos' | 'concorrente' | 'referencia'>('todos')
  const [maisPosts, setMaisPosts] = useState<Conta[] | null>(null)
  const { dialogo: dialogoTexto, pedir: pedirTexto } = useDialogoTexto()
  const [editando, setEditando] = useState<Conta | null>(null)
  const [salvandoCtx, setSalvandoCtx] = useState(false)
  const { recarregar } = useAtividade()
  const salvarContexto = async (d: { papel: 'concorrente' | 'referencia'; aspectos: string[]; nota: string; reanalisar: boolean }) => {
    if (!editando) return
    setSalvandoCtx(true)
    try {
      const r = await api.contextoConta(editando, d)
      setContas(r.contas)
      if (r.tarefa) { tocar('analise'); recarregar() } else tocar('sucesso')
      toast.success('Contexto salvo', { description: r.tarefa ? 'A IA está refazendo a análise com esse olhar.' : 'Vale para as próximas análises.' })
      setEditando(null)
    } catch (e) {
      toast.danger('Não deu para salvar', { description: (e as Error).message })
    } finally { setSalvandoCtx(false) }
  }

  const grupos = useMemo(() => agrupar(contas).filter((g) => (filtro === 'todas' || g.contas.some((c) => c.plataforma === filtro))
    && (papel === 'todos' || g.papel === papel)), [contas, filtro, papel])
  const soltas = useMemo(() => contas.filter((c) => !c.marca_id && c.papel !== 'proprio'), [contas])
  const removerMarca = async (g: Grupo) => {
    if (!await confirmar({ titulo: `Parar de acompanhar ${g.nome}?`, confirmar: 'Remover marca',
      texto: `As ${g.contas.length} contas (${g.contas.map((c) => '@' + c.conta).join(', ')}) saem da sua lista e das próximas análises. Os posts já coletados continuam na Biblioteca.` })) return
    setContas(await marcasApi.removerMarca(g.contas[0]))
    tocar('clique')
  }
  const mudarPapel = async (c: Conta, p: 'proprio' | 'concorrente' | 'referencia') => {
    try {
      setContas(await api.papelConta(c, p))
      tocar('pasta')
    } catch (e) {
      toast.warning('Não dá para mudar o papel', { description: (e as Error).message })
    }
  }
  async function baixarVideo(url: string) {
    try {
      await api.baixarLink(url)
      toast.success('Salvando o vídeo na Biblioteca', { description: 'Ele aparece lá em instantes.' })
      aoBaixar()
    } catch (e) {
      toast.danger('Não deu certo', { description: (e as Error).message })
    }
  }

  async function coletarDeNovo(c: Conta) {
    await api.baixar([c], { modo: 'recentes', quantidade: COLETA_INICIAL, somente_reels: false, analisar_ao_fim: true })
    tocar('coleta')
    aoBaixar()
  }

  async function remover(c: Conta) {
    const proprio = c.papel === 'proprio'
    if (!await confirmar({
      titulo: proprio ? `Desconectar o seu perfil @${c.conta}?` : `Parar de acompanhar @${c.conta}?`,
      texto: proprio ? 'A IA deixa de analisar esse perfil e ele sai da sua central. Os posts já coletados continuam na Biblioteca.'
        : 'A conta sai da sua lista e das próximas análises. Os posts já coletados continuam na Biblioteca.',
      confirmar: proprio ? 'Desconectar' : 'Remover',
    })) return
    setContas(await api.removerConta(c))
    tocar('clique')
  }

  async function baixar(opcoes: Opcoes) {
    if (!maisPosts) return
    await api.baixar(maisPosts, opcoes)
    tocar('coleta')
    toast.success(`Buscando mais posts de ${maisPosts.map((c) => '@' + c.conta).join(' e ')}`, { description: 'Eles aparecem na Biblioteca conforme chegam.' })
    setMaisPosts(null)
    aoBaixar()
  }


  return (
    <div className="space-y-10 pb-32">
      {confirmacao}
      {/* Hero */}
      <section className="surgir relative z-30 mx-auto max-w-2xl pt-6 text-center">
        <h1 className="titulo-display text-4xl font-semibold sm:text-5xl">Concorrentes e referências</h1>
        <p className="mt-3 text-lg text-muted">
          Concorrente disputa o mesmo cliente. Referência inspira, mesmo sendo de outro mercado.
          Cole um @, o link de um perfil ou de um vídeo.
        </p>
        <div className="mt-8">
          <BuscaPerfis aoAdicionar={(lista) => { setContas(lista); aoBaixar() }} aoVideo={baixarVideo} />
        </div>
      </section>

      <Parecidos contas={contas} setContas={setContas} aoAdicionar={aoBaixar} />

      {/* Lista de contas */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="titulo-display text-2xl font-semibold">Contas</h2>
            <p className="text-sm text-muted">Diga à IA como você vê cada perfil. Os posts coletados ficam na Biblioteca.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-surface-secondary/60 p-0.5 text-sm">
              {([['todos', 'Todos'], ['concorrente', 'Concorrentes'], ['referencia', 'Referências']] as const).map(([k, n]) => (
                <button key={k} onClick={() => setPapel(k)}
                  className={`rounded-full px-3 py-1 transition-colors ${papel === k ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>
                  {n} <span className="num text-xs text-muted">{k === 'todos' ? agrupar(contas).length : agrupar(contas).filter((g) => g.papel === k).length}</span>
                </button>
              ))}
            </div>
            <ToggleButtonGroup
              size="sm"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[filtro]}
              onSelectionChange={(k) => setFiltro([...k][0] as Filtro)}
              aria-label="Filtrar plataforma"
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
          </div>
        </div>

        {grupos.length === 0 ? (
          <div className="cartao py-16 text-center text-muted">Nenhuma conta ainda. Cole um @ acima ou encontre parecidos.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupos.map((g, i) => (
              <CartaoMarca key={g.chave} g={g} i={i} nuvem={nuvem} soltas={soltas}
                aoPapel={(p) => mudarPapel(g.contas[0], p)} aoContexto={() => setEditando(g.contas[0])}
                aoMaisPosts={() => setMaisPosts(g.contas)} aoColetar={coletarDeNovo}
                aoRemover={() => (g.contas.length > 1 ? removerMarca(g) : remover(g.contas[0]))}
                aoUnir={async (outra) => { try { setContas(await marcasApi.unir([g.contas[0], outra])); tocar('pasta'); toast.success('Contas unidas na mesma marca') } catch (e) { toast.danger('Não deu para unir', { description: (e as Error).message }) } }}
                aoSeparar={async (c) => { setContas(await marcasApi.separar(c)); tocar('clique') }}
                aoRenomear={async () => {
                  const nome = await pedirTexto({ titulo: 'Nome da marca', rotulo: 'Nome', valor: g.nome })
                  if (nome && g.marcaId) setContas(await marcasApi.renomear(g.marcaId, nome))
                }} />
            ))}
          </div>
        )}
      </section>

      <ModalDownload contas={maisPosts ?? []} isOpen={!!maisPosts} onOpenChange={(v) => !v && setMaisPosts(null)} onConfirmar={baixar} />
      {dialogoTexto}
      {editando && (
        <ContextoPerfil aberto editando salvando={salvandoCtx}
          perfil={{ plataforma: editando.plataforma, conta: editando.conta, nome: editando.perfil?.nome || editando.nome, foto: editando.perfil?.foto }}
          inicial={{ papel: editando.papel === 'referencia' ? 'referencia' : 'concorrente', aspectos: editando.aspectos ?? [], nota: editando.nota ?? '' }}
          aoConfirmar={salvarContexto} aoFechar={() => setEditando(null)} />
      )}
    </div>
  )
}

interface Grupo { chave: string; marcaId: number | null; nome: string; papel: 'proprio' | 'concorrente' | 'referencia'; contas: Conta[] }

/** Uma marca = as contas dela nas plataformas (TikTok primeiro). Conta sem marca é um grupo de uma conta só. */
function agrupar(contas: Conta[]): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const c of contas) {
    const k = c.marca_id ? `m${c.marca_id}` : chave(c)
    const g = mapa.get(k) ?? { chave: k, marcaId: c.marca_id ?? null, nome: c.marca || c.perfil?.nome || c.nome, papel: c.papel ?? 'concorrente', contas: [] }
    g.contas.push(c)
    mapa.set(k, g)
  }
  for (const g of mapa.values()) g.contas.sort((a, b) => a.plataforma.localeCompare(b.plataforma) * -1)
  return [...mapa.values()]
}

const NOME_PLAT: Record<Plataforma, string> = { tiktok: 'TikTok', instagram: 'Instagram' }

function CartaoMarca({ g, i, nuvem, soltas, aoPapel, aoContexto, aoMaisPosts, aoColetar, aoRemover, aoUnir, aoSeparar, aoRenomear }: {
  g: Grupo; i: number; nuvem: boolean; soltas: Conta[]
  aoPapel: (p: 'proprio' | 'concorrente' | 'referencia') => void; aoContexto: () => void; aoMaisPosts: () => void
  aoColetar: (c: Conta) => void; aoRemover: () => void; aoUnir: (outra: Conta) => void; aoSeparar: (c: Conta) => void; aoRenomear: () => void
}) {
  const c0 = g.contas[0]
  const marca = g.contas.length > 1
  const plataformas = new Set(g.contas.map((c) => c.plataforma))
  // candidatas a unir: contas soltas de outra plataforma (as de nome parecido primeiro)
  const base = (c0.perfil?.nome || c0.nome || c0.conta).toLowerCase().slice(0, 4)
  const unir = marca ? [] : soltas.filter((o) => !plataformas.has(o.plataforma) && o.conta !== c0.conta)
    .sort((a, b) => Number((b.perfil?.nome || b.nome).toLowerCase().startsWith(base)) - Number((a.perfil?.nome || a.nome).toLowerCase().startsWith(base))).slice(0, 6)
  return (
    <div className="cartao surgir group relative p-4 transition-all hover:-translate-y-0.5" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 -space-x-3">
          {g.contas.map((c) => <div key={c.plataforma} className="rounded-full ring-2 ring-[var(--surface)]"><AvatarConta conta={c} /></div>)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{g.nome}</p>
          <div className="flex items-center gap-2">
            <p className="truncate text-sm text-muted">{marca ? `${g.contas.length} plataformas` : `@${c0.conta}`}</p>
            <Menu titulo={marca ? 'Esta marca é…' : 'Esta conta é…'} alinhar="esquerda" gatilho={(abrir) => (
              <button onClick={(e) => { e.stopPropagation(); abrir() }}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  g.papel === 'proprio' ? 'bg-[var(--menta)]/15 text-[var(--menta)]' : g.papel === 'referencia' ? 'bg-accent/15 text-accent' : 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]'}`}>
                {g.papel === 'proprio' ? 'Meu perfil' : g.papel === 'referencia' ? 'Referência' : 'Concorrente'} ▾
              </button>
            )} itens={[
              { id: 'concorrente', rotulo: 'Concorrente direto', marcado: g.papel === 'concorrente', aoEscolher: () => aoPapel('concorrente') },
              { id: 'referencia', rotulo: 'Referência (inspiração)', marcado: g.papel === 'referencia', aoEscolher: () => aoPapel('referencia') },
              { id: 'proprio', rotulo: 'Meu perfil', marcado: g.papel === 'proprio', aoEscolher: () => aoPapel('proprio') },
              ...(g.papel !== 'proprio' ? [{ id: 'contexto', rotulo: 'Contexto para a IA…', aoEscolher: aoContexto }] : []),
              { id: 'mais', rotulo: 'Buscar mais posts…', aoEscolher: aoMaisPosts },
              ...(marca ? [{ id: 'nome', rotulo: 'Renomear marca…', aoEscolher: aoRenomear }] : []),
              ...(marca ? g.contas.map((c) => ({ id: `sep-${c.plataforma}`, rotulo: `Separar @${c.conta} (${NOME_PLAT[c.plataforma]})`, aoEscolher: () => aoSeparar(c) })) : []),
              ...unir.map((o) => ({ id: `unir-${o.plataforma}-${o.conta}`, rotulo: `Unir com @${o.conta} (${NOME_PLAT[o.plataforma]})`, aoEscolher: () => aoUnir(o) })),
            ]} />
          </div>
        </div>
      </div>
      {g.papel !== 'proprio' && (
        <button onClick={(e) => { e.stopPropagation(); aoContexto() }}
          className="mt-3 line-clamp-2 w-full rounded-xl bg-surface-secondary/50 px-3 py-2 text-left text-xs text-muted transition-colors hover:text-foreground">
          {c0.nota ? `“${c0.nota}”` : c0.aspectos?.length ? `Foco: ${c0.aspectos.length} ${c0.aspectos.length === 1 ? 'aspecto' : 'aspectos'} escolhidos` : '+ Diga à IA o que você vê neste perfil'}
        </button>
      )}
      {g.contas.map((c) => <StatusConta key={c.plataforma} c={c} aoColetar={() => aoColetar(c)} />)}
      {marca ? (
        <div className="mt-4 space-y-2 border-t pt-3 linha-fina">
          {g.contas.map((c) => (
            <div key={c.plataforma} className="grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] items-center gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted"><IconePlataforma plataforma={c.plataforma} className="size-3.5 shrink-0" /><span className="truncate">@{c.conta}</span></span>
              <span className="num" title="Seguidores">{fmtNum(c.perfil?.seguidores)}</span>
              <span className="num" title="Posts">{fmtNum(c.videos)}</span>
              <span className="num truncate text-xs text-muted" title="Mais recente">{c.ultimo ? fmtRelativo(c.ultimo) : '—'}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] gap-2 text-[10px] tracking-wide text-muted uppercase">
            <span /><span>Seguidores</span><span>Posts</span><span>Recente</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 linha-fina">
          <Metrica rotulo="Seguidores" valor={fmtNum(c0.perfil?.seguidores)} />
          <Metrica rotulo="Posts" valor={fmtNum(c0.videos)} />
          <Metrica rotulo="Mais recente" valor={c0.ultimo ? fmtRelativo(c0.ultimo) : '—'} />
        </div>
      )}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
        {c0.videos > 0 && !nuvem && !marca && (
          <Button isIconOnly size="sm" variant="ghost" aria-label="Abrir pasta" onPress={() => api.abrirPasta({ plataforma: c0.plataforma, conta: c0.conta })}><FolderOpen /></Button>
        )}
        <Button isIconOnly size="sm" variant="ghost" aria-label={marca ? 'Remover marca' : 'Remover conta'} onPress={aoRemover}><TrashBin /></Button>
      </div>
    </div>
  )
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-muted uppercase">{rotulo}</p>
      <p className="num text-sm font-medium">{valor}</p>
    </div>
  )
}


/** O que está acontecendo com a conta agora: coletando, analisando, falhou ou ainda sem posts. */
function StatusConta({ c, aoColetar }: { c: Conta; aoColetar: () => void }) {
  const { downloads, ia } = useAtividade()
  const dl = downloads.find((t) => t.plataforma === c.plataforma && t.conta === c.conta)
  const an = ia.find((t) => t.tipo === 'perfil' && t.plataforma === c.plataforma && t.conta === c.conta)
  const parar = (e: React.SyntheticEvent) => e.stopPropagation()
  if (dl && ['na fila', 'listando', 'baixando', 'comentários'].includes(dl.status)) {
    const n = dl.baixados + dl.pulados
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary/60 px-2.5 py-1.5 text-xs">
        <AnimProcesso tipo={dl.status === 'comentários' ? 'comentarios' : 'coleta'} tamanho={20} />
        {dl.status === 'na fila' ? 'Na fila para coletar' : dl.status === 'listando' ? 'Encontrando os posts…'
          : dl.status === 'comentários' ? 'Lendo comentários…' : `Coletando ${n} de ${dl.total}`}
      </p>
    )
  }
  if (an && ['na fila', 'rodando'].includes(an.status)) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary/60 px-2.5 py-1.5 text-xs">
        <AnimProcesso tipo="analise" tamanho={20} /> {an.total > 1 ? `IA analisando ${an.feito} de ${an.total}` : 'IA analisando…'}
      </p>
    )
  }
  if (dl?.status === 'erro' && !c.videos) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-danger/10 px-2.5 py-1.5 text-xs text-danger" onClick={parar}>
        <span className="min-w-0 flex-1 truncate" title={dl.logs.at(-1)}>{(dl.logs.at(-1) ?? 'A coleta falhou').replace(/^\d\d:\d\d:\d\d /, '').replace(/^Erro: /, '')}</span>
        <button onClick={aoColetar} className="shrink-0 font-medium underline">Tentar de novo</button>
      </div>
    )
  }
  if (!c.videos && dl?.status === 'concluído' && dl.baixados + dl.pulados === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--ambar)]/10 px-2.5 py-1.5 text-xs text-[var(--ambar)]" onClick={parar}>
        <span className="min-w-0 flex-1">Sem posts públicos: perfil vazio, privado ou ainda sem publicações</span>
        <button onClick={aoColetar} className="shrink-0 font-medium underline">Verificar de novo</button>
      </div>
    )
  }
  if (!c.videos) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary/60 px-2.5 py-1.5 text-xs text-muted" onClick={parar}>
        <span className="flex-1">Ainda sem posts coletados</span>
        <button onClick={aoColetar} className="font-medium text-accent hover:underline">Coletar agora</button>
      </div>
    )
  }
  return null
}
