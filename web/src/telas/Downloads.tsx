import { Button, Chip, Disclosure, ProgressBar } from '@heroui/react'
import { FolderOpen, Xmark } from '@gravity-ui/icons'
import type { Tarefa } from '../api'
import { api } from '../api'
import { IconePlataforma, NOME_PLATAFORMA } from '../components/Plataforma'
import { useNuvem } from '../ambiente'

const COR: Record<Tarefa['status'], 'default' | 'accent' | 'success' | 'danger' | 'warning'> = {
  'na fila': 'default',
  listando: 'accent',
  baixando: 'accent',
  'comentários': 'accent',
  concluído: 'success',
  erro: 'danger',
  cancelado: 'warning',
}

const descreverModo = (t: Tarefa) => {
  const o = t.opcoes
  return (
    {
      recentes: `${o.quantidade} mais recentes`,
      antigos: `${o.quantidade} mais antigos`,
      mais_vistos: `${o.quantidade} mais vistos`,
      novos: 'só os novos',
      todos: 'perfil inteiro',
      periodo: `de ${o.data_inicio ?? '…'} até ${o.data_fim || 'hoje'}`,
      link: 'vídeo avulso',
    }[o.modo] + (o.min_views ? ` · ≥ ${o.min_views.toLocaleString('pt-BR')} views` : '')
  )
}

export const ativa = (t: Tarefa) => ['na fila', 'listando', 'baixando', 'comentários'].includes(t.status)

export function TelaDownloads({ tarefas, aoMudar }: { tarefas: Tarefa[]; aoMudar: () => void }) {
  const nuvem = useNuvem()
  const ativas = tarefas.filter(ativa)
  const finalizadas = tarefas.filter((t) => !ativa(t))

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="titulo-display text-4xl font-semibold">Downloads</h1>
          <p className="mt-1 text-muted">
            {nuvem
              ? 'Na versão online os vídeos são catalogados (métricas, legenda e capa) e tocam pelo player oficial.'
              : 'TikTok e Instagram baixam em paralelo, com vários vídeos por vez.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!nuvem && (
            <Button variant="tertiary" onPress={() => api.abrirPasta()}>
              <FolderOpen />
              Abrir pasta
            </Button>
          )}
          {finalizadas.length > 0 && (
            <Button variant="tertiary" onPress={() => api.limpar().then(aoMudar)}>
              Limpar histórico
            </Button>
          )}
        </div>
      </div>

      {tarefas.length === 0 && <div className="cartao py-20 text-center text-muted">Nenhum download ainda.</div>}

      {ativas.length > 0 && <Grupo titulo="Em andamento" tarefas={ativas} aoMudar={aoMudar} />}
      {finalizadas.length > 0 && <Grupo titulo="Concluídos" tarefas={finalizadas} aoMudar={aoMudar} />}
    </div>
  )
}

function Grupo({ titulo, tarefas, aoMudar }: { titulo: string; tarefas: Tarefa[]; aoMudar: () => void }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium tracking-wide text-muted uppercase">{titulo}</h2>
      <div className="cartao divide-y overflow-hidden linha-fina [&>*]:linha-fina">
        {tarefas.map((t) => (
          <LinhaTarefa key={t.id} t={t} aoMudar={aoMudar} />
        ))}
      </div>
    </section>
  )
}

function LinhaTarefa({ t, aoMudar }: { t: Tarefa; aoMudar: () => void }) {
  const nuvem = useNuvem()
  const feito = t.baixados + t.pulados + t.erros
  const pct = t.total ? Math.round((feito / t.total) * 100) : t.status === 'concluído' ? 100 : 0
  const indeterminado = t.status === 'listando'

  return (
    <div className="space-y-2.5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="grid size-9 place-items-center rounded-full"
          style={{ color: `var(--${t.plataforma})`, background: `color-mix(in srgb, var(--${t.plataforma}) 10%, transparent)` }}
          title={NOME_PLATAFORMA[t.plataforma]}
        >
          <IconePlataforma plataforma={t.plataforma} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">@{t.conta}</p>
          <p className="truncate text-sm text-muted">{descreverModo(t)}</p>
        </div>
        <Chip size="sm" variant="soft" color={COR[t.status]}>
          {t.status}
        </Chip>
        {ativa(t) ? (
          <Button isIconOnly size="sm" variant="ghost" aria-label="Cancelar" onPress={() => api.cancelar(t.id).then(aoMudar)}>
            <Xmark />
          </Button>
        ) : nuvem ? null : (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Abrir pasta"
            onPress={() => api.abrirPasta({ plataforma: t.plataforma, conta: t.conta })}
          >
            <FolderOpen />
          </Button>
        )}
      </div>

      {ativa(t) && t.status !== 'na fila' && (
        <ProgressBar
          aria-label="Progresso"
          size="sm"
          value={pct}
          isIndeterminate={indeterminado}
          color={t.erros ? 'warning' : 'accent'}
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}

      {t.status === 'na fila' ? (
        <p className="text-xs text-muted">Aguardando a vez na fila do {NOME_PLATAFORMA[t.plataforma]}…</p>
      ) : (
      <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {t.total > 0 && (
          <span>
            <span className="text-foreground">{feito}</span> de {t.total}
          </span>
        )}
        <span>{t.baixados} {nuvem ? 'catalogados' : 'baixados'}</span>
        {t.pulados > 0 && <span>{t.pulados} já existiam</span>}
        {!!t.comentarios && <span>{t.comentarios} comentários</span>}
        {t.erros > 0 && <span className="text-danger">{t.erros} erros</span>}
        {t.logs.length > 0 && <span className="truncate">{t.logs[t.logs.length - 1].slice(9)}</span>}
      </div>
      )}

      {t.logs.length > 1 && (
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="text-xs text-muted">
              Ver registro
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body>
              <pre data-rolavel="y" className="max-h-56 overflow-auto rounded-xl bg-surface-secondary p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">
                {t.logs.join('\n')}
              </pre>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      )}
    </div>
  )
}
