import { Button } from '@heroui/react'
import { ArrowRight, ChevronDown, Thunderbolt, Xmark } from '@gravity-ui/icons'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api, type Tarefa, type TarefaIA } from '../api'
import { tocar } from '../sons'
import { AnimProcesso, Explosao, type TipoProcesso } from './AnimProcessos'
import { CheckDesenhado } from './Animacoes'

export type Destino = 'inicio' | 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'criar' | 'downloads'

/** Um processo em linguagem de gente: coleta, comentários, análise ou geração. */
export interface Processo {
  chave: string
  tipo: TipoProcesso
  titulo: string
  detalhe: string
  progresso: number | null // 0..1, null = indeterminado
  ativo: boolean
  estado: 'rodando' | 'fila' | 'ok' | 'erro' | 'cancelado'
  fim: number | null
  destino: Destino
  /** 'plataforma/conta': abre o destino já filtrado nessa conta (ex.: Biblioteca) */
  filtro?: string
  /** terminou sem nada para mostrar (ex.: perfil sem posts públicos): sem comemoração */
  vazio?: boolean
  /** agrupa processos sobre a mesma coisa (ex.: várias coletas da mesma conta): só o mais recente aparece */
  assunto?: string
  /** concluído sem novidade para o usuário (coleta "em dia"): não ocupa a lista de recentes */
  rotineiro?: boolean
  cancelar?: () => void
}

const ATIVOS_DL = ['na fila', 'listando', 'baixando', 'comentários']
const ATIVOS_IA = ['na fila', 'rodando']

const NOME_IA: Record<TarefaIA['tipo'], (t: TarefaIA) => string> = {
  perfil: (t) => `Analisando @${t.conta}`,
  mercado: () => 'Comparando o mercado',
  estrategia: () => 'Criando sua estratégia',
  imagem: () => 'Criando imagem',
  estilo: () => 'Lendo o estilo visual',
  calendario: () => 'Montando o calendário',
  roteiro: () => 'Escrevendo o roteiro',
  inteligencia: () => 'Atualizando sua central',
}
const PRONTO_IA: Record<TarefaIA['tipo'], (t: TarefaIA) => string> = {
  perfil: (t) => `Análise de @${t.conta} pronta`,
  mercado: () => 'Panorama do mercado pronto',
  estrategia: () => 'Sua estratégia está pronta',
  imagem: () => 'Imagem pronta',
  estilo: () => 'Guia de estilo pronto',
  calendario: () => 'Calendário pronto',
  roteiro: () => 'Roteiro pronto',
  inteligencia: () => 'Central atualizada',
}
const tipoIA = (t: TarefaIA): TipoProcesso => (['perfil', 'mercado', 'estilo'].includes(t.tipo) ? 'analise' : 'geracao')
const destinoIA = (t: TarefaIA): Destino =>
  t.tipo === 'perfil' || t.tipo === 'mercado' ? 'inteligencia' : t.tipo === 'estrategia' ? 'meuperfil' : 'criar'

