import { Button, Checkbox, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowDownToLine, FolderOpen, TrashBin } from '@gravity-ui/icons'
import { useMemo, useState } from 'react'
import { api, type Conta, type Opcoes, type Plataforma } from '../api'
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

type Filtro = 'todas' | Plataforma
const chave = (c: Pick<Conta, 'plataforma' | 'conta'>) => `${c.plataforma}/${c.conta}`

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  aoBaixar: () => void
}

export function TelaContas({ contas, setContas, aoBaixar }: Props) {
  const nuvem = useNuvem()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [papel, setPapel] = useState<'todos' | 'concorrente' | 'referencia'>('todos')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [modalAberto, setModalAberto] = useState(false)
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

  const visiveis = useMemo(() => contas.filter((c) => (filtro === 'todas' || c.plataforma === filtro)
    && (papel === 'todos' || (c.papel ?? 'concorrente') === papel)), [contas, filtro, papel])
  const mudarPapel = async (c: Conta, p: 'proprio' | 'concorrente' | 'referencia') => {
    try {
      setContas(await api.papelConta(c, p))
      tocar('pasta')
    } catch (e) {
      toast.warning('Não dá para mudar o papel', { description: (e as Error).message })
    }
  }
  const escolhidas = contas.filter((c) => selecionadas.has(chave(c)))
  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((c) => selecionadas.has(chave(c)))

  const alternar = (c: Conta) =>
    setSelecionadas((s) => {
      const n = new Set(s)
      if (n.has(chave(c))) n.delete(chave(c))
      else n.add(chave(c))
      return n
    })

  const marcarVisiveis = () =>
    setSelecionadas((s) => {
      const n = new Set(s)
      visiveis.forEach((c) => (todasVisiveisMarcadas ? n.delete(chave(c)) : n.add(chave(c))))
      return n
    })

  async function baixarVideo(url: string) {
    try {
      await api.baixarLink(url)
      toast.success('Vídeo na fila', { description: 'O andamento aparece na central de atividade.' })
      aoBaixar()
    } catch (e) {
      toast.danger('Não deu certo', { description: (e as Error).message })
    }
  }

  async function coletarDeNovo(c: Conta) {
    await api.baixar([c], { modo: 'recentes', quantidade: 30, somente_reels: false, analisar_ao_fim: true })
    tocar('coleta')
    aoBaixar()
  }

  async function remover(c: Conta) {
    setContas(await api.removerConta(c))
    setSelecionadas((s) => {
      const n = new Set(s)
      n.delete(chave(c))
      return n
    })
  }

  async function baixar(opcoes: Opcoes) {
    const r = await api.baixar(escolhidas, opcoes)
    toast.success(`${r.criadas.length} ${r.criadas.length === 1 ? 'conta' : 'contas'} na fila`, {
      description: 'TikTok e Instagram baixam em paralelo.',
    })
    setSelecionadas(new Set())
    aoBaixar()
  }


  return (
    <div className="space-y-10 pb-32">
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

      {/* Lista de contas */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="titulo-display text-2xl font-semibold">Contas</h2>
            <p className="text-sm text-muted">Selecione as contas e escolha o que baixar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-surface-secondary/60 p-0.5 text-sm">
              {([['todos', 'Todos'], ['concorrente', 'Concorrentes'], ['referencia', 'Referências']] as const).map(([k, n]) => (
                <button key={k} onClick={() => setPapel(k)}
                  className={`rounded-full px-3 py-1 transition-colors ${papel === k ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>
                  {n} <span className="num text-xs text-muted">{k === 'todos' ? contas.length : contas.filter((c) => (c.papel ?? 'concorrente') === k).length}</span>
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
            <Button size="sm" variant="tertiary" onPress={marcarVisiveis}>
              {todasVisiveisMarcadas ? 'Desmarcar' : 'Selecionar'} todas
            </Button>
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div className="cartao py-16 text-center text-muted">Nenhuma conta ainda. Cole um @ acima para começar.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((c, i) => {
              const marcada = selecionadas.has(chave(c))
              return (
                <div
                  key={chave(c)}
                  role="button"
                  tabIndex={0}
                  onClick={() => alternar(c)}
                  onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), alternar(c))}
                  className="cartao surgir group relative cursor-pointer p-4 outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent"
                  style={{
                    animationDelay: `${Math.min(i, 12) * 25}ms`,
                    boxShadow: marcada ? '0 0 0 2px var(--accent), var(--card-shadow)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <AvatarConta conta={c} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.perfil?.nome || c.nome}</p>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm text-muted">@{c.conta}</p>
                        <Menu titulo="Esta conta é…" alinhar="esquerda" gatilho={(abrir) => (
                          <button onClick={(e) => { e.stopPropagation(); abrir() }}
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              c.papel === 'proprio' ? 'bg-[var(--menta)]/15 text-[var(--menta)]' : c.papel === 'referencia' ? 'bg-accent/15 text-accent' : 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]'}`}>
                            {c.papel === 'proprio' ? 'Meu perfil' : c.papel === 'referencia' ? 'Referência' : 'Concorrente'} ▾
                          </button>
                        )} itens={[
                          { id: 'concorrente', rotulo: 'Concorrente direto', marcado: (c.papel ?? 'concorrente') === 'concorrente', aoEscolher: () => mudarPapel(c, 'concorrente') },
                          { id: 'referencia', rotulo: 'Referência (inspiração)', marcado: c.papel === 'referencia', aoEscolher: () => mudarPapel(c, 'referencia') },
                          { id: 'proprio', rotulo: 'Meu perfil', marcado: c.papel === 'proprio', aoEscolher: () => mudarPapel(c, 'proprio') },
                          ...(c.papel !== 'proprio' ? [{ id: 'contexto', rotulo: 'Contexto para a IA…', aoEscolher: () => setEditando(c) }] : []),
                        ]} />
                      </div>
                    </div>
                    <Checkbox
                      isSelected={marcada}
                      onChange={() => alternar(c)}
                      aria-label={`Selecionar ${c.conta}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                  </div>
                  {c.papel !== 'proprio' && (
                    <button onClick={(e) => { e.stopPropagation(); setEditando(c) }}
                      className="mt-3 line-clamp-2 w-full rounded-xl bg-surface-secondary/50 px-3 py-2 text-left text-xs text-muted transition-colors hover:text-foreground">
                      {c.nota ? `“${c.nota}”` : c.aspectos?.length ? `Foco: ${c.aspectos.length} ${c.aspectos.length === 1 ? 'aspecto' : 'aspectos'} escolhidos` : '+ Diga à IA o que você vê neste perfil'}
                    </button>
                  )}
                  <StatusConta c={c} aoColetar={() => coletarDeNovo(c)} />
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 linha-fina">
                    <Metrica rotulo="Seguidores" valor={fmtNum(c.perfil?.seguidores)} />
                    <Metrica rotulo={nuvem ? "Catalogados" : "Baixados"} valor={fmtNum(c.videos)} />
                    <Metrica rotulo="Mais recente" valor={c.ultimo ? fmtRelativo(c.ultimo) : '—'} />
                  </div>
                  <div className="absolute top-3 right-12 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {c.videos > 0 && !nuvem && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label="Abrir pasta"
                        onPress={() => api.abrirPasta({ plataforma: c.plataforma, conta: c.conta })}
                      >
                        <FolderOpen />
                      </Button>
                    )}
                    <Button isIconOnly size="sm" variant="ghost" aria-label="Remover conta" onPress={() => remover(c)}>
                      <TrashBin />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Barra de ação flutuante */}
      <div
        className={`fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 transition-all duration-300 ${
          escolhidas.length ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
        }`}
      >
        <div className="vidro flex items-center gap-4 rounded-full border py-2 pr-2 pl-5 shadow-xl linha-fina">
          <span className="text-sm">
            <span className="num font-semibold">{escolhidas.length}</span>{' '}
            {escolhidas.length === 1 ? 'conta selecionada' : 'contas selecionadas'}
          </span>
          <Button size="sm" variant="tertiary" className="rounded-full" onPress={() => setSelecionadas(new Set())}>
            Limpar
          </Button>
          <Button size="sm" className="rounded-full" onPress={() => setModalAberto(true)}>
            <ArrowDownToLine />
            Baixar…
          </Button>
        </div>
      </div>

      <ModalDownload contas={escolhidas} isOpen={modalAberto} onOpenChange={setModalAberto} onConfirmar={baixar} />
      {editando && (
        <ContextoPerfil aberto editando salvando={salvandoCtx}
          perfil={{ plataforma: editando.plataforma, conta: editando.conta, nome: editando.perfil?.nome || editando.nome, foto: editando.perfil?.foto }}
          inicial={{ papel: editando.papel === 'referencia' ? 'referencia' : 'concorrente', aspectos: editando.aspectos ?? [], nota: editando.nota ?? '' }}
          aoConfirmar={salvarContexto} aoFechar={() => setEditando(null)} />
      )}
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
  if (!c.videos && c.papel !== 'proprio') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary/60 px-2.5 py-1.5 text-xs text-muted" onClick={parar}>
        <span className="flex-1">Ainda sem posts coletados</span>
        <button onClick={aoColetar} className="font-medium text-accent hover:underline">Coletar agora</button>
      </div>
    )
  }
  return null
}
