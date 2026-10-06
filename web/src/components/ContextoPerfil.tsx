import { Button, Checkbox, Modal } from '@heroui/react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import type { Plataforma } from '../api'
import { aura } from '../aura'
import { tocar } from '../sons'

export type PapelPerfil = 'concorrente' | 'referencia'
export interface ContextoEscolhido { papel: PapelPerfil; aspectos: string[]; nota: string }

/** As chaves batem com `ASPECTOS` em baixador/ia/perfil.py (é o que a IA recebe). */
const ASPECTOS: Record<PapelPerfil, { id: string; rotulo: string }[]> = {
  referencia: [
    { id: 'estilo_videos', rotulo: 'Estilo dos vídeos' }, { id: 'comunicacao', rotulo: 'Comunicação e tom' },
    { id: 'ganchos', rotulo: 'Ganchos e aberturas' }, { id: 'formatos', rotulo: 'Formatos' },
    { id: 'estetica', rotulo: 'Estética visual' }, { id: 'roteiro', rotulo: 'Roteiro e narrativa' },
    { id: 'posicionamento', rotulo: 'Posicionamento' }, { id: 'oferta', rotulo: 'Como vende' },
    { id: 'comunidade', rotulo: 'Comunidade' }, { id: 'crescimento', rotulo: 'Crescimento' },
  ],
  concorrente: [
    { id: 'mesmo_publico', rotulo: 'Mesmo público' }, { id: 'mesmo_produto', rotulo: 'Produto parecido' },
    { id: 'mesma_regiao', rotulo: 'Mesma região' }, { id: 'preco', rotulo: 'Preço' },
    { id: 'lider', rotulo: 'Líder do mercado' }, { id: 'comunicacao', rotulo: 'Comunicação parecida' },
  ],
}

const SUGESTOES_NOTA: Record<PapelPerfil, string[]> = {
  referencia: ['Quero o ritmo de edição dele', 'Gosto de como explica sem parecer aula', 'É de outro nicho, mas o formato serve pra mim'],
  concorrente: ['Me tira clientes na mesma cidade', 'Cobra mais barato que eu', 'Está crescendo rápido no meu nicho'],
}

/** Ilustração de cada papel: alvo (disputa) e faísca (inspiração). */
function Ilustracao({ papel, ativo }: { papel: PapelPerfil; ativo: boolean }) {
  const cor = papel === 'concorrente' ? 'var(--sinal-b)' : 'var(--accent)'
  return (
    <svg viewBox="0 0 64 64" className={`size-14 transition-transform duration-500 ${ativo ? 'scale-110' : ''}`} aria-hidden>
      {papel === 'concorrente' ? (
        <g fill="none" stroke={cor} strokeWidth="2.5">
          <circle cx="32" cy="32" r="24" opacity=".3" />
          <circle cx="32" cy="32" r="15" opacity=".6" className={ativo ? 'pulsar' : ''} />
          <circle cx="32" cy="32" r="5" fill={cor} />
          <path d="M50 14 36 28M50 14h-7M50 14v7" strokeLinecap="round" />
        </g>
      ) : (
        <g fill={cor}>
          <path d="M32 6l5 17 17 5-17 5-5 17-5-17-17-5 17-5z" className={ativo ? 'girar-lento' : ''} style={{ transformOrigin: '32px 28px' }} />
          <circle cx="52" cy="50" r="3" opacity=".6" /><circle cx="12" cy="52" r="2" opacity=".4" />
        </g>
      )}
    </svg>
  )
}

/**
 * Janela central em etapas: concorrente ou referência → o que interessa no perfil → anotação livre.
 * Usada ao acompanhar um perfil novo e para editar o contexto depois (a IA analisa com isso).
 */
