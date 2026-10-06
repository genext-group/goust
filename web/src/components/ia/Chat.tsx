import { Orbita } from '../Animacoes'
import { Button, Drawer, TextArea } from '@heroui/react'
import { PaperPlane, Sparkles } from '@gravity-ui/icons'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ia, type Plataforma } from '../../api'
import { Feedback, useIA } from './Compartilhado'

type Escopo = { tipo: 'perfil'; plataforma: Plataforma; conta: string } | { tipo: 'mercado' }
interface Msg { papel: 'usuario' | 'ia'; texto: string }

const SUGESTOES = {
  perfil: ['Quais 3 ganchos dele eu deveria testar primeiro?', 'Qual o ponto mais fraco que eu posso explorar?', 'Escreva um roteiro de 30s rebatendo a promessa principal deles'],
  mercado: ['Qual posicionamento ninguém está ocupando?', 'Quem está crescendo mais rápido e por quê?', 'Monte um calendário de 2 semanas para eu me diferenciar'],
}

export function Chat({ escopo, titulo, isOpen, onOpenChange }: { escopo: Escopo; titulo: string; isOpen: boolean; onOpenChange: (v: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const chaveEscopo = escopo.tipo === 'perfil' ? `${escopo.plataforma}/${escopo.conta}` : 'mercado'

  useEffect(() => setMsgs([]), [chaveEscopo])
  useEffect(() => fim.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, pensando])

  const enviar = async (pergunta: string) => {
    if (!pergunta.trim() || pensando) return
    const novas: Msg[] = [...msgs, { papel: 'usuario', texto: pergunta.trim() }]
    setMsgs(novas)
    setTexto('')
    setPensando(true)
    try {
      const r = await ia.chat(escopo, novas)
      setMsgs([...novas, { papel: 'ia', texto: r.resposta }])
    } catch (e) {
      setMsgs([...novas, { papel: 'ia', texto: `Não consegui responder: ${(e as Error).message}` }])
    } finally {
      setPensando(false)
    }
  }

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-full w-screen max-w-full flex-col sm:w-[560px]">
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading className="flex items-center gap-2 titulo-display text-lg font-semibold">
              <Sparkles className="size-4 text-accent" /> Pergunte à IA
            </Drawer.Heading>
            <p className="text-sm text-muted">{titulo}</p>
          </Drawer.Header>
          <Drawer.Body data-rolavel="y" className="flex-1 space-y-4 overflow-y-auto">
            {!msgs.length && (
              <div className="space-y-2 pt-4">
                <p className="text-sm text-muted">Sugestões:</p>
                {SUGESTOES[escopo.tipo].map((s) => (
                  <button key={s} onClick={() => enviar(s)}
                    className="block w-full rounded-xl bg-surface-secondary px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => m.papel === 'usuario' ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-foreground">{m.texto}</div>
            ) : (
              <div key={i} className="group/insight relative max-w-[95%] rounded-2xl rounded-bl-md bg-surface-secondary px-4 py-3">
                <Markdown texto={m.texto} />
                <div className="mt-1 flex justify-end">
                  <Feedback secao={`chat:${msgs[i - 1]?.texto.slice(0, 120) ?? ''}`} item={m.texto.slice(0, 1400)} />
                </div>
              </div>
            ))}
            {pensando && <div className="flex items-center gap-2 text-sm text-muted"><Orbita tamanho={22} className="text-foreground" /> Analisando os dados…</div>}
            <div ref={fim} />
          </Drawer.Body>
          <Drawer.Footer>
            <form className="flex w-full items-end gap-2" onSubmit={(e) => { e.preventDefault(); enviar(texto) }}>
              <TextArea aria-label="Pergunta" value={texto} onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }}
                placeholder="Pergunte sobre posicionamento, ganchos, roteiros…" className="max-h-40 min-h-11 flex-1" />
              <Button type="submit" isIconOnly aria-label="Enviar" isDisabled={!texto.trim() || pensando}><PaperPlane /></Button>
            </form>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

/** Markdown mínimo (títulos, listas, negrito) e ids de vídeo [abc123] viram links para o player. */
function Markdown({ texto }: { texto: string }) {
  const ctx = useIA()
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\[[A-Za-z0-9_-]{8,25}\])/g).map((parte, i) => {
      if (parte.startsWith('**')) return <strong key={i}>{parte.slice(2, -2)}</strong>
      const m = parte.match(/^\[([A-Za-z0-9_-]{8,25})\]$/)
      const v = m && ctx.videos.get(m[1])
      if (v) return <button key={i} onClick={() => ctx.abrirVideo(v)} className="rounded bg-accent/10 px-1 text-xs font-medium text-accent hover:bg-accent/20">▶ vídeo</button>
      return <Fragment key={i}>{parte}</Fragment>
    })

  const blocos: ReactNode[] = []
  let lista: ReactNode[] = []
  const fecharLista = () => { if (lista.length) { blocos.push(<ul key={blocos.length} className="my-1 list-disc space-y-1 pl-5">{lista}</ul>); lista = [] } }
  texto.split('\n').forEach((linha, i) => {
    const l = linha.trim()
    if (/^[-*•]\s|^\d+[.)]\s/.test(l)) { lista.push(<li key={i}>{inline(l.replace(/^([-*•]|\d+[.)])\s/, ''))}</li>); return }
    fecharLista()
    if (!l) return
    if (l.startsWith('#')) blocos.push(<p key={i} className="mt-2 font-semibold">{inline(l.replace(/^#+\s*/, ''))}</p>)
    else blocos.push(<p key={i}>{inline(l)}</p>)
  })
  fecharLista()
  return <div className="space-y-2 text-sm leading-relaxed">{blocos}</div>
}
