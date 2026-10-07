import { Button, Input, toast } from '@heroui/react'
import { ArrowUpFromLine, Copy, Picture, Plus, Sparkles, TrashBin, Xmark } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { criacao, type Conta, type Estilo } from '../../api'
import { tocar } from '../../sons'
import { AnimProcesso } from '../AnimProcessos'
import { useAoConcluir, useAtividade } from '../Atividade'
import { SeletorPosts } from './SeletorPosts'
import { useConfirmar } from '../ui/Confirmar'
import { Ilustracao } from '../Ilustracao'

/** Reduz no navegador (máx. 1600 px, JPEG) antes de enviar: upload rápido e dentro do limite do servidor. */
async function reduzir(arquivo: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(arquivo)
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * escala)
    c.height = Math.round(bmp.height * escala)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88))
    return blob ? new File([blob], arquivo.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : arquivo
  } catch {
    return arquivo
  }
}

export function Estilos({ contas, versaoBiblioteca, aoGerar }: { contas: Conta[]; versaoBiblioteca: number; aoGerar: (estilo: number) => void }) {
  const { confirmacao, confirmar } = useConfirmar()
  const [estilos, setEstilos] = useState<Estilo[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [seletor, setSeletor] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const { ia: tarefas, recarregar } = useAtividade()

  const carregar = useCallback(() => criacao.estilos().then((r) => {
    setEstilos(r.estilos)
    setSel((s) => s ?? r.estilos[0]?.id ?? null)
  }).catch(() => setEstilos([])), [])
  useEffect(() => { carregar() }, [carregar])
  useAoConcluir(['estilo'], (t) => {
    carregar()
    if (t.status === 'erro') toast.danger('Não deu para ler o estilo', { description: t.erro ?? '' })
  })

  const e = estilos?.find((x) => x.id === sel) ?? null
  useEffect(() => { setNome(e?.nome ?? '') }, [e?.id, e?.nome])
  const lendo = e && tarefas.find((t) => t.tipo === 'estilo' && t.params?.alvo === e.id && ['na fila', 'rodando'].includes(t.status))

  const criar = async () => {
    const r = await criacao.criarEstilo(`Estilo ${(estilos?.length ?? 0) + 1}`)
    setEstilos(r.estilos); setSel(r.id); tocar('pasta')
  }
  const enviar = async (lista: FileList | File[]) => {
    if (!e) return
    const arquivos = [...lista].filter((f) => f.type.startsWith('image/'))
    if (!arquivos.length) return
    setEnviando(true)
    try {
      const reduzidos = await Promise.all(arquivos.map(reduzir))
      for (let i = 0; i < reduzidos.length; i += 4) setEstilos(await criacao.enviarRefs(e.id, reduzidos.slice(i, i + 4)))
      tocar('pasta')
    } catch (err) { toast.danger('Não deu para enviar', { description: (err as Error).message }) } finally { setEnviando(false) }
  }
  const remover = async (ref: number) => { if (e) setEstilos(await criacao.removerRef(e.id, ref)) }
  const renomear = async () => { if (e && nome.trim() && nome !== e.nome) setEstilos(await criacao.renomearEstilo(e.id, nome)) }
  const apagar = async () => {
    if (!e) return
    if (!await confirmar({ titulo: `Apagar o estilo “${e.nome}”?`, texto: 'As referências e o guia desse estilo serão apagados. As imagens já geradas continuam.', confirmar: 'Apagar estilo' })) return
    const r = await criacao.apagarEstilo(e.id)
    setEstilos(r); setSel(r[0]?.id ?? null)
  }
  const ler = async () => { if (e) { await criacao.analisarEstilo(e.id); recarregar() } }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast(`${t} copiado`)).catch(() => {})

  if (estilos === null) return <div className="carregando h-96" />
  if (estilos.length === 0) {
    return (
      <div className="cartao flex flex-col items-center px-6 py-16 text-center">
        <Ilustracao tipo="estilo" />
        <h3 className="titulo-display mt-2 text-xl font-semibold">Ensine a IA a desenhar do seu jeito</h3>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
          Um estilo visual é um conjunto de 4 a 8 imagens que têm a cara que você quer: seus posts, referências que você
          admira, posts de concorrentes. A IA lê paleta, tipografia e composição e passa a gerar nesse padrão.
        </p>
        <Button className="botao-sinal mt-5" onPress={criar}><Plus /> Criar meu primeiro estilo</Button>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      {confirmacao}
      <aside className="space-y-2">
        {estilos.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)}
            className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${x.id === sel ? 'bg-surface shadow-sm' : 'hover:bg-surface/60'}`}>
            <span className="grid size-12 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-xl bg-surface-secondary">
              {x.refs.slice(0, 4).map((r) => <img key={r.id} src={r.url} alt="" className="size-full object-cover" />)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{x.nome}</span>
              <span className="block text-xs text-muted">{x.refs.length} referências{x.guia ? ' · guia pronto' : ''}</span>
            </span>
          </button>
        ))}
        <Button variant="ghost" className="w-full justify-start" onPress={criar}><Plus /> Novo estilo</Button>
      </aside>

      {e && (
        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Nome do estilo" value={nome} onChange={(ev) => setNome(ev.target.value)} onBlur={renomear}
              className="titulo-display h-11 max-w-sm flex-1 text-xl font-semibold" />
            <Button className="botao-sinal" isDisabled={!e.refs.length} onPress={() => aoGerar(e.id)}><Sparkles /> Gerar com este estilo</Button>
            <Button isIconOnly variant="ghost" aria-label="Apagar estilo" onPress={apagar}><TrashBin /></Button>
          </div>

          {/* referências */}
          <div onDragOver={(ev) => { ev.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
            onDrop={(ev) => { ev.preventDefault(); setArrastando(false); enviar(ev.dataTransfer.files) }}
            className={`cartao p-4 transition-shadow ${arrastando ? 'ring-2 ring-accent' : ''}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="flex-1 text-sm font-medium">Referências <span className="num font-normal text-muted">{e.refs.length}/12</span></p>
              <input ref={arquivo} type="file" accept="image/*" multiple hidden onChange={(ev) => { if (ev.target.files) enviar(ev.target.files); ev.target.value = '' }} />
              <Button size="sm" variant="tertiary" isPending={enviando} onPress={() => arquivo.current?.click()}><ArrowUpFromLine /> Enviar imagens</Button>
              <Button size="sm" variant="tertiary" onPress={() => setSeletor(true)}><Picture /> Da biblioteca</Button>
            </div>
            {e.refs.length === 0 ? (
              <button onClick={() => arquivo.current?.click()} className="grid w-full place-items-center rounded-2xl border-2 border-dashed py-12 text-center text-sm text-muted linha-fina hover:text-foreground">
                <ArrowUpFromLine className="mb-2 size-5" />
                Arraste imagens para cá ou escolha posts da biblioteca
              </button>
            ) : (
              <div className="cascata grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {e.refs.map((r, i) => (
                  <div key={r.id} style={{ '--i': i } as React.CSSProperties} className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-secondary">
                    <img src={r.url} alt="" className="size-full object-cover" />
                    <button onClick={() => remover(r.id)} aria-label="Remover referência"
                      className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
                      <Xmark className="size-3.5" />
                    </button>
                    {r.origem !== 'upload' && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{r.origem === 'post' ? 'post' : 'gerada'}</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Dica: 4 a 8 imagens coerentes entre si dão o melhor resultado. Da referência a IA usa só o estilo; logos, marcas e
              personagens não são copiados.
            </p>
          </div>

          {/* guia */}
          {lendo ? (
            <div className="magico flex items-center gap-4 rounded-3xl p-6">
              <span className="grid size-14 place-items-center rounded-2xl bg-surface/70 text-foreground"><AnimProcesso tipo="analise" tamanho={44} /></span>
              <div><p className="font-medium">Lendo o estilo das referências…</p><p className="text-sm text-muted">Paleta, tipografia, composição e acabamento.</p></div>
            </div>
          ) : !e.guia ? (
            <div className="cartao flex flex-wrap items-center gap-4 p-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-surface-secondary text-foreground"><AnimProcesso tipo="analise" tamanho={36} /></span>
              <p className="min-w-0 flex-1 text-sm text-muted">
                {e.refs.length ? 'A IA ainda não leu estas referências. Ela também faz isso sozinha na primeira geração.' : 'Adicione referências para a IA ler o estilo.'}
              </p>
              <Button variant="tertiary" isDisabled={!e.refs.length} onPress={ler}><Sparkles /> Ler o estilo com IA</Button>
            </div>
          ) : (
            <div className="cartao entrar-cima space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase"><Sparkles className="size-3.5" /> Guia de estilo</p>
                  <p className="mt-2 text-[17px] leading-[1.6]">{e.guia.resumo}</p>
                </div>
                <Button size="sm" variant="ghost" onPress={ler}>Reler</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                {e.guia.paleta.map((c) => (
                  <button key={c.hex} onClick={() => copiar(c.hex)} className="group flex items-center gap-2.5 rounded-2xl bg-surface-secondary/60 p-1.5 pr-3 text-left">
                    <span className="size-10 rounded-xl ring-1 ring-black/10" style={{ background: c.hex }} />
                    <span><span className="num block text-sm font-medium">{c.hex} <Copy className="inline size-3 opacity-0 group-hover:opacity-60" /></span><span className="block text-xs text-muted">{c.uso}</span></span>
                  </button>
                ))}
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {([['Tipografia', e.guia.tipografia], ['Composição', e.guia.composicao], ['Imagem', e.guia.fotografia_ou_ilustracao],
                  ['Luz e textura', e.guia.iluminacao_e_textura], ['Clima', e.guia.clima]] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-muted uppercase">{k}</dt><dd className="mt-0.5 leading-relaxed">{v}</dd></div>
                ))}
                <div><dt className="text-xs text-muted uppercase">Elementos</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">{e.guia.elementos_graficos.map((x) => <span key={x} className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs">{x}</span>)}</dd></div>
              </dl>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="mb-1 text-xs text-muted uppercase">Regras</p><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{e.guia.regras.map((x) => <li key={x}>{x}</li>)}</ul></div>
                <div><p className="mb-1 text-xs text-muted uppercase">Evitar</p><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{e.guia.evitar.map((x) => <li key={x}>{x}</li>)}</ul></div>
              </div>
              {!!e.guia.nao_copiar?.length && (
                <div className="rounded-2xl bg-danger/8 p-4">
                  <p className="text-xs font-medium text-danger uppercase">Não copiar · é de outra marca</p>
                  <p className="mt-1 text-xs text-muted">A IA nunca coloca estes elementos nas suas imagens.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{e.guia.nao_copiar.map((x) => <span key={x} className="rounded-full bg-surface px-2.5 py-1 text-xs line-through decoration-danger/60">{x}</span>)}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <SeletorPosts aberto={seletor} contas={contas} versao={versaoBiblioteca} aoFechar={() => setSeletor(false)}
        aoEscolher={async (posts) => {
          if (!e) return
          setSeletor(false)
          setEnviando(true)
          try {
            for (const p of posts) setEstilos(await criacao.refDoPost(e.id, p))
            tocar('pasta')
          } catch (err) { toast.danger('Não deu para usar algum post', { description: (err as Error).message }) } finally { setEnviando(false) }
        }} limite={e ? 12 - e.refs.length : 12} />
    </div>
  )
}
