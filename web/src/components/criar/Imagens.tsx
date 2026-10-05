import { Button, Label, Modal, TextArea, TextField, toast } from '@heroui/react'
import { ArrowDownToLine, ArrowsRotateRight, Heart, HeartFill, Palette, Sparkles, TrashBin } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { criacao, type Estilo, type FormatoImagem, type Imagem } from '../../api'
import type { PedidoImagem } from '../../telas/Criar'
import { tocar } from '../../sons'
import { Radar } from '../Animacoes'
import { AnimProcesso, Explosao } from '../AnimProcessos'
import { useAoConcluir, useAtividade } from '../Atividade'
import { Menu } from '../Menu'

const PROPORCAO: Record<string, string> = { post: 'aspect-[4/5]', quadrado: 'aspect-square', story: 'aspect-[9/16]', paisagem: 'aspect-video' }
const ROTULO: Record<string, string> = { post: 'Post 4:5', quadrado: '1:1', story: 'Story 9:16', paisagem: '16:9' }
const FORMA: Record<string, [number, number]> = { post: [12, 15], quadrado: [14, 14], story: [10, 17], paisagem: [18, 10] }
const QUALIDADES = [
  { id: 'rascunho', nome: 'Rascunho', dica: 'rápido, para testar ideias' },
  { id: 'padrao', nome: 'Padrão', dica: 'bom para publicar' },
  { id: 'alta', nome: 'Alta', dica: 'mais detalhe, demora mais' },
]
const EXEMPLOS = [
  'Capa de carrossel: "5 erros que travam suas vendas no delivery", título grande, fundo chapado',
  'Foto de produto em mesa de madeira, luz natural da manhã, espaço livre no topo para título',
  'Thumbnail para Reels com a frase "Ninguém te contou isso" em destaque',
]