export function processos(downloads: Tarefa[], ia: TarefaIA[], aoMudar: () => void): Processo[] {
  const dl: Processo[] = downloads.filter((t) => t.opcoes.modo !== 'link').map((t) => {
    const ativo = ATIVOS_DL.includes(t.status)
    const feitos = t.baixados + t.pulados
    const coment = t.status === 'comentários'
    const fim = t.status === 'concluído'
    const semNada = fim && t.baixados === 0 && t.pulados === 0
    const emDia = fim && t.baixados === 0 && t.pulados > 0
    return {
      chave: `d${t.id}`, tipo: coment ? 'comentarios' : 'coleta',
      titulo: !ativo ? (semNada ? `@${t.conta} não tem posts públicos` : emDia ? `@${t.conta} já estava em dia`
        : fim ? `@${t.conta}: ${t.baixados} ${t.baixados === 1 ? 'post novo' : 'posts novos'}` : `Coleta de @${t.conta}`)
        : coment ? `Lendo comentários de @${t.conta}` : `Buscando posts de @${t.conta}`,
      detalhe: t.status === 'na fila' ? 'Na fila' : t.status === 'listando' ? 'Listando o perfil…'
        : coment ? `${t.comentarios ?? 0} comentários lidos` : t.status === 'baixando' ? `${feitos} de ${t.total} posts`
          : t.status === 'erro' ? (t.logs.at(-1) ?? 'Erro') : t.status === 'cancelado' ? 'Cancelada'
            : semNada ? 'Perfil vazio, privado ou ainda sem publicações' : emDia ? 'Nenhum post novo desde a última coleta'
              : t.pulados ? `${t.pulados} já estavam na Biblioteca` : 'Já na sua Biblioteca',
      progresso: t.status === 'baixando' && t.total ? feitos / t.total : null,
      ativo, estado: t.status === 'na fila' ? 'fila' : ativo ? 'rodando' : t.status === 'concluído' ? 'ok' : t.status === 'erro' ? 'erro' : 'cancelado',
      assunto: `conta:${t.plataforma}/${t.conta}`, rotineiro: emDia,
      fim: t.fim, destino: semNada ? 'contas' : 'biblioteca', filtro: semNada ? undefined : `${t.plataforma}/${t.conta}`, vazio: semNada,
      cancelar: ativo ? () => { api.cancelar(t.id).then(aoMudar) } : undefined,
    }
  })
  // a rotina da central roda em segundo plano, sem ocupar a central de atividade
  const ias: Processo[] = ia.filter((t) => t.tipo !== 'inteligencia').map((t) => {
    const ativo = ATIVOS_IA.includes(t.status)
    return {
      chave: `i${t.id}`, tipo: tipoIA(t), assunto: `ia:${t.tipo}:${t.plataforma ?? ''}/${t.conta ?? ''}`,
      titulo: ativo || t.status === 'erro' ? NOME_IA[t.tipo](t) : PRONTO_IA[t.tipo](t),
      detalhe: t.status === 'na fila' ? 'Na fila' : t.status === 'erro' ? (t.erro ?? 'Erro')
        : ativo ? (t.total > 1 ? `${t.etapa} · ${t.feito} de ${t.total}` : t.etapa) : 'Concluído',
      progresso: ativo && t.total > 1 ? t.feito / t.total : null,
      ativo, estado: t.status === 'na fila' ? 'fila' : ativo ? 'rodando' : t.status === 'concluído' ? 'ok' : 'erro',
      fim: t.fim ?? null, destino: destinoIA(t),
    }
  })
  return [...dl, ...ias]
}

// ---------------------------------------------------------------- contexto (telas leem as tarefas daqui)

interface Estado { downloads: Tarefa[]; ia: TarefaIA[]; recarregar: () => void }
export const AtividadeContexto = createContext<Estado>({ downloads: [], ia: [], recarregar: () => {} })
export const useAtividade = () => useContext(AtividadeContexto)

