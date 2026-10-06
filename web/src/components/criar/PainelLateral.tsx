import { Button, toast } from '@heroui/react'
import { Layers } from '@gravity-ui/icons'
import { useState } from 'react'
import type { Conteudo, Estrategia, StatusConteudo } from '../../api'
import { AreaSoltar, CartaoConteudo, FORMATOS, ORDEM_STATUS, STATUS, deIso, hojeIso, iso, segunda, somarDias, type Previa } from './comum'
import { tocar } from '../../sons'
import { useConfirmar } from '../ui/Confirmar'
import { fmtDec } from '../../formato'

/** Converte o formato escrito pela estratégia ("Reels educativos", "Carrossel"...) nas 4 chaves do calendário. */
export function chaveFormato(t: string) {
  if (/carross/i.test(t)) return 'carrossel'
  if (/story|stories/i.test(t)) return 'story'
  if (/foto|imagem|post est/i.test(t)) return 'foto'
  return 'reel'
}

function Anel({ valor, total }: { valor: number; total: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const p = total ? Math.min(1, valor / total) : 0
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id="anel-meta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sinal-a)" /><stop offset="1" stopColor="var(--sinal-b)" />
        </linearGradient>
      </defs>
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--surface-tertiary)" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="url(#anel-meta)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
    </svg>
  )
}

function Barra({ rotulo, cor, atual, alvo, sufixo = '' }: { rotulo: string; cor: string; atual: number; alvo?: number; sufixo?: string }) {
  const max = Math.max(atual, alvo ?? 0, 1)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate">{rotulo}</span>
        <span className="num shrink-0 text-muted">{fmtDec(atual, atual % 1 ? 1 : 0)}{sufixo}{alvo !== undefined && <> / <span className="text-foreground">{fmtDec(alvo, alvo % 1 ? 1 : 0)}{sufixo}</span></>}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-surface-tertiary">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${(atual / max) * 100}%`, background: cor }} />
        {alvo !== undefined && <div className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground/70" style={{ left: `calc(${(alvo / max) * 100}% - 1px)` }} title="Recomendado pela estratégia" />}
      </div>
    </div>
  )
}

/** Dias da semana (0 = segunda) para N posts por semana, bem espaçados. */
function diasDoRitmo(n: number) {
  const k = Math.max(1, Math.min(7, Math.round(n)))
  return [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * 7) / k)))]
}

/**
 * Espalha o que ainda é ideia/roteiro no ritmo da estratégia: a partir de hoje, no máximo `meta` por semana
 * (contando o que já está em produção, que não sai do lugar), um por dia, em dias bem espaçados.
 * Mantém a ordem original. Devolve só o que muda de data.
 */
export function planoRedistribuicao(itens: Conteudo[], meta: number) {
  const hoje = hojeIso()
  const futuros = itens.filter((c) => c.data && c.data >= hoje).sort((a, b) => a.data!.localeCompare(b.data!) || a.id - b.id)
  const moviveis = futuros.filter((c) => c.status === 'ideia' || c.status === 'roteiro')
  const fixos = futuros.filter((c) => !moviveis.includes(c))
  const porSemana = new Map<string, number>()
  const ocupado = new Set<string>()
  const chaveSemana = (d: string) => iso(segunda(deIso(d)))
  fixos.forEach((c) => { porSemana.set(chaveSemana(c.data!), (porSemana.get(chaveSemana(c.data!)) ?? 0) + 1); ocupado.add(c.data!) })
  const dias = diasDoRitmo(meta)
  const mudancas: { c: Conteudo; data: string }[] = []
  let semana = segunda(deIso(hoje))
  let i = 0
  for (let guarda = 0; i < moviveis.length && guarda < 104; guarda++, semana = somarDias(semana, 7)) {
    const k = iso(semana)
    for (const d of dias) {
      if (i >= moviveis.length || (porSemana.get(k) ?? 0) >= meta) break
      const dia = iso(somarDias(semana, d))
      if (dia < hoje || ocupado.has(dia)) continue
      const c = moviveis[i++]
      ocupado.add(dia); porSemana.set(k, (porSemana.get(k) ?? 0) + 1)
      if (c.data !== dia) mudancas.push({ c, data: dia })
    }
  }
  return mudancas
}

