import { CheckDesenhado } from '../Animacoes'
import { AnimProcesso, type TipoProcesso } from '../AnimProcessos'
import type { Conta, Tarefa, TarefaIA } from '../../api'

type Estado = 'feito' | 'agora' | 'espera'

/** Linha do tempo ao vivo do perfil: coleta → comentários → análise da IA → relatório. */
export function Pipeline({ conta, downloads, tarefasIA, temRelatorio }: {
  conta: Conta
  downloads: Tarefa[]
  tarefasIA: TarefaIA[]
  temRelatorio: boolean
}) {
  const dl = downloads.find((t) => t.plataforma === conta.plataforma && t.conta === conta.conta)
  const iaT = tarefasIA.find((t) => t.tipo === 'perfil' && t.plataforma === conta.plataforma && t.conta === conta.conta)
  const coletando = dl && ['na fila', 'listando', 'baixando'].includes(dl.status)
  const comentando = dl?.status === 'comentários'
  const analisando = iaT && (iaT.status === 'na fila' || iaT.status === 'rodando')
  const coletou = (conta.videos ?? 0) > 0 && !coletando

  const etapas: { nome: string; detalhe: string; estado: Estado; anim: TipoProcesso }[] = [
    {
      nome: 'Coletar posts', anim: 'coleta',
      detalhe: coletando ? (dl!.total ? `${dl!.baixados + dl!.pulados} de ${dl!.total}` : 'Listando o perfil…') : coletou ? `${conta.videos} posts` : 'Aguardando',
      estado: coletando ? 'agora' : coletou ? 'feito' : 'espera',
    },
    {
      nome: 'Ler comentários', anim: 'comentarios',
      detalhe: comentando ? `${dl!.comentarios ?? 0} lidos…` : coletou ? 'Voz do público' : 'Aguardando',
      estado: comentando ? 'agora' : coletou && !coletando ? 'feito' : 'espera',
    },
    {
      nome: 'Análise da IA', anim: 'analise',
      detalhe: analisando ? (iaT!.status === 'na fila' ? 'Na fila…' : iaT!.total > 1 ? `${iaT!.feito} de ${iaT!.total} posts` : iaT!.etapa) : temRelatorio ? 'Concluída' : 'Aguardando',
      estado: analisando ? 'agora' : temRelatorio ? 'feito' : 'espera',
    },
    {
      nome: 'Relatório', anim: 'geracao',
      detalhe: temRelatorio ? 'Pronto' : 'Aguardando',
      estado: temRelatorio && !analisando ? 'feito' : 'espera',
    },
  ]

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {etapas.map((e, i) => (
        <li key={e.nome} className={`relative rounded-2xl p-3.5 transition-colors ${e.estado === 'agora' ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-surface-secondary/70'}`}>
          <div className="flex items-center gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
              e.estado === 'feito' ? 'bg-[var(--menta)] text-black' : e.estado === 'agora' ? '' : 'bg-surface-tertiary text-muted'}`}>
              {e.estado === 'feito' ? <CheckDesenhado tamanho={12} /> : e.estado === 'agora' ? <AnimProcesso tipo={e.anim} tamanho={24} /> : <span className="num">{i + 1}</span>}
            </span>
            <span className="text-sm font-medium">{e.nome}</span>
          </div>
          <p className={`num mt-1.5 truncate pl-8 text-xs ${e.estado === 'agora' ? 'text-accent' : 'text-muted'}`}>{e.detalhe}</p>
        </li>
      ))}
    </ol>
  )
}
