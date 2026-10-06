import { Button, Modal, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, ArrowUp, Check, Heart, Star, Xmark } from '@gravity-ui/icons'
import { useCallback, useEffect, useState } from 'react'
import { criacao, type Conteudo, type Estrategia, type IdeiaGerada } from '../../api'
import { aura } from '../../aura'
import { tocar } from '../../sons'
import { AnimProcesso, Explosao } from '../AnimProcessos'
import { FORMATOS, OBJETIVOS, diasLivres, rotuloDia } from './comum'
import { pedacoDoDegrade } from '../../degrade'

type Decisao = 'quero' | 'super' | 'pular'
interface Escolha { ideia: IdeiaGerada; super: boolean; data: string | null }

/** Sessão de ideias: a IA embaralha opções e você decide uma a uma (← pular, → quero, ↑ quero e já roteirizar). */
export function Sessao({ aberto, aoFechar, estrategia, itens, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; estrategia: Estrategia | null; itens: Conteudo[]
  aoConcluir: (criados: Conteudo[], roteirizar: number[]) => void
}) {
  const [fase, setFase] = useState<'inicio' | 'carregando' | 'baralho' | 'fim'>('inicio')
  const [qtd, setQtd] = useState(8)
  const [foco, setFoco] = useState<string | null>(null)
  const [formato, setFormato] = useState<string | null>(null)
  const [baralho, setBaralho] = useState<IdeiaGerada[]>([])
  const [pos, setPos] = useState(0)
  const [saida, setSaida] = useState<Decisao | null>(null)
  const [escolhas, setEscolhas] = useState<Escolha[]>([])
  const [sequencia, setSequencia] = useState(0)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setFase('inicio'); setBaralho([]); setPos(0); setEscolhas([]); setSequencia(0); setSaida(null)
  }, [aberto])

  const embaralhar = async () => {
    setFase('carregando')
    tocar('geracao')
    try {
      const r = await criacao.gerarIdeias({ qtd, pilar: foco, formato })
      setBaralho(r); setPos(0); setFase('baralho')
      tocar('geracaoFim')
    } catch (e) {
      toast.danger('Não deu para gerar ideias', { description: (e as Error).message })
      setFase('inicio')
    }
  }

  const decidir = useCallback((d: Decisao) => {
    if (fase !== 'baralho' || saida || pos >= baralho.length) return
    const ideia = baralho[pos]
    setSaida(d)
    criacao.escolherIdeia(ideia, d !== 'pular').catch(() => {})
    if (d === 'pular') { tocar('clique'); setSequencia(0) } else {
      const s = sequencia + 1
      setSequencia(s)
      tocar(d === 'super' ? 'geracaoFim' : 'post', Math.min(1, s / 6))
      setEscolhas((e) => [...e, { ideia, super: d === 'super', data: null }])
    }
    window.setTimeout(() => {
      setSaida(null)
      if (pos + 1 >= baralho.length) { setFase('fim'); tocar('analiseFim') } else setPos(pos + 1)
    }, 380)
  }, [fase, saida, pos, baralho, sequencia])

  useEffect(() => {
    if (!aberto || fase !== 'baralho') return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') decidir('pular')
      else if (e.key === 'ArrowRight') decidir('quero')
      else if (e.key === 'ArrowUp') decidir('super')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [aberto, fase, decidir])

  // ao terminar, sugere datas livres em ordem
  useEffect(() => {
    if (fase !== 'fim') return
    const livres = diasLivres(itens, escolhas.length)
    setEscolhas((es) => es.map((e, i) => ({ ...e, data: e.data ?? livres[i] ?? null })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  const salvar = async () => {
    setSalvando(true)
    try {
      const criados: Conteudo[] = []
      const roteirizar: number[] = []
      for (const e of escolhas) {
        const c = await criacao.criarConteudo({
          titulo: e.ideia.titulo, formato: e.ideia.formato, pilar: e.ideia.pilar, data: e.data, gancho: e.ideia.gancho,
          ideia: e.ideia.ideia, objetivo: e.ideia.objetivo, cta: e.ideia.cta, inspirado_em: e.ideia.inspirado_em,
        })
        criados.push(c)
        if (e.super) roteirizar.push(c.id)
      }
      tocar('geracaoFim')
      aoConcluir(criados, roteirizar)
      aoFechar()
    } catch (err) { toast.danger('Não deu para salvar', { description: (err as Error).message }) } finally { setSalvando(false) }
  }

  const atual = baralho[pos]
  const classeSaida = saida === 'pular' ? 'voar-esquerda' : saida === 'super' ? 'voar-cima' : saida === 'quero' ? 'voar-direita' : 'entrar-carta'
  const datas = diasLivres(itens, 10)

  return (
    <Modal.Backdrop isOpen={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="w-full max-w-[720px] overflow-hidden p-0 sm:max-w-[720px]">
          <Modal.CloseTrigger className="z-10" />

          {fase === 'inicio' && (
            <div className="space-y-6 p-7">
              <div>
                <p className="text-sm text-muted">Sessão de ideias</p>
                <h2 className="titulo-display mt-1 text-3xl font-semibold">Escolha o que vale a pena criar</h2>
                <p className="mt-2 text-muted">A IA embaralha ideias. Você decide uma a uma, e ela aprende com cada escolha.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
                <span className="rounded-2xl bg-surface-secondary/60 p-3"><Xmark className="mx-auto mb-1 size-5 text-danger" />← pular</span>
                <span className="rounded-2xl bg-surface-secondary/60 p-3"><Star className="mx-auto mb-1 size-5 text-[var(--ambar)]" />↑ quero + roteiro</span>
                <span className="rounded-2xl bg-surface-secondary/60 p-3"><Heart className="mx-auto mb-1 size-5 text-[#ff4d6d]" />→ quero</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Foco</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[null, ...(estrategia?.pilares.map((p) => p.nome) ?? [])].map((p) => (
                      <button key={p ?? 'tudo'} onClick={() => setFoco(p)}
                        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${foco === p ? 'botao-sinal' : 'bg-surface-secondary/70 text-muted hover:text-foreground'}`}>{p ?? 'Todos os pilares'}</button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="mb-2 text-sm font-medium">Formato</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[null, ...Object.keys(FORMATOS)].map((f) => (
                        <button key={f ?? 'todos'} onClick={() => setFormato(f)}
                          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${formato === f ? 'botao-sinal' : 'bg-surface-secondary/70 text-muted hover:text-foreground'}`}>{f ? FORMATOS[f].nome : 'Variado'}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Quantas</p>
                    <div className="flex gap-1.5">
                      {[5, 8, 12].map((n) => (
                        <button key={n} onClick={() => setQtd(n)} className={`num w-11 rounded-full py-1.5 text-sm ${qtd === n ? 'botao-sinal' : 'bg-surface-secondary/70 text-muted'}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <Button size="lg" className="botao-sinal w-full" onPress={embaralhar}>Embaralhar ideias</Button>
            </div>
          )}

          {fase === 'carregando' && (
            <div className="magico flex min-h-[460px] flex-col items-center justify-center gap-4 p-8 text-center">
              <span className="text-foreground"><AnimProcesso tipo="geracao" tamanho={80} /></span>
              <p className="titulo-display text-xl font-semibold">Embaralhando {qtd} ideias…</p>
              <p className="max-w-sm text-sm text-muted">Leva uns 30 segundos. A IA usa sua estratégia, o que funciona nos concorrentes e o que você já aceitou ou recusou.</p>
            </div>
          )}

          {fase === 'baralho' && atual && (
            <div className="p-6 sm:p-7">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex flex-1 gap-1">
                  {baralho.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full bg-surface-tertiary transition-all ${i === pos ? 'opacity-100' : i < pos ? 'opacity-70' : ''}`} style={i <= pos ? pedacoDoDegrade(i, baralho.length) : undefined} />)}
                </div>
                <span className="num text-sm text-muted">{pos + 1}/{baralho.length}</span>
                <span className="num flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-sm"><Heart className="size-3.5 text-[#ff4d6d]" />{escolhas.length}</span>
                {sequencia >= 3 && <span key={sequencia} className="anim-coracao rounded-full bg-[var(--ambar)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--ambar)]">🔥 {sequencia} seguidas</span>}
              </div>

              <div className="relative h-[400px]">
                {baralho.slice(pos + 1, pos + 3).reverse().map((b, i, arr) => (
                  <div key={b.titulo} className="absolute inset-x-0 top-0 h-full rounded-[1.75rem] border bg-surface-secondary linha-fina transition-all duration-300"
                    style={{ transform: `translateY(${(arr.length - i) * 10}px) scale(${1 - (arr.length - i) * 0.04})`, opacity: 0.5 }} />
                ))}
                <article key={pos} className={`${classeSaida} absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] border bg-surface shadow-2xl linha-fina`}>
                  <div className="aura relative flex items-end gap-2 overflow-hidden px-6 pt-10 pb-4 text-white" style={aura(atual.pilar)}>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-black" style={{ background: FORMATOS[atual.formato].cor }}>{FORMATOS[atual.formato].nome}</span>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs backdrop-blur-md">{OBJETIVOS[atual.objetivo]}</span>
                    <span className="ml-auto truncate text-xs text-white/80">{atual.pilar}</span>
                  </div>
                  <div data-rolavel="y" className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
                    <h3 className="titulo-display text-2xl leading-tight font-semibold">{atual.titulo}</h3>
                    <p className="text-lg leading-snug italic">“{atual.gancho}”</p>
                    <p className="text-sm leading-relaxed text-muted">{atual.ideia}</p>
                    <p className="mt-auto rounded-2xl bg-surface-secondary/60 px-4 py-3 text-sm leading-relaxed"><span className="font-medium">Por que funciona: </span>{atual.por_que}</p>
                  </div>
                </article>
              </div>

              <div className="mt-6 flex items-center justify-center gap-4">
                <button onClick={() => decidir('pular')} aria-label="Pular (seta para a esquerda)"
                  className="grid size-14 place-items-center rounded-full border bg-surface text-danger shadow-lg linha-fina transition-transform hover:scale-110"><Xmark className="size-6" /></button>
                <button onClick={() => decidir('super')} aria-label="Quero e já roteirizar (seta para cima)"
                  className="grid size-12 place-items-center rounded-full border bg-surface text-[var(--ambar)] shadow-lg linha-fina transition-transform hover:scale-110"><Star className="size-5" /></button>
                <button onClick={() => decidir('quero')} aria-label="Quero (seta para a direita)"
                  className="botao-sinal relative grid size-16 place-items-center rounded-full shadow-xl transition-transform hover:scale-110">
                  <Heart className="size-7" />
                  {saida === 'quero' && <span className="absolute -inset-4"><Explosao tamanho={96} cor="#ff4d6d" /></span>}
                </button>
              </div>
              <p className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1"><ArrowLeft className="size-3" /> pular</span>
                <span className="flex items-center gap-1"><ArrowUp className="size-3" /> quero + roteiro</span>
                <span className="flex items-center gap-1"><ArrowRight className="size-3" /> quero</span>
              </p>
            </div>
          )}

          {fase === 'fim' && (
            <div className="space-y-5 p-7">
              <div className="relative">
                <span className="absolute -top-4 -left-4"><Explosao tamanho={80} /></span>
                <p className="text-sm text-muted">Sessão concluída</p>
                <h2 className="titulo-display mt-1 text-3xl font-semibold">
                  {escolhas.length ? `${escolhas.length} ideia${escolhas.length > 1 ? 's' : ''} escolhida${escolhas.length > 1 ? 's' : ''}` : 'Nenhuma escolhida desta vez'}
                </h2>
                <p className="mt-1 text-sm text-muted">{escolhas.length ? 'Ajuste as datas e mande tudo para o calendário.' : 'A IA anotou o que você recusou. A próxima rodada vem diferente.'}</p>
              </div>
              {escolhas.length > 0 && (
                <div data-rolavel="y" className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {escolhas.map((e, i) => (
                    <div key={e.ideia.titulo} className="rounded-2xl bg-surface-secondary/60 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium uppercase" style={{ color: FORMATOS[e.ideia.formato].cor }}>{FORMATOS[e.ideia.formato].nome}</span>
                        {e.super && <span className="flex items-center gap-1 text-[11px] text-[var(--ambar)]"><Star className="size-3" /> roteiro automático</span>}
                      </div>
                      <p className="mt-0.5 font-medium">{e.ideia.titulo}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[...new Set([...(e.data ? [e.data] : []), ...datas.slice(0, 5)])].map((d) => (
                          <button key={d} onClick={() => setEscolhas((es) => es.map((x, j) => (j === i ? { ...x, data: d } : x)))}
                            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${e.data === d ? 'botao-sinal' : 'bg-surface text-muted hover:text-foreground'}`}>{rotuloDia(d)}</button>
                        ))}
                        <button onClick={() => setEscolhas((es) => es.map((x, j) => (j === i ? { ...x, data: null } : x)))}
                          className={`rounded-full px-2.5 py-1 text-xs ${e.data === null ? 'botao-sinal' : 'bg-surface text-muted hover:text-foreground'}`}>Sem data</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="tertiary" onPress={() => setFase('inicio')}>Nova rodada</Button>
                {escolhas.length > 0 && <Button className="botao-sinal" isPending={salvando} onPress={salvar}><Check /> Colocar no calendário</Button>}
              </div>
            </div>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
