import { Button, TextArea, Tooltip, toast } from '@heroui/react'
import { ThumbsDown, ThumbsUp } from '@gravity-ui/icons'
import { createContext, Fragment, useContext, useState, type ReactNode } from 'react'
import { ia, urlThumb, type Video } from '../../api'
import { fmtNum } from '../../formato'

/** Dados que todos os blocos de insight precisam: vídeos (para evidências), votos e o relatório atual. */
export interface ContextoIA {
  videos: Map<string, Video>
  abrirVideo: (v: Video) => void
  alvo: 'perfil' | 'mercado' | 'chat'
  refRelatorio: string
  votos: Record<string, number>
  aoVotar: (chave: string, voto: number) => void
}

export const ContextoIA = createContext<ContextoIA | null>(null)
export const useIA = () => useContext(ContextoIA)!

/** 👍/👎 com um "por quê?" opcional. É isso que alimenta os aprendizados da IA. */
export function Feedback({ secao, item }: { secao: string; item: string }) {
  const ctx = useIA()
  const chave = `${secao}::${item}`
  const atual = ctx.votos[chave] ?? 0
  const [pendente, setPendente] = useState<1 | -1 | null>(null)
  const [comentario, setComentario] = useState('')

  const enviar = async (voto: 1 | -1, texto = '') => {
    await ia.feedback({ alvo: ctx.alvo, ref: ctx.refRelatorio, secao, item, voto, comentario: texto })
    ctx.aoVotar(chave, voto)
    setPendente(null)
    setComentario('')
    toast.success(voto > 0 ? 'Anotado: mais disso' : 'Anotado: menos disso', {
      description: 'A IA usa seus feedbacks para melhorar as próximas análises.',
    })
  }

  return (
    <div className="shrink-0">
      <div className="flex gap-0.5 opacity-60 transition-opacity group-hover/insight:opacity-100 focus-within:opacity-100">
        <Tooltip delay={300}>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Insight útil"
            className={atual > 0 ? 'text-success' : ''} onPress={() => setPendente(pendente === 1 ? null : 1)}>
            <ThumbsUp className="size-3.5" />
          </Button>
          <Tooltip.Content>Útil, quero mais assim</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300}>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Insight fraco"
            className={atual < 0 ? 'text-danger' : ''} onPress={() => setPendente(pendente === -1 ? null : -1)}>
            <ThumbsDown className="size-3.5" />
          </Button>
          <Tooltip.Content>Genérico ou errado</Tooltip.Content>
        </Tooltip>
      </div>
      {pendente && (
        <div className="surgir absolute right-0 left-0 z-10 mt-2 space-y-2 rounded-xl border bg-surface p-3 shadow-lg linha-fina">
          <TextArea
            aria-label="Por quê?"
            autoFocus
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={pendente > 0 ? 'O que tornou útil? (opcional)' : 'O que faltou ou está errado? (opcional)'}
            className="h-20 w-full"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="tertiary" onPress={() => enviar(pendente)}>Só o voto</Button>
            <Button size="sm" onPress={() => enviar(pendente, comentario)} isDisabled={!comentario.trim()}>Enviar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Miniaturas dos vídeos que sustentam uma afirmação. Clicar abre o player. */
export function Evidencias({ ids, max = 4 }: { ids: string[]; max?: number }) {
  const ctx = useIA()
  const vids = ids.map((id) => ctx.videos.get(id)).filter(Boolean) as Video[]
  if (!vids.length) return null
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {vids.slice(0, max).map((v) => (
        <button key={v.id} onClick={() => ctx.abrirVideo(v)} title={v.legenda.slice(0, 120)}
          className="group/ev relative h-14 w-9 shrink-0 overflow-hidden rounded-md bg-surface-secondary ring-accent outline-none focus-visible:ring-2">
          <img src={urlThumb(v)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover/ev:scale-110" />
          <span className="num absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] leading-3 text-white">{fmtNum(v.views ?? v.likes)}</span>
        </button>
      ))}
      {vids.length > max && <span className="text-xs text-muted">+{vids.length - max}</span>}
    </div>
  )
}

/** Troca ids de vídeo citados no meio do texto por chips clicáveis ("▶ 26 mi"). */
export function TextoComVideos({ texto }: { texto: string }) {
  const ctx = useIA()
  const partes = texto.split(/(\[?\b(?:\d{15,21}|[A-Za-z0-9_-]{11})\b\]?)/g)
  return (
    <>
      {partes.map((p, i) => {
        const id = p.replace(/[[\]]/g, '')
        const v = ctx.videos.get(id)
        if (!v) return <Fragment key={i}>{p}</Fragment>
        return (
          <button key={i} onClick={() => ctx.abrirVideo(v)} title={v.legenda.slice(0, 120)}
            className="num mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-accent/10 px-1.5 align-baseline text-xs font-medium text-accent hover:bg-accent/20">
            ▶ {fmtNum(v.views ?? v.likes)}
          </button>
        )
      })}
    </>
  )
}

export const semAspas = (s: string) => s.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, '')

/** Uma afirmação com evidências e feedback. */
export function Insight({ secao, texto, videos = [], children }: { secao: string; texto: string; videos?: string[]; children?: ReactNode }) {
  return (
    <li className="group/insight relative flex gap-3 py-3">
      <div className="min-w-0 flex-1">
        {children ?? <p className="text-[15px] leading-relaxed"><TextoComVideos texto={texto} /></p>}
        <Evidencias ids={videos} />
      </div>
      <Feedback secao={secao} item={texto} />
    </li>
  )
}

export function Secao({ titulo, icone, descricao, children, className = '' }: { titulo: string; icone?: ReactNode; descricao?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`cartao p-5 sm:p-6 ${className}`}>
      <header className="mb-2 flex items-center gap-2">
        {icone && <span className="text-accent [&_svg]:size-4">{icone}</span>}
        <h3 className="titulo-display text-lg font-semibold">{titulo}</h3>
      </header>
      {descricao && <p className="mb-2 text-sm text-muted">{descricao}</p>}
      {children}
    </section>
  )
}

export function ListaItens({ secao, itens }: { secao: string; itens: { texto: string; videos: string[] }[] }) {
  if (!itens.length) return <p className="py-2 text-sm text-muted">Nada relevante.</p>
  return (
    <ul className="divide-y linha-fina [&>li]:linha-fina">
      {itens.map((i) => <Insight key={i.texto} secao={secao} texto={i.texto} videos={i.videos} />)}
    </ul>
  )
}

const COR_DESEMPENHO = { acima: 'text-success', na_media: 'text-muted', abaixo: 'text-danger', sem_dados: 'text-muted' }
const NOME_DESEMPENHO = { acima: '↑ acima da média', na_media: '≈ na média', abaixo: '↓ abaixo da média', sem_dados: 'sem dados' }
export function SeloDesempenho({ d }: { d: keyof typeof COR_DESEMPENHO }) {
  return <span className={`text-xs font-medium ${COR_DESEMPENHO[d]}`}>{NOME_DESEMPENHO[d]}</span>
}

const COR_PRIORIDADE = { alta: 'var(--danger)', media: 'var(--warning)', baixa: 'var(--muted)' }
export function SeloPrioridade({ p }: { p: 'alta' | 'media' | 'baixa' }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: COR_PRIORIDADE[p], background: `color-mix(in srgb, ${COR_PRIORIDADE[p]} 12%, transparent)` }}>
      {p === 'media' ? 'média' : p}
    </span>
  )
}