export function PainelLateral({ itens, estrategia, filtroStatus, setFiltroStatus, capas, arrastando, setArrastando, sobre, setSobre,
  mover, mudarStatus, abrir, previa, aoAbrirSessao }: {
  itens: Conteudo[]; estrategia: Estrategia | null
  filtroStatus: StatusConteudo | null; setFiltroStatus: (s: StatusConteudo | null) => void
  capas: Record<number, string>; arrastando: number | null; setArrastando: (id: number | null) => void
  sobre: string | null; setSobre: (k: string | null) => void
  mover: (id: number, data: string | null) => void; mudarStatus: (c: Conteudo, s: StatusConteudo) => void
  abrir: (c: Conteudo) => void; previa: { entrar: (c: Conteudo, el: HTMLElement) => void; sair: () => void; previa: Previa | null }
  aoAbrirSessao: () => void
}) {
  const ini = segunda(new Date())
  const fim = iso(somarDias(ini, 6))
  const semana = itens.filter((c) => c.data && c.data >= iso(ini) && c.data <= fim)
  const publicados = semana.filter((c) => c.status === 'publicado').length
  const meta = estrategia ? Math.round(estrategia.mix_de_formatos.reduce((s, m) => s + m.por_semana, 0)) : 0
  const alvoSemana = Math.max(meta, semana.length)

  // próximas 4 semanas: formato e pilar planejados × recomendados
  const hoje = hojeIso()
  const ate = iso(somarDias(new Date(), 28))
  const proximos = itens.filter((c) => c.data && c.data >= hoje && c.data <= ate)
  const recomendadoFormato: Record<string, number> = {}
  estrategia?.mix_de_formatos.forEach((m) => { const k = chaveFormato(m.formato); recomendadoFormato[k] = (recomendadoFormato[k] ?? 0) + m.por_semana })
  const planejadoFormato: Record<string, number> = {}
  proximos.forEach((c) => { const k = c.formato ?? 'reel'; planejadoFormato[k] = (planejadoFormato[k] ?? 0) + 1 / 4 })
  const pilares = estrategia?.pilares ?? []
  const totalProx = proximos.length || 1
  const pctPilar = (nome: string) => Math.round((proximos.filter((c) => (c.pilar ?? '').toLowerCase().startsWith(nome.toLowerCase().slice(0, 12))).length / totalProx) * 100)
  const semData = itens.filter((c) => !c.data)
  const { confirmacao, confirmar } = useConfirmar()
  const [redistribuindo, setRedistribuindo] = useState(false)
  // acima do ritmo: mais que 1,5× a meta nesta semana ou 2 itens no mesmo dia
  const diasCheios = new Set(semana.filter((c, i, a) => a.findIndex((x) => x.data === c.data) !== i).map((c) => c.data)).size
  const sobrecarga = meta > 0 && (semana.length > Math.ceil(meta * 1.5) || diasCheios > 0)
  const redistribuir = async () => {
    const plano = planoRedistribuicao(itens, meta)
    if (!plano.length) { toast('Nada para mover', { description: 'O que está acima da meta já está em produção.' }); return }
    const ultimo = plano.reduce((m, x) => (x.data > m ? x.data : m), plano[0].data)
    const ok = await confirmar({
      titulo: `Redistribuir no ritmo de ${meta} por semana?`, perigo: false, confirmar: 'Redistribuir',
      texto: `${plano.length} ${plano.length === 1 ? 'conteúdo muda' : 'conteúdos mudam'} de data, um por dia, até ${deIso(ultimo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}. O que já está em produção, pronto ou publicado não sai do lugar.`,
    })
    if (!ok) return
    setRedistribuindo(true)
    for (const m of plano) await mover(m.c.id, m.data)
    setRedistribuindo(false)
    tocar('sucesso')
    toast.success('Calendário no ritmo da estratégia', { description: `${plano.length} conteúdos redistribuídos.` })
  }

  return (
    <aside className="space-y-4">
      <section className="cartao p-5">
        <p className="text-xs text-muted">Esta semana</p>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative">
            <Anel valor={publicados} total={alvoSemana} />
            <span className="num absolute inset-0 grid place-items-center text-sm font-semibold">{publicados}/{alvoSemana}</span>
          </div>
          <div className="min-w-0 text-sm leading-relaxed">
            <p className="font-medium">{publicados === alvoSemana && alvoSemana > 0 ? 'Semana cumprida!' : `${semana.length} planejado${semana.length === 1 ? '' : 's'}`}</p>
            <p className="text-xs text-muted">{meta ? `Meta da estratégia: ${meta} por semana` : 'Gere a estratégia para ter uma meta semanal'}</p>
          </div>
        </div>
        {sobrecarga && (
          <div className="mt-4 rounded-2xl bg-[var(--ambar)]/10 p-3 text-xs leading-relaxed">
            <p className="font-medium text-[var(--ambar)]">Semana acima do ritmo</p>
            <p className="mt-0.5 text-muted">
              {semana.length} planejados para uma meta de {meta}{diasCheios ? ` e ${diasCheios} ${diasCheios === 1 ? 'dia' : 'dias'} com mais de um post` : ''}.
              Consistência rende mais que picos.
            </p>
            <Button size="sm" variant="tertiary" className="mt-2 w-full" isPending={redistribuindo} onPress={redistribuir}>Redistribuir nas próximas semanas</Button>
          </div>
        )}
        {confirmacao}
      </section>

      <section className="cartao p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Produção</p>
          {filtroStatus && <button onClick={() => setFiltroStatus(null)} className="text-xs text-accent hover:underline">Limpar filtro</button>}
        </div>
        <div className="space-y-1">
          {ORDEM_STATUS.map((s) => {
            const n = itens.filter((c) => c.status === s).length
            return (
              <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? null : s)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm transition-colors ${filtroStatus === s ? 'bg-surface-secondary font-medium' : 'hover:bg-surface-secondary/60'}`}>
                <span className="size-2 rounded-full" style={{ background: STATUS[s].cor }} />
                <span className="flex-1 text-left">{STATUS[s].nome}</span>
                <span className="num text-xs text-muted">{n}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="cartao space-y-3 p-5">
        <div>
          <p className="text-sm font-medium">Mix por semana</p>
          <p className="text-xs text-muted">Próximas 4 semanas · traço = recomendado</p>
        </div>
        {Object.entries(FORMATOS).filter(([k]) => planejadoFormato[k] || recomendadoFormato[k]).map(([k, f]) => (
          <Barra key={k} rotulo={f.nome} cor={f.cor} atual={planejadoFormato[k] ?? 0} alvo={estrategia ? recomendadoFormato[k] ?? 0 : undefined} sufixo="×" />
        ))}
        {!proximos.length && <p className="text-xs text-muted">Nada planejado nas próximas semanas.</p>}
        {pilares.length > 0 && (
          <div className="space-y-3 border-t pt-3 linha-fina">
            <p className="text-sm font-medium">Pilares</p>
            {pilares.map((p) => <Barra key={p.nome} rotulo={p.nome} cor="var(--sinal-a)" atual={pctPilar(p.nome)} alvo={p.participacao_pct} sufixo="%" />)}
          </div>
        )}
      </section>

      <AreaSoltar chave="banco" sobre={sobre} setSobre={setSobre} aoSoltar={(id) => mover(id, null)} className="cartao space-y-2 p-4">
        <div className="flex items-center justify-between px-1">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Layers className="size-4" /> Banco de ideias</p>
          <span className="num text-xs text-muted">{semData.length}</span>
        </div>
        {semData.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-4 text-center text-xs leading-relaxed text-muted linha-fina">
            Ideias sem data ficam aqui. Arraste para um dia do calendário.
            <button onClick={aoAbrirSessao} className="mt-2 block w-full font-medium text-accent hover:underline">Encher o banco com a IA</button>
          </div>
        ) : (
          <div data-rolavel="y" className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {semData.map((c) => (
              <CartaoConteudo key={c.id} c={c} capa={capas[c.id]} arrastando={arrastando === c.id} aoArrastar={setArrastando}
                aoAbrir={() => abrir(c)} aoStatus={(s) => mudarStatus(c, s)} aoEntrar={(el) => previa.entrar(c, el)} aoSair={previa.sair} />
            ))}
          </div>
        )}
      </AreaSoltar>
    </aside>
  )
}
