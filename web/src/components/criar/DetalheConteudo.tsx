import { Button, Drawer, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { ArrowsRotateRight, Copy, MagicWand, Picture, Sparkles, TrashBin } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { criacao, type Conteudo, type Imagem, type StatusConteudo } from '../../api'
import type { PedidoImagem } from '../../telas/Criar'
import { tocar } from '../../sons'
import { AnimProcesso } from '../AnimProcessos'
import { useAoConcluir, useAtividade } from '../Atividade'
import { FORMATOS, STATUS } from './comum'
import { SeletorData } from '../ui/SeletorData'

const copiar = (texto: string, o_que = 'Copiado') => {
  navigator.clipboard.writeText(texto).then(() => { tocar('pasta'); toast(o_que) }).catch(() => {})
}

export function DetalheConteudo({ conteudo, novo, dataNovo, aoFechar, aoMudar, aoGerarImagem }: {
  conteudo: Conteudo | null; novo: boolean; dataNovo: string | null
  aoFechar: () => void; aoMudar: (c: Conteudo | null) => void; aoGerarImagem: (p: PedidoImagem) => void
}) {
  const aberto = novo || !!conteudo
  const [f, setF] = useState({ titulo: '', data: '', formato: 'reel', pilar: '', status: 'ideia' as StatusConteudo, gancho: '', ideia: '' })
  const [pedido, setPedido] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [imagens, setImagens] = useState<Imagem[]>([])
  const { ia: tarefas, recarregar } = useAtividade()
  const escrevendo = conteudo && tarefas.find((t) => t.tipo === 'roteiro' && t.params?.alvo === conteudo.id && ['na fila', 'rodando'].includes(t.status))

  useEffect(() => {
    if (conteudo) {
      setF({ titulo: conteudo.titulo, data: conteudo.data ?? '', formato: conteudo.formato ?? 'reel', pilar: conteudo.pilar ?? '',
        status: conteudo.status, gancho: conteudo.dados.gancho ?? '', ideia: conteudo.dados.ideia ?? '' })
      criacao.imagens().then((xs) => setImagens(xs.filter((i) => i.conteudo_id === conteudo.id))).catch(() => {})
    } else if (novo) {
      setF({ titulo: '', data: dataNovo ?? '', formato: 'reel', pilar: '', status: 'ideia', gancho: '', ideia: '' })
      setImagens([])
    }
    setPedido('')
  }, [conteudo, novo, dataNovo])
  useAoConcluir(['roteiro'], async (t) => {
    if (conteudo && t.params?.alvo === conteudo.id && t.status === 'concluído') aoMudar(await criacao.atualizarConteudo(conteudo.id, {}))
  })

  const salvar = async (fechar = false) => {
    if (!f.titulo.trim()) { toast.danger('Dê um título ao conteúdo'); return undefined }
    setSalvando(true)
    try {
      const corpo = { titulo: f.titulo, data: f.data || null, formato: f.formato, pilar: f.pilar, status: f.status }
      const r = novo
        ? await criacao.criarConteudo({ ...corpo, gancho: f.gancho, ideia: f.ideia })
        : await criacao.atualizarConteudo(conteudo!.id, { ...corpo, dados: { gancho: f.gancho, ideia: f.ideia } })
      aoMudar(fechar ? null : r)
      if (fechar) aoFechar()
      return r
    } catch (e) { toast.danger('Não deu para salvar', { description: (e as Error).message }) } finally { setSalvando(false) }
  }
  const escrever = async () => {
    const c = novo ? await salvar() : (await salvar(), conteudo)
    if (!c) return
    await criacao.gerarRoteiro(c.id, pedido)
    recarregar()
  }
  const apagar = async () => {
    if (!conteudo) return
    await criacao.apagarConteudo(conteudo.id)
    aoMudar(null); aoFechar()
  }
  const r = conteudo?.roteiro

  return (
    <Drawer.Backdrop isOpen={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-full w-screen max-w-full flex-col sm:w-[640px]">
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading className="titulo-display text-lg font-semibold">{novo ? 'Nova ideia' : 'Conteúdo'}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body data-rolavel="y" className="flex-1 space-y-6 overflow-y-auto">
            <TextField value={f.titulo} onChange={(v) => setF({ ...f, titulo: v })}>
              <Label className="sr-only">Título</Label>
              <Input placeholder="Título do conteúdo" className="titulo-display h-12 text-xl font-semibold" />
            </TextField>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS) as StatusConteudo[]).map((s) => (
                <button key={s} onClick={() => setF({ ...f, status: s })}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${f.status === s ? 'border-transparent bg-surface-secondary font-medium' : 'linha-fina text-muted hover:text-foreground'}`}>
                  <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />{STATUS[s].nome}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SeletorData rotulo="Data" valor={f.data || null} aoMudar={(v) => setF({ ...f, data: v ?? '' })} placeholder="Sem data" />
              <div>
                <p className="mb-1.5 text-sm font-medium">Formato</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(FORMATOS).map(([k, { nome: n }]) => (
                    <button key={k} onClick={() => setF({ ...f, formato: k })}
                      className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${f.formato === k ? 'botao-sinal' : 'bg-surface-secondary text-muted hover:text-foreground'}`}>{n}</button>
                  ))}
                </div>
              </div>
              <TextField value={f.pilar} onChange={(v) => setF({ ...f, pilar: v })}>
                <Label>Pilar</Label><Input placeholder="Ex.: Educação" />
              </TextField>
            </div>

            <TextField value={f.gancho} onChange={(v) => setF({ ...f, gancho: v })}>
              <Label>Gancho</Label><TextArea className="min-h-16" placeholder="A primeira frase ou tela" />
            </TextField>
            <TextField value={f.ideia} onChange={(v) => setF({ ...f, ideia: v })}>
              <Label>Ideia</Label><TextArea className="min-h-20" placeholder="O que mostrar e por que vai funcionar" />
            </TextField>

            {/* roteiro */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="titulo-display text-lg font-semibold">Roteiro</h3>
                {r && !escrevendo && <span className="text-xs text-muted">{r.duracao_segundos ? `~${r.duracao_segundos}s` : `${r.slides.length} slides`}</span>}
              </div>

              {escrevendo ? (
                <div className="magico flex items-center gap-4 rounded-2xl p-5">
                  <span className="grid size-14 place-items-center rounded-2xl bg-surface/70 text-foreground"><AnimProcesso tipo="geracao" tamanho={44} /></span>
                  <div>
                    <p className="font-medium">{escrevendo.status === 'na fila' ? 'Na fila…' : 'Escrevendo o roteiro…'}</p>
                    <p className="text-sm text-muted">Com o seu tom de voz e os ganchos que funcionam no seu mercado.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-2xl bg-surface-secondary/60 p-3 sm:flex-row">
                  <Input aria-label="Pedido para a IA" value={pedido} onChange={(e) => setPedido(e.target.value)} className="flex-1"
                    placeholder={r ? 'Ajuste: ex. "mais curto", "com humor", "sem aparecer o rosto"' : 'Algum pedido? (opcional)'} />
                  <Button className={r ? '' : 'botao-sinal'} variant={r ? 'tertiary' : undefined} isDisabled={!f.titulo.trim()} onPress={escrever}>
                    {r ? <><ArrowsRotateRight /> Reescrever</> : <><MagicWand /> Escrever roteiro com IA</>}
                  </Button>
                </div>
              )}

              {r && !escrevendo && (
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-xs tracking-wide text-muted uppercase">Escolha um gancho</p>
                    <div className="space-y-1.5">
                      {r.ganchos.map((g) => (
                        <button key={g.texto} onClick={() => { setF({ ...f, gancho: g.texto }); copiar(g.texto, 'Gancho copiado') }}
                          className={`w-full rounded-xl p-3 text-left transition-colors ${f.gancho === g.texto ? 'bg-accent/12 ring-1 ring-accent/50' : 'bg-surface-secondary/60 hover:bg-surface-secondary'}`}>
                          <span className="block font-medium">“{g.texto}”</span>
                          <span className="text-xs text-muted">{g.estilo}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {r.cenas.length > 0 && (
                    <ol className="relative space-y-3 border-l-2 pl-5 linha-fina">
                      {r.cenas.map((c, i) => (
                        <li key={i} className="relative">
                          <span className="absolute top-1 -left-[27px] size-3 rounded-full botao-sinal" />
                          <p className="num text-xs text-accent">{c.tempo}</p>
                          <p className="mt-0.5 leading-relaxed font-medium">{c.fala}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted">{c.visual}</p>
                          {c.texto_na_tela && <span className="mt-1.5 inline-block rounded-md bg-surface-secondary px-2 py-0.5 text-xs">Na tela: {c.texto_na_tela}</span>}
                        </li>
                      ))}
                    </ol>
                  )}

                  {r.slides.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {r.slides.map((s, i) => (
                        <div key={i} className="rounded-2xl bg-surface-secondary/60 p-3">
                          <p className="num text-xs text-accent">Slide {i + 1}</p>
                          <p className="mt-0.5 font-medium">{s.titulo}</p>
                          <p className="mt-1 text-sm leading-relaxed">{s.texto}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">{s.visual}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl bg-surface-secondary/60 p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs tracking-wide text-muted uppercase">Legenda</p>
                      <Button size="sm" variant="ghost" onPress={() => copiar(`${r.legenda}\n\n${r.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`, 'Legenda copiada')}><Copy /> Copiar</Button>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.legenda}</p>
                    <p className="mt-2 text-sm text-accent">{r.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}</p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted uppercase">CTA</dt><dd className="mt-0.5 leading-relaxed">{r.cta}</dd></div>
                    <div><dt className="text-xs text-muted uppercase">Por que vai funcionar</dt><dd className="mt-0.5 leading-relaxed">{r.por_que_vai_funcionar}</dd></div>
                  </dl>
                  {r.dicas_de_gravacao.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted uppercase">Dicas de produção</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{r.dicas_de_gravacao.map((d) => <li key={d}>{d}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* imagens */}
            {!novo && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="titulo-display text-lg font-semibold">Capa e imagens</h3>
                  <Button size="sm" variant="tertiary" onPress={() => { aoFechar(); aoGerarImagem({
                    pedido: r?.prompt_da_capa || `Capa para "${f.titulo}". ${f.gancho}`, conteudo_id: conteudo!.id,
                    formato: f.formato === 'story' || f.formato === 'reel' ? 'story' : 'post' }) }}>
                    <Picture /> Gerar capa com IA
                  </Button>
                </div>
                {imagens.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {imagens.map((i) => <a key={i.id} href={i.url} target="_blank" rel="noreferrer"><img src={i.url} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" /></a>)}
                  </div>
                )}
              </section>
            )}
          </Drawer.Body>
          <Drawer.Footer className="flex items-center justify-between">
            {!novo ? <Button variant="ghost" className="text-danger" onPress={apagar}><TrashBin /> Apagar</Button> : <span />}
            <Button className="botao-sinal" isPending={salvando} onPress={() => salvar(true)}><Sparkles /> {novo ? 'Criar' : 'Salvar'}</Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}