export function Imagens({ pedidoInicial, aoConsumirPedido, irParaEstilos }: {
  pedidoInicial: PedidoImagem | null; aoConsumirPedido: () => void; irParaEstilos: () => void
}) {
  const [imagens, setImagens] = useState<Imagem[] | null>(null)
  const [estilos, setEstilos] = useState<Estilo[]>([])
  const [formatos, setFormatos] = useState<FormatoImagem[]>([])
  const [pedido, setPedido] = useState('')
  const [estilo, setEstilo] = useState<number | null>(null)
  const [formato, setFormato] = useState('post')
  const [qualidade, setQualidade] = useState('padrao')
  const [quantidade, setQuantidade] = useState(1)
  const [conteudo, setConteudo] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'favoritas'>('todas')
  const [aberta, setAberta] = useState<Imagem | null>(null)
  const [novas, setNovas] = useState<Set<number>>(new Set())
  const conhecidas = useRef<Set<number> | null>(null)
  const { ia: tarefas, recarregar } = useAtividade()
  const pendentes = tarefas.filter((t) => t.tipo === 'imagem' && ['na fila', 'rodando'].includes(t.status))

  const carregar = useCallback(() => criacao.imagens().then((xs) => {
    if (conhecidas.current) setNovas(new Set(xs.filter((x) => !conhecidas.current!.has(x.id)).map((x) => x.id)))
    conhecidas.current = new Set(xs.map((x) => x.id))
    setImagens(xs)
  }).catch(() => setImagens([])), [])
  useEffect(() => {
    carregar()
    criacao.estilos().then((r) => { setEstilos(r.estilos); setFormatos(r.formatos) }).catch(() => {})
  }, [carregar])
  useEffect(() => {
    if (!pedidoInicial) return
    setPedido(pedidoInicial.pedido)
    if (pedidoInicial.estilo_id !== undefined) setEstilo(pedidoInicial.estilo_id ?? null)
    if (pedidoInicial.formato) setFormato(pedidoInicial.formato)
    setConteudo(pedidoInicial.conteudo_id ?? null)
    aoConsumirPedido()
  }, [pedidoInicial, aoConsumirPedido])
  useAoConcluir(['imagem'], (t) => {
    if (t.status === 'erro') toast.danger('A imagem não saiu', { description: t.erro ?? '' })
    carregar()
  })

  const gerar = async () => {
    if (!pedido.trim()) return
    setEnviando(true)
    try {
      await criacao.gerarImagem({ pedido, estilo_id: estilo, formato, qualidade, quantidade, conteudo_id: conteudo })
      recarregar()
    } catch (e) { toast.danger('Não deu para gerar', { description: (e as Error).message }) } finally { setEnviando(false) }
  }
  const favoritar = async (i: Imagem) => {
    if (!i.favorita) tocar('favorito')
    setImagens((xs) => xs?.map((x) => (x.id === i.id ? { ...x, favorita: !x.favorita } : x)) ?? xs)
    setAberta((a) => (a?.id === i.id ? { ...a, favorita: !a.favorita } : a))
    await criacao.favoritarImagem(i.id, !i.favorita)
  }
  const apagar = async (i: Imagem) => {
    setImagens((xs) => xs?.filter((x) => x.id !== i.id) ?? xs)
    setAberta(null)
    await criacao.apagarImagem(i.id)
  }
  const variar = (i: Imagem) => {
    setPedido(i.prompt); setEstilo(i.estilo_id); setFormato(i.formato || 'post'); setAberta(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const virarReferencia = async (i: Imagem, e: Estilo) => {
    try {
      setEstilos(await criacao.refDaImagem(e.id, i.id))
      tocar('pasta')
      toast.success(`Agora é referência de "${e.nome}"`, { description: 'O estilo vai ficando mais parecido com o que você aprova.' })
    } catch (err) { toast.danger('Não deu', { description: (err as Error).message }) }
  }
  const lista = (imagens ?? []).filter((i) => filtro === 'todas' || i.favorita)
  const estiloAtual = estilos.find((e) => e.id === estilo)

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* compositor */}
      <aside className="cartao h-fit space-y-5 p-5 lg:sticky lg:top-24">
        <TextField value={pedido} onChange={setPedido}>
          <Label>O que você quer criar?</Label>
          <TextArea className="min-h-32" placeholder="Descreva a peça: tema, texto que deve aparecer, o que mostrar…" />
        </TextField>
        {!pedido && (
          <div className="flex flex-col gap-1.5">
            {EXEMPLOS.map((x) => (
              <button key={x} onClick={() => setPedido(x)} className="rounded-xl bg-surface-secondary/60 px-3 py-2 text-left text-xs leading-relaxed text-muted transition-colors hover:text-foreground">{x}</button>
            ))}
          </div>
        )}
        {conteudo && <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent">Vai ficar ligada ao conteúdo do calendário.</p>}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Estilo visual</p>
            <button onClick={irParaEstilos} className="text-xs text-accent hover:underline">Gerenciar estilos</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setEstilo(null)}
              className={`grid h-16 w-14 shrink-0 place-items-center rounded-xl border text-[11px] text-muted ${estilo === null ? 'border-accent ring-2 ring-accent/30' : 'linha-fina'}`}>Livre</button>
            {estilos.map((e) => (
              <button key={e.id} onClick={() => setEstilo(e.id)} title={e.nome}
                className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border ${estilo === e.id ? 'border-accent ring-2 ring-accent/30' : 'linha-fina'}`}>
                {e.refs[0] ? <img src={e.refs[0].url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center bg-surface-secondary"><Palette className="size-4 text-muted" /></span>}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">{e.nome}</span>
              </button>
            ))}
          </div>
          {estiloAtual?.guia && (
            <div className="mt-2 flex gap-1">{estiloAtual.guia.paleta.slice(0, 7).map((c) => <span key={c.hex} className="h-2 flex-1 rounded-full" style={{ background: c.hex }} />)}</div>
          )}
          {estiloAtual && !estiloAtual.refs.length && <p className="mt-2 text-xs text-warning">Este estilo ainda não tem referências.</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Formato</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(formatos.length ? formatos : [{ id: 'post', nome: 'Post 4:5', tamanho: '' }]).map((f) => {
              const [w, h] = FORMA[f.id] ?? [12, 15]
              return (
                <button key={f.id} onClick={() => setFormato(f.id)} title={f.nome}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[11px] transition-colors ${formato === f.id ? 'bg-accent/12 text-foreground ring-1 ring-accent/50' : 'bg-surface-secondary/60 text-muted hover:text-foreground'}`}>
                  <span className="grid h-5 place-items-center"><span className="rounded-[3px] border-2 border-current" style={{ width: w, height: h }} /></span>
                  {ROTULO[f.id] ?? f.nome}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div>
            <p className="mb-2 text-sm font-medium">Qualidade</p>
            <div className="flex rounded-xl bg-surface-secondary/60 p-0.5">
              {QUALIDADES.map((q) => (
                <button key={q.id} onClick={() => setQualidade(q.id)} title={q.dica}
                  className={`flex-1 rounded-[10px] py-1.5 text-xs transition-colors ${qualidade === q.id ? 'bg-surface font-medium shadow-sm' : 'text-muted'}`}>{q.nome}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Quantas</p>
            <div className="flex rounded-xl bg-surface-secondary/60 p-0.5">
              {[1, 2, 4].map((n) => (
                <button key={n} onClick={() => setQuantidade(n)}
                  className={`num w-8 rounded-[10px] py-1.5 text-xs ${quantidade === n ? 'bg-surface font-medium shadow-sm' : 'text-muted'}`}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <Button className="botao-sinal w-full" size="lg" isPending={enviando} isDisabled={!pedido.trim()} onPress={gerar}>
          <Sparkles /> Gerar {quantidade > 1 ? `${quantidade} imagens` : 'imagem'}
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-muted">
          GPT Image 2.5. Das referências vem só o estilo; logos, marcas e personagens de terceiros não são copiados.
        </p>
      </aside>

      {/* galeria */}
      <section className="min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          {(['todas', 'favoritas'] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${filtro === f ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {f === 'todas' ? 'Todas' : 'Favoritas'}
            </button>
          ))}
          <span className="num ml-auto text-sm text-muted">{lista.length} imagens</span>
        </div>

        {imagens === null ? <div className="carregando h-80" /> : lista.length === 0 && pendentes.length === 0 ? (
          <div className="cartao flex flex-col items-center px-6 py-16 text-center">
            <div className="text-foreground"><Radar /></div>
            <h3 className="titulo-display mt-2 text-xl font-semibold">{filtro === 'favoritas' ? 'Nenhuma favorita ainda' : 'Sua primeira imagem começa aqui'}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Descreva a peça ao lado. Para ficar com a cara da sua marca, crie um estilo visual com 4 a 8 referências.
            </p>
          </div>
        ) : (
          <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
            {pendentes.map((t) => (
              <div key={t.id} className={`magico ${PROPORCAO[(t.params?.formato as string) ?? 'post'] ?? 'aspect-[4/5]'} flex break-inside-avoid flex-col items-center justify-center gap-3 rounded-2xl p-4 text-center`}>
                <span className="text-foreground"><AnimProcesso tipo="geracao" tamanho={56} /></span>
                <p className="text-xs text-muted">{t.status === 'na fila' ? 'Na fila…' : t.etapa}</p>
              </div>
            ))}
            {lista.map((i) => (
              <figure key={i.id} className="group relative break-inside-avoid overflow-hidden rounded-2xl bg-surface-secondary">
                <button onClick={() => setAberta(i)} className="block w-full">
                  <img src={i.url} alt={i.prompt} loading="lazy" className={`w-full ${novas.has(i.id) ? 'anim-revelar' : ''}`} />
                </button>
                {novas.has(i.id) && <span className="pointer-events-none absolute inset-0 grid place-items-center"><Explosao tamanho={120} /></span>}
                <div className="absolute inset-x-0 top-0 flex justify-end gap-1 p-2 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
                  <AcaoImagem rotulo={i.favorita ? 'Desfavoritar' : 'Favoritar'} onPress={() => favoritar(i)}>
                    {i.favorita ? <HeartFill className="anim-coracao text-[#ff4d6d]" /> : <Heart />}
                  </AcaoImagem>
                </div>
                {i.favorita && <HeartFill className="absolute top-3 left-3 size-4 text-[#ff4d6d] drop-shadow group-hover:opacity-0" />}
              </figure>
            ))}
          </div>
        )}
      </section>

      <Modal.Backdrop isOpen={!!aberta} onOpenChange={(v) => !v && setAberta(null)}>
        <Modal.Container size="lg">
          <Modal.Dialog className="w-full max-w-[980px] overflow-hidden p-0 sm:max-w-[980px]">
            <Modal.CloseTrigger className="z-10" />
            {aberta && (
              <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
                <div className="grid place-items-center bg-black/90 p-3"><img src={aberta.url} alt="" className="max-h-[78vh] w-auto rounded-lg" /></div>
                <div className="flex flex-col gap-4 p-6">
                  <div>
                    <p className="text-xs text-muted uppercase">Pedido</p>
                    <p className="mt-1 text-sm leading-relaxed">{aberta.prompt}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">Estilo</dt><dd>{aberta.estilo ?? 'Livre'}</dd></div>
                    <div><dt className="text-xs text-muted">Qualidade</dt><dd className="capitalize">{aberta.qualidade}</dd></div>
                  </dl>
                  <div className="mt-auto grid gap-2">
                    <a href={aberta.url} download={`imagem-${aberta.id}.webp`} className="botao-sinal flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium">
                      <ArrowDownToLine className="size-4" /> Baixar
                    </a>
                    <Button variant="tertiary" onPress={() => favoritar(aberta)}>{aberta.favorita ? <HeartFill className="text-[#ff4d6d]" /> : <Heart />} {aberta.favorita ? 'Favorita' : 'Favoritar'}</Button>
                    <Button variant="tertiary" onPress={() => variar(aberta)}><ArrowsRotateRight /> Fazer variação</Button>
                    {estilos.length > 0 && (
                      <Menu titulo="Usar como referência do estilo" alinhar="esquerda" className="w-full" gatilho={(abrir) => (
                        <Button variant="tertiary" className="w-full" onPress={abrir}><Palette /> Virar referência de estilo</Button>
                      )} itens={estilos.map((e) => ({ id: e.id, rotulo: e.nome, aoEscolher: () => virarReferencia(aberta, e) }))} />
                    )}
                    <Button variant="ghost" className="text-danger" onPress={() => apagar(aberta)}><TrashBin /> Apagar</Button>
                  </div>
                </div>
              </div>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}

function AcaoImagem({ rotulo, onPress, children }: { rotulo: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={rotulo} title={rotulo} onClick={(e) => { e.stopPropagation(); onPress() }}
      className="grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition-transform hover:scale-110 [&_svg]:size-4">
      {children}
    </button>
  )
}