/** Sons e eventos nas transições: começou, avançou, terminou. */
export function useSonsDosProcessos(downloads: Tarefa[], ia: TarefaIA[]) {
  const antes = useRef<Map<string, { status: string; n: number; c: number }> | null>(null)
  useEffect(() => {
    const atual = new Map<string, { status: string; n: number; c: number; tipo: string; total: number; novos?: number }>()
    downloads.filter((t) => t.opcoes.modo !== 'link').forEach((t) =>
      atual.set(`d${t.id}`, { status: t.status, n: t.baixados + t.pulados, c: t.comentarios ?? 0, tipo: 'download', total: t.total, novos: t.baixados }))
    ia.filter((t) => t.tipo !== 'inteligencia').forEach((t) => atual.set(`i${t.id}`, { status: t.status, n: t.feito, c: 0, tipo: t.tipo, total: t.total }))
    const ant = antes.current
    antes.current = atual
    if (!ant) return // primeira leitura: só memoriza
    for (const [k, x] of atual) {
      const a = ant.get(k)
      const dl = x.tipo === 'download'
      const geracao = ['estrategia', 'calendario', 'roteiro', 'imagem'].includes(x.tipo)
      const ativoAgora = dl ? ['listando', 'baixando', 'comentários'].includes(x.status) : x.status === 'rodando'
      const ativoAntes = a && (dl ? ['listando', 'baixando', 'comentários'].includes(a.status) : a.status === 'rodando')
      if (ativoAgora && !ativoAntes) tocar(dl ? 'coleta' : geracao ? 'geracao' : 'analise')
      else if (a && dl && x.status === 'comentários' && a.status !== 'comentários') tocar('bolha')
      else if (a && dl && x.n > a.n) tocar('post', x.total ? x.n / x.total : 0)
      else if (a && dl && x.c > a.c) tocar('bolha')
      else if (a && !dl && x.n > a.n && x.status === 'rodando') tocar('neuronio')
      const terminouAgora = a && a.status !== x.status && ['concluído', 'erro'].includes(x.status)
      if (terminouAgora) {
        const semNovos = dl && x.status === 'concluído' && !x.novos
        if (x.status === 'erro') tocar('erro')
        else if (semNovos) tocar(x.n ? 'clique' : 'aviso')
        else tocar(dl ? 'coletaFim' : geracao ? 'geracaoFim' : 'analiseFim')
        window.dispatchEvent(new CustomEvent('processo-fim', { detail: { chave: k, ok: x.status === 'concluído' && !semNovos } }))
      }
    }
  }, [downloads, ia])
}

// ---------------------------------------------------------------- central flutuante

