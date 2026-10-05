import { Button, toast } from '@heroui/react'
import { Calendar, Check } from '@gravity-ui/icons'
import { useState } from 'react'
import { criacao, type Ideia, type Oportunidade } from '../../api'
import { tocar } from '../../sons'
import { Evidencias, Feedback, SeloPrioridade, semAspas, TextoComVideos } from './Compartilhado'

export function ListaOportunidades({ secao, itens }: { secao: string; itens: Oportunidade[] }) {
  const ordem = { alta: 0, media: 1, baixa: 2 }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[...itens].sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]).map((o) => (
        <article key={o.titulo} className="group/insight relative rounded-2xl bg-surface-secondary p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <SeloPrioridade p={o.prioridade} />
              <h4 className="font-semibold leading-snug">{o.titulo}</h4>
            </div>
            <Feedback secao={secao} item={`${o.titulo}: ${o.acao_concreta}`} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted"><TextoComVideos texto={o.descricao} /></p>
          <div className="mt-3 rounded-xl border-l-2 border-accent bg-surface px-3 py-2 text-sm leading-relaxed">
            <span className="font-medium text-accent">Faça: </span><TextoComVideos texto={o.acao_concreta} />
          </div>
          <Evidencias ids={o.videos} />
        </article>
      ))}
    </div>
  )
}

export function ListaIdeias({ secao, itens }: { secao: string; itens: Ideia[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {itens.map((i, n) => (
        <article key={i.titulo} className="group/insight relative flex flex-col rounded-2xl bg-surface-secondary p-4">
          <div className="flex items-start gap-2">
            <span className="num titulo-display text-2xl font-semibold text-accent/40">{String(n + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold leading-snug">{i.titulo}</h4>
              <p className="text-xs text-muted">{i.formato}</p>
            </div>
            <Feedback secao={secao} item={`${i.titulo} — gancho: ${i.gancho}`} />
          </div>
          <p className="mt-3 text-sm italic leading-relaxed">“{semAspas(i.gancho)}”</p>
          <ol className="mt-3 flex-1 space-y-1.5 text-sm text-muted">
            {i.roteiro.map((passo, k) => (
              <li key={k} className="flex gap-2">
                <span className="num mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-surface text-[10px] font-semibold">{k + 1}</span>
                <span className="leading-relaxed">{passo}</span>
              </li>
            ))}
          </ol>
          <Evidencias ids={i.inspirado_em} max={3} />
          <ParaCalendario ideia={i} />
        </article>
      ))}
    </div>
  )
}

/** Manda a ideia para o calendário (aba Criar), sem data, para a pessoa arrastar para o dia. */
function ParaCalendario({ ideia }: { ideia: Ideia }) {
  const [feito, setFeito] = useState(false)
  const formato = /carross/i.test(ideia.formato) ? 'carrossel' : /foto|imagem/i.test(ideia.formato) ? 'foto' : /story/i.test(ideia.formato) ? 'story' : 'reel'
  const mandar = async () => {
    try {
      await criacao.criarConteudo({ titulo: ideia.titulo, formato, gancho: ideia.gancho, ideia: ideia.roteiro.join(' '), inspirado_em: ideia.inspirado_em })
      setFeito(true)
      tocar('pasta')
      toast.success('Ideia no calendário', { description: 'Está em Criar → Calendário, em "Ideias sem data".' })
    } catch (e) { toast.danger('Não deu', { description: (e as Error).message }) }
  }
  return (
    <Button size="sm" variant={feito ? 'ghost' : 'tertiary'} className="mt-3 self-start" isDisabled={feito} onPress={mandar}>
      {feito ? <><Check /> No calendário</> : <><Calendar /> Adicionar ao calendário</>}
    </Button>
  )
}