export function ContextoPerfil({ aberto, perfil, inicial, editando = false, salvando = false, aoConfirmar, aoFechar }: {
  aberto: boolean
  perfil: { plataforma: Plataforma; conta: string; nome?: string | null; foto?: string | null }
  inicial?: Partial<ContextoEscolhido>
  editando?: boolean
  salvando?: boolean
  aoConfirmar: (c: ContextoEscolhido & { reanalisar: boolean }) => void
  aoFechar: () => void
}) {
  const [etapa, setEtapa] = useState(0)
  const [papel, setPapel] = useState<PapelPerfil | null>(null)
  const [aspectos, setAspectos] = useState<string[]>([])
  const [nota, setNota] = useState('')
  const [reanalisar, setReanalisar] = useState(true)

  useEffect(() => {
    if (!aberto) return
    setPapel(inicial?.papel ?? null)
    setAspectos(inicial?.aspectos ?? [])
    setNota(inicial?.nota ?? '')
    setEtapa(0)
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  const escolherPapel = (p: PapelPerfil) => {
    tocar('clique')
    if (p !== papel) setAspectos([])
    setPapel(p)
    setTimeout(() => { tocar('navegar'); setEtapa(1) }, 260)
  }
  const alternar = (id: string) => {
    tocar(aspectos.includes(id) ? 'clique' : 'bolha')
    setAspectos((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])
  }
  const confirmar = () => papel && aoConfirmar({ papel, aspectos, nota: nota.trim(), reanalisar })
  const nomeCurto = `@${perfil.conta}`

  return (
    <Modal.Backdrop isOpen={aberto} onOpenChange={(v) => !v && !salvando && aoFechar()}>
      <Modal.Container size="md">
        <Modal.Dialog className="w-full max-w-[520px] sm:max-w-[520px]">
          <Modal.CloseTrigger />
          <div className="flex items-center gap-3 px-6 pt-6">
            {perfil.foto
              ? <img src={perfil.foto} alt="" className="size-11 rounded-full object-cover" />
              : <span className="aura grid size-11 place-items-center rounded-full font-semibold text-white uppercase" style={aura(perfil.conta)}>{perfil.conta.slice(0, 1)}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{perfil.nome || nomeCurto}</p>
              <p className="truncate text-xs text-muted">{nomeCurto} · {perfil.plataforma === 'tiktok' ? 'TikTok' : 'Instagram'}</p>
            </div>
            <div className="mr-8 flex gap-1.5" aria-label={`Etapa ${etapa + 1} de 3`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === etapa ? 'w-6 bg-accent' : i < etapa ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-surface-secondary'}`} />
              ))}
            </div>
          </div>

          <div key={etapa} className="entrar-cima px-6 pt-5 pb-2">
            {etapa === 0 && (
              <>
                <h2 className="titulo-display text-xl font-semibold">Como você vê {nomeCurto}?</h2>
                <p className="mt-1 text-sm text-muted">A IA muda o jeito de analisar conforme a sua resposta.</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {([['concorrente', 'Concorrente', 'Disputa o mesmo cliente que você'],
                     ['referencia', 'Referência', 'Você quer aprender com ele, mesmo sendo de outro mercado']] as const).map(([k, n, d]) => (
                    <button key={k} onClick={() => escolherPapel(k)}
                      className={`group flex flex-col items-center gap-2 rounded-3xl p-5 text-center transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                        papel === k ? 'bg-accent/12 ring-2 ring-accent' : 'bg-surface-secondary/60 hover:bg-surface-secondary'}`}>
                      <Ilustracao papel={k} ativo={papel === k} />
                      <span className="font-semibold">{n}</span>
                      <span className="text-xs text-muted">{d}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {etapa === 1 && papel && (
              <>
                <h2 className="titulo-display text-xl font-semibold">
                  {papel === 'referencia' ? 'O que te inspira nele?' : 'Em que vocês disputam?'}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {papel === 'referencia' ? 'Escolha o que você quer aprender. A análise aprofunda nesses pontos.' : 'Escolha quantos quiser. A comparação foca nisso.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {ASPECTOS[papel].map((a) => {
                    const sel = aspectos.includes(a.id)
                    return (
                      <button key={a.id} onClick={() => alternar(a.id)} aria-pressed={sel}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                          sel ? 'bg-accent text-accent-foreground shadow-sm' : 'bg-surface-secondary/70 hover:bg-surface-secondary'}`}>
                        {sel && <Check className="size-3.5" />}{a.rotulo}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {etapa === 2 && papel && (
              <>
                <h2 className="titulo-display text-xl font-semibold">Quer dar mais contexto?</h2>
                <p className="mt-1 text-sm text-muted">Opcional. Uma frase já ajuda a IA a entender o que você procura.</p>
                <textarea value={nota} onChange={(e) => setNota(e.target.value.slice(0, 1000))} rows={3} autoFocus
                  placeholder={papel === 'referencia' ? 'Ex.: gosto de como ele mostra os bastidores sem parecer propaganda' : 'Ex.: abriu perto de mim e está pegando meus clientes do delivery'}
                  className="mt-4 w-full resize-none rounded-2xl bg-surface-secondary/70 p-3.5 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/50" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGESTOES_NOTA[papel].map((s) => (
                    <button key={s} onClick={() => { tocar('clique'); setNota((n) => n ? `${n}. ${s}` : s) }}
                      className="rounded-full px-2.5 py-1 text-xs text-muted ring-1 ring-[var(--border)] hover:text-foreground">+ {s}</button>
                  ))}
                </div>
                {editando && (
                  <Checkbox className="mt-4 flex items-center gap-2" isSelected={reanalisar} onChange={setReanalisar}>
                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                    <Checkbox.Content><span className="text-sm">Refazer a análise da IA com esse contexto</span></Checkbox.Content>
                  </Checkbox>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-6 pt-3 pb-6">
            {etapa > 0
              ? <Button variant="ghost" onPress={() => { tocar('clique'); setEtapa((e) => e - 1) }}><ArrowLeft /> Voltar</Button>
              : <span />}
            {etapa === 1 && <Button className="botao-sinal" onPress={() => { tocar('navegar'); setEtapa(2) }}>
              {aspectos.length ? 'Continuar' : 'Pular'} <ArrowRight /></Button>}
            {etapa === 2 && <Button className="botao-sinal" isPending={salvando} onPress={confirmar}>
              <Sparkles /> {editando ? (reanalisar ? 'Salvar e reanalisar' : 'Salvar') : 'Acompanhar e analisar'}</Button>}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