export function CentralAtividade({ lista, irPara }: { lista: Processo[]; irPara: (d: Destino, filtro?: string) => void }) {
  const [aberta, setAberta] = useState(false)
  const [festa, setFesta] = useState<{ chave: string; n: number } | null>(null)
  const ativos = lista.filter((p) => p.ativo)
  const agora = Date.now() / 1000
  const recentes = (() => {
    const vistos = new Set<string>()
    return lista
      .filter((p) => !p.ativo && p.fim && agora - p.fim < 6 * 3600 && !p.rotineiro)
      .sort((a, b) => (b.fim ?? 0) - (a.fim ?? 0))
      .filter((p) => { const k = p.assunto ?? p.chave; if (vistos.has(k)) return false; vistos.add(k); return true })
      .slice(0, 6)
  })()
  const pronto = festa ? lista.find((p) => p.chave === festa.chave) : null

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ chave: string; ok: boolean }>).detail
      if (d.ok) setFesta({ chave: d.chave, n: Date.now() })
    }
    window.addEventListener('processo-fim', h)
    return () => window.removeEventListener('processo-fim', h)
  }, [])
  useEffect(() => {
    if (!festa) return
    const t = setTimeout(() => setFesta(null), 5000)
    return () => clearTimeout(t)
  }, [festa])

  const principal = ativos.find((p) => p.estado === 'rodando') ?? ativos[0]
  const ir = (d: Destino, filtro?: string) => { setAberta(false); irPara(d, filtro) }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:justify-end sm:px-6" data-sem-som>
      <div className="pointer-events-auto relative">
        {aberta && (
          <div className="vidro subir-dock absolute right-0 bottom-full mb-3 w-[min(92vw,26rem)] overflow-hidden rounded-3xl border linha-fina shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="titulo-display font-semibold">{ativos.length ? 'Trabalhando para você' : 'Feito recentemente'}</p>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Fechar" onPress={() => setAberta(false)}><ChevronDown /></Button>
            </div>
            <div data-rolavel="y" className="max-h-[60vh] space-y-1 overflow-y-auto px-2 pb-2">
              {ativos.length === 0 && recentes.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">Nada rodando agora. Análises e criações da IA aparecem aqui.</p>
              )}
              {ativos.map((p) => <Linha key={p.chave} p={p} ir={ir} />)}
              {recentes.length > 0 && <p className="px-3 pt-3 pb-1 text-xs text-muted">Recentes</p>}
              {recentes.map((p) => <Linha key={p.chave} p={p} ir={ir} />)}
            </div>
          </div>
        )}

        {pronto ? (
          <button onClick={() => ir(pronto.destino, pronto.filtro)} key={festa!.n}
            className="vidro subir-dock relative flex items-center gap-3 rounded-full border py-2 pr-5 pl-2 shadow-xl linha-fina">
            <span className="relative grid size-10 place-items-center rounded-full bg-[var(--menta)] text-black">
              <CheckDesenhado tamanho={18} />
              <span className="absolute -inset-3"><Explosao tamanho={64} /></span>
            </span>
            <span className="text-left">
              <span className="block text-sm font-medium">{pronto.titulo}</span>
              <span className="block text-xs text-accent">{pronto.filtro ? `Ver posts de @${pronto.filtro.split('/')[1]}` : 'Ver agora'} <ArrowRight className="inline size-3" /></span>
            </span>
          </button>
        ) : principal ? (
          <button onClick={() => setAberta((a) => !a)}
            className="vidro subir-dock flex max-w-[92vw] items-center gap-3 rounded-full border py-1.5 pr-5 pl-1.5 shadow-xl linha-fina">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-secondary text-foreground">
              <AnimProcesso tipo={principal.tipo} tamanho={34} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">{principal.titulo}</span>
              <span className="num block truncate text-xs text-muted">{principal.detalhe}</span>
              <span className="mt-1 block h-1 w-44 overflow-hidden rounded-full bg-surface-tertiary">
                {principal.progresso !== null
                  ? <span className="botao-sinal block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(4, principal.progresso * 100)}%` }} />
                  : <span className="carregando block h-full w-full" />}
              </span>
            </span>
            {ativos.length > 1 && <span className="num rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">+{ativos.length - 1}</span>}
          </button>
        ) : recentes.length > 0 ? (
          <button onClick={() => setAberta((a) => !a)} aria-label="O que a IA fez por você"
            className="vidro grid size-11 place-items-center rounded-full border text-muted shadow-lg linha-fina hover:text-foreground">
            <Thunderbolt className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Linha({ p, ir }: { p: Processo; ir: (d: Destino, filtro?: string) => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-2.5 ${p.ativo ? 'bg-surface-secondary/70' : ''}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-foreground">
        {p.ativo ? <AnimProcesso tipo={p.tipo} tamanho={30} />
          : p.vazio ? <span className="text-sm text-[var(--ambar)]">∅</span>
          : p.estado === 'ok' ? <span className="text-[var(--menta)]"><CheckDesenhado tamanho={16} /></span>
            : <Xmark className="size-4 text-danger" />}
      </span>
      <button onClick={() => ir(p.destino, p.filtro)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{p.titulo}</span>
        <span className={`num block truncate text-xs ${p.estado === 'erro' ? 'text-danger' : 'text-muted'}`}>{p.detalhe}</span>
        {p.ativo && p.progresso !== null && (
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-tertiary">
            <span className="botao-sinal block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(4, p.progresso * 100)}%` }} />
          </span>
        )}
      </button>
      {p.cancelar && <Button isIconOnly size="sm" variant="ghost" aria-label="Cancelar" onPress={p.cancelar}><Xmark /></Button>}
    </div>
  )
}

/** Chama `f` quando alguma tarefa de IA dos tipos indicados termina (para a tela recarregar os dados). */
export function useAoConcluir(tipos: TarefaIA['tipo'][], f: (t: TarefaIA) => void) {
  const { ia } = useAtividade()
  const antes = useRef<Map<number, string> | null>(null)
  const ref = useRef(f)
  ref.current = f
  const chave = tipos.join(',')
  useEffect(() => {
    const atual = new Map(ia.map((t) => [t.id, t.status]))
    const ant = antes.current
    antes.current = atual
    if (!ant) return
    ia.forEach((t) => {
      const a = ant.get(t.id)
      if (chave.split(',').includes(t.tipo) && a && a !== t.status && (t.status === 'concluído' || t.status === 'erro')) ref.current(t)
    })
  }, [ia, chave])
}
