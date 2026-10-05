import { Button, Input, Label, Modal, Switch, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, ArrowsRotateRight, Check, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { criacao, type Conteudo, type Estrategia, type IdeiaGerada } from '../../api'
import { tocar } from '../../sons'
import { AnimProcesso, Explosao } from '../AnimProcessos'
import { FORMATOS, OBJETIVOS, diasLivres, rotuloDia } from './comum'

const PASSOS = ['Assunto', 'Formato', 'Ideia', 'Quando'] as const

function Chip({ ativo, onPress, children, cor }: { ativo: boolean; onPress: () => void; children: React.ReactNode; cor?: string }) {
  return (
    <button onClick={() => { tocar('clique'); onPress() }}
      className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition-all ${ativo ? 'border-transparent shadow-lg' : 'linha-fina hover:-translate-y-0.5 hover:border-accent/40'}`}
      style={ativo ? { background: cor ? `color-mix(in srgb, ${cor} 22%, var(--surface))` : 'color-mix(in srgb, var(--sinal-a) 18%, var(--surface))', boxShadow: `0 0 0 1.5px ${cor ?? 'var(--sinal-a)'}` } : undefined}>
      {children}
    </button>
  )
}

/** Criação guiada: escolhas rápidas em chips e a IA propõe opções para você escolher. */
export function Criador({ aberto, aoFechar, estrategia, itens, dataInicial, aoCriar }: {
  aberto: boolean; aoFechar: () => void; estrategia: Estrategia | null; itens: Conteudo[]
  dataInicial: string | null; aoCriar: (c: Conteudo, roteirizar: boolean) => void
}) {
  const [passo, setPasso] = useState(0)
  const [pilar, setPilar] = useState<string | null>(null)
  const [tema, setTema] = useState('')
  const [formato, setFormato] = useState<string | null>(null)
  const [objetivo, setObjetivo] = useState<string | null>(null)
  const [ideias, setIdeias] = useState<IdeiaGerada[] | null>(null)
  const [erro, setErro] = useState('')
  const [escolhida, setEscolhida] = useState<IdeiaGerada | null>(null)
  const [data, setData] = useState<string | null>(null)
  const [roteirizar, setRoteirizar] = useState(true)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setPasso(0); setPilar(null); setTema(''); setFormato(null); setObjetivo(null); setIdeias(null); setEscolhida(null)
    setData(dataInicial); setRoteirizar(true); setErro('')
  }, [aberto, dataInicial])

  const buscar = async () => {
    setIdeias(null); setEscolhida(null); setErro('')
    tocar('geracao')
    try {
      const r = await criacao.gerarIdeias({ qtd: 4, pilar, formato, objetivo, tema: tema || null })
      setIdeias(r)
      tocar('geracaoFim')
    } catch (e) { setErro((e as Error).message); setIdeias([]) }
  }
  const ir = (n: number) => {
    tocar('navegar')
    setPasso(n)
    if (n === 2 && !ideias) buscar()
  }
  const criar = async () => {
    if (!escolhida) return
    setCriando(true)
    try {
      criacao.escolherIdeia(escolhida, true).catch(() => {})
      const c = await criacao.criarConteudo({
        titulo: escolhida.titulo, formato: escolhida.formato, pilar: escolhida.pilar, data, gancho: escolhida.gancho,
        ideia: escolhida.ideia, objetivo: escolhida.objetivo, cta: escolhida.cta, inspirado_em: escolhida.inspirado_em,
      })
      tocar('geracaoFim')
      aoCriar(c, roteirizar)
      aoFechar()
    } catch (e) { toast.danger('Não deu para criar', { description: (e as Error).message }) } finally { setCriando(false) }
  }
  const livres = diasLivres(itens, 6)
  const opcoesData = [...new Set([...(dataInicial ? [dataInicial] : []), ...livres])].slice(0, 6)

  return (
    <Modal.Backdrop isOpen={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="w-full max-w-[760px] overflow-hidden p-0 sm:max-w-[760px]">
          <Modal.CloseTrigger className="z-10" />
          <div className="flex gap-1.5 px-7 pt-7">
            {PASSOS.map((p, i) => (
              <div key={p} className="flex-1">
                <span className={`block h-1 rounded-full transition-all duration-500 ${i <= passo ? 'botao-sinal' : 'bg-surface-tertiary'}`} />
                <span className={`mt-1.5 block text-[11px] ${i === passo ? 'font-medium text-foreground' : 'text-muted'}`}>{p}</span>
              </div>
            ))}
          </div>

          <div key={passo} className="troca-pagina min-h-[360px] px-7 pt-6 pb-4">
            {passo === 0 && (
              <div className="space-y-5">
                <h2 className="titulo-display text-3xl font-semibold">Sobre o que vai ser?</h2>
                <div className="flex flex-wrap gap-2">
                  <Chip ativo={pilar === null} onPress={() => setPilar(null)}>✨ Surpreenda-me</Chip>
                  {(estrategia?.pilares ?? []).map((p) => (
                    <Chip key={p.nome} ativo={pilar === p.nome} onPress={() => setPilar(p.nome)}>
                      <span className="block font-medium">{p.nome}</span>
                      <span className="num block text-xs text-muted">{p.participacao_pct}% da estratégia</span>
                    </Chip>
                  ))}
                </div>
                <Input aria-label="Tema" value={tema} onChange={(e) => setTema(e.target.value)} className="w-full"
                  placeholder="Tem algo em mente? (opcional) Ex.: Black Friday, um case, uma dúvida de cliente…" />
              </div>
            )}

            {passo === 1 && (
              <div className="space-y-6">
                <h2 className="titulo-display text-3xl font-semibold">Em que formato e para quê?</h2>
                <div>
                  <p className="mb-2 text-sm text-muted">Formato</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip ativo={formato === null} onPress={() => setFormato(null)}>A IA escolhe</Chip>
                    {Object.entries(FORMATOS).map(([k, f]) => <Chip key={k} cor={f.cor} ativo={formato === k} onPress={() => setFormato(k)}>{f.nome}</Chip>)}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm text-muted">Objetivo</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip ativo={objetivo === null} onPress={() => setObjetivo(null)}>A IA escolhe</Chip>
                    {Object.entries(OBJETIVOS).map(([k, n]) => <Chip key={k} ativo={objetivo === k} onPress={() => setObjetivo(k)}>{n}</Chip>)}
                  </div>
                </div>
              </div>
            )}

            {passo === 2 && (
              <div className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="titulo-display text-3xl font-semibold">Escolha uma</h2>
                  {ideias && <Button size="sm" variant="tertiary" onPress={buscar}><ArrowsRotateRight /> Outras ideias</Button>}
                </div>
                {ideias === null ? (
                  <div className="magico flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
                    <span className="text-foreground"><AnimProcesso tipo="geracao" tamanho={64} /></span>
                    <p className="font-medium">A IA está pensando em 4 caminhos…</p>
                    <p className="text-sm text-muted">Cruzando sua estratégia, o que funciona nos concorrentes e as suas escolhas anteriores.</p>
                  </div>
                ) : erro ? <p className="text-sm text-danger">{erro}</p> : (
                  <div className="cascata grid gap-3 sm:grid-cols-2">
                    {ideias.map((i, n) => {
                      const ativo = escolhida === i
                      const f = FORMATOS[i.formato]
                      return (
                        <button key={i.titulo} style={{ '--i': n } as React.CSSProperties} onClick={() => { tocar('favorito'); setEscolhida(i) }}
                          className={`relative flex flex-col gap-2 rounded-2xl p-4 text-left transition-all ${ativo ? 'bg-accent/12 ring-2 ring-accent' : 'bg-surface-secondary/60 hover:-translate-y-0.5 hover:bg-surface-secondary'}`}>
                          {ativo && <span className="absolute -top-3 -right-3"><Explosao tamanho={44} /></span>}
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span className="rounded-full px-2 py-0.5 font-medium text-black" style={{ background: f.cor }}>{f.nome}</span>
                            <span className="rounded-full bg-surface px-2 py-0.5">{OBJETIVOS[i.objetivo]}</span>
                            {ativo && <span className="botao-sinal ml-auto grid size-5 place-items-center rounded-full"><Check className="size-3" /></span>}
                          </span>
                          <span className="leading-snug font-semibold">{i.titulo}</span>
                          <span className="text-sm leading-relaxed italic">“{i.gancho}”</span>
                          <span className="text-xs leading-relaxed text-muted">{i.por_que}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {passo === 3 && escolhida && (
              <div className="space-y-5">
                <h2 className="titulo-display text-3xl font-semibold">Quando publicar?</h2>
                <p className="rounded-2xl bg-surface-secondary/60 px-4 py-3 text-sm"><span className="font-medium">{escolhida.titulo}</span> · <span className="text-muted">{FORMATOS[escolhida.formato].nome}</span></p>
                <div className="flex flex-wrap gap-2">
                  {opcoesData.map((d) => <Chip key={d} ativo={data === d} onPress={() => setData(d)}>{rotuloDia(d)}</Chip>)}
                  <Chip ativo={data === null} onPress={() => setData(null)}>Sem data (banco de ideias)</Chip>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Outra data:
                  <input type="date" value={data ?? ''} onChange={(e) => setData(e.target.value || null)} className="rounded-xl bg-surface-secondary px-3 py-1.5 text-foreground outline-none" />
                </label>
                <Switch isSelected={roteirizar} onChange={setRoteirizar}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label>Já escrever o roteiro com a IA</Label></Switch.Content>
                </Switch>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-7 py-4 linha-fina">
            <Button variant="ghost" isDisabled={passo === 0} onPress={() => ir(passo - 1)}><ArrowLeft /> Voltar</Button>
            {passo < 2 && <Button className="botao-sinal" onPress={() => ir(passo + 1)}>{passo === 1 ? <><Sparkles /> Ver ideias</> : <>Continuar <ArrowRight /></>}</Button>}
            {passo === 2 && <Button className="botao-sinal" isDisabled={!escolhida} onPress={() => ir(3)}>Escolher esta <ArrowRight /></Button>}
            {passo === 3 && <Button className="botao-sinal" isPending={criando} onPress={criar}><Check /> Colocar no calendário</Button>}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
