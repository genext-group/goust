import { Button, Checkbox, Input, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowDownToLine, FolderOpen, Link, Plus, TrashBin } from '@gravity-ui/icons'
import { useMemo, useState } from 'react'
import { api, interpretarEntrada, type Conta, type Opcoes, type Plataforma } from '../api'
import { AvatarConta } from '../components/Avatar'
import { ModalDownload } from '../components/ModalDownload'
import { IconePlataforma } from '../components/Plataforma'
import { fmtNum, fmtRelativo } from '../formato'

type Filtro = 'todas' | Plataforma
const chave = (c: Pick<Conta, 'plataforma' | 'conta'>) => `${c.plataforma}/${c.conta}`

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  aoBaixar: () => void
}

export function TelaContas({ contas, setContas, aoBaixar }: Props) {
  const [entrada, setEntrada] = useState('')
  const [plataformaArroba, setPlataformaArroba] = useState<Plataforma>('tiktok')
  const [ocupado, setOcupado] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [modalAberto, setModalAberto] = useState(false)

  const tipo = interpretarEntrada(entrada)
  const visiveis = useMemo(() => contas.filter((c) => filtro === 'todas' || c.plataforma === filtro), [contas, filtro])
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

  async function enviar() {
    const t = entrada.trim()
    if (!t) return
    setOcupado(true)
    try {
      if (tipo.tipo === 'video') {
        await api.baixarLink(t)
        toast.success('Vídeo na fila', { description: 'Acompanhe em Downloads.' })
        aoBaixar()
      } else {
        const antes = contas.length
        const novas = await api.adicionarConta(t, tipo.plataforma ?? plataformaArroba)
        setContas(novas)
        toast.success(novas.length > antes ? 'Conta adicionada' : 'Essa conta já está na lista')
      }
      setEntrada('')
    } catch (e) {
      toast.danger('Não deu certo', { description: (e as Error).message })
    } finally {
      setOcupado(false)
    }
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

  const rotuloBotao = tipo.tipo === 'video' ? 'Baixar vídeo' : 'Adicionar'

  return (
    <div className="space-y-10 pb-32">
      {/* Hero */}
      <section className="surgir mx-auto max-w-2xl pt-6 text-center">
        <h1 className="titulo-display text-4xl font-semibold sm:text-5xl">Referências, sem esforço.</h1>
        <p className="mt-3 text-lg text-muted">
          Cole um @, o link de um perfil ou de um vídeo do TikTok ou do Instagram.
        </p>
        <form
          className="cartao mt-8 flex flex-wrap items-center gap-2 p-2 sm:flex-nowrap"
          onSubmit={(e) => {
            e.preventDefault()
            enviar()
          }}
        >
          <span className="pl-2 text-muted">
            {tipo.plataforma ? <IconePlataforma plataforma={tipo.plataforma} /> : <Link />}
          </span>
          <Input
            aria-label="Conta ou link"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="@conta, tiktok.com/@conta ou link do Reel"
            className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus:ring-0"
          />
          {tipo.tipo === 'arroba' && entrada.trim() && (
            <ToggleButtonGroup
              size="sm"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[plataformaArroba]}
              onSelectionChange={(k) => setPlataformaArroba([...k][0] as Plataforma)}
              aria-label="Plataforma do @"
            >
              <ToggleButton id="tiktok">TikTok</ToggleButton>
              <ToggleButton id="instagram">
                <ToggleButtonGroup.Separator />
                Instagram
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          <Button type="submit" isDisabled={!entrada.trim()} isPending={ocupado} className="shrink-0 rounded-xl">
            {tipo.tipo === 'video' ? <ArrowDownToLine /> : <Plus />}
            <span className="hidden sm:inline">{rotuloBotao}</span>
          </Button>
        </form>
      </section>

      {/* Lista de contas */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="titulo-display text-2xl font-semibold">Contas</h2>
            <p className="text-sm text-muted">Selecione as contas e escolha o que baixar.</p>
          </div>
          <div className="flex items-center gap-2">
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
                      <p className="truncate text-sm text-muted">@{c.conta}</p>
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
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 linha-fina">
                    <Metrica rotulo="Seguidores" valor={fmtNum(c.perfil?.seguidores)} />
                    <Metrica rotulo="Baixados" valor={fmtNum(c.videos)} />
                    <Metrica rotulo="Mais recente" valor={c.ultimo ? fmtRelativo(c.ultimo) : '—'} />
                  </div>
                  <div className="absolute top-3 right-12 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {c.videos > 0 && (
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
