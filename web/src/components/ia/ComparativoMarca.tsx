import { Button, toast } from '@heroui/react'
import { ArrowsRotateRight, Sparkles } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { marcas, type Conta, type Plataforma, type RegistroComparativo, type TarefaIA } from '../../api'
import { fmtDec, fmtDuracao, fmtNum, fmtRelativo } from '../../formato'
import { tocar } from '../../sons'
import { AnimProcesso } from '../AnimProcessos'
import { IconePlataforma } from '../Plataforma'

const NOME: Record<Plataforma, string> = { tiktok: 'TikTok', instagram: 'Instagram' }
const DIMENSAO: Record<string, string> = {
  posicionamento: 'Posicionamento', publico: 'Público', tom: 'Tom de voz', formatos: 'Formatos', pilares: 'Pilares de conteúdo',
  ganchos: 'Ganchos', frequencia: 'Frequência', desempenho: 'Desempenho', cta: 'Chamadas para ação',
}

/**
 * Visão conjunta de uma marca nas plataformas: números lado a lado e a comparação da IA
 * (consistência, diferenças de posicionamento e conteúdo, o que funciona em cada uma e o que fazer com isso).
 */
export function ComparativoMarca({ marcaId, contas, tarefas, aoAnalisar, aoPedir }: {
  marcaId: number; contas: Conta[]; tarefas: TarefaIA[]
  aoAnalisar: (c: Conta) => void; aoPedir: () => void
}) {
  const [d, setD] = useState<Awaited<ReturnType<typeof marcas.comparativo>> | null>(null)
  const carregar = useCallback(() => marcas.comparativo(marcaId).then(setD).catch(() => setD(null)), [marcaId])
  useEffect(() => { setD(null); carregar() }, [carregar])

  const tarefa = tarefas.find((t) => t.tipo === 'marca' && (t.params as { alvo?: number } | undefined)?.alvo === marcaId && ['na fila', 'rodando'].includes(t.status))
  const analisando = contas.filter((c) => tarefas.some((t) => t.tipo === 'perfil' && t.plataforma === c.plataforma && t.conta === c.conta && ['na fila', 'rodando'].includes(t.status)))
  const tinhaTarefa = useRef(false)
  useEffect(() => {   // quando o comparativo termina, recarrega
    if (tarefa) tinhaTarefa.current = true
    else if (tinhaTarefa.current) { tinhaTarefa.current = false; carregar() }
  }, [tarefa, carregar])

  const pedir = async () => {
    try { await marcas.gerarComparativo(marcaId); tocar('analise'); aoPedir() }
    catch (e) { toast.danger('Não deu para comparar', { description: (e as Error).message }) }
  }

  if (!d) return <div className="space-y-4"><div className="carregando h-40 rounded-3xl" /><div className="carregando h-72 rounded-3xl" /></div>

  if (tarefa) {
    return (
      <div className="cartao flex items-center gap-4 p-6">
        <AnimProcesso tipo="analise" tamanho={44} />
        <div><p className="font-medium">{tarefa.status === 'na fila' ? 'Na fila…' : tarefa.etapa || 'Comparando as plataformas…'}</p>
          <p className="text-sm text-muted">A IA cruza a análise de cada plataforma. Leva menos de um minuto.</p></div>
      </div>
    )
  }

  if (d.faltam.length) {
    const faltam = contas.filter((c) => d.faltam.includes(`${c.plataforma}/${c.conta}`))
    return (
      <div className="cartao px-6 py-10 text-center">
        <h3 className="titulo-display text-xl font-semibold">Falta analisar {faltam.map((c) => NOME[c.plataforma]).join(' e ')}</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
          A visão conjunta compara a análise de cada plataforma da marca. Assim que {faltam.length === 1 ? 'ela estiver pronta' : 'elas estiverem prontas'}, a IA mostra o que muda entre TikTok e Instagram.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {faltam.map((c) => (
            <Button key={c.plataforma} className="botao-sinal" isDisabled={analisando.includes(c) || !c.videos} onPress={() => aoAnalisar(c)}>
              <Sparkles /> {analisando.includes(c) ? `Analisando ${NOME[c.plataforma]}…` : !c.videos ? `${NOME[c.plataforma]} sem posts ainda` : `Analisar ${NOME[c.plataforma]}`}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  if (!d.comparativo) {
    return (
      <div className="cartao px-6 py-12 text-center">
        <div className="mx-auto flex w-fit -space-x-2">{contas.map((c) => <span key={c.plataforma} className="grid size-11 place-items-center rounded-full bg-surface-secondary ring-2 ring-[var(--surface)] [&_svg]:size-5"><IconePlataforma plataforma={c.plataforma} /></span>)}</div>
        <h3 className="titulo-display mt-3 text-xl font-semibold">Compare {d.marca} entre as plataformas</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
          A IA mostra se a marca é a mesma no TikTok e no Instagram: posicionamento, público, formatos, frequência e desempenho, o que funciona em cada uma e o que você faz com isso.
        </p>
        <Button className="botao-sinal mt-4" onPress={pedir}><Sparkles /> Comparar plataformas</Button>
      </div>
    )
  }

  const r: RegistroComparativo = d.comparativo
  const c = r.comparativo
  const plats = r.contas.map((x) => x.plataforma)
  return (
    <div className="space-y-4">
      {d.desatualizado && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--ambar)]/10 p-4 text-sm">
          <p className="min-w-0 flex-1"><span className="font-medium text-[var(--ambar)]">Uma das plataformas foi reanalisada depois deste comparativo.</span> <span className="text-muted">Atualize para refletir os dados novos.</span></p>
          <Button size="sm" variant="tertiary" onPress={pedir}><ArrowsRotateRight /> Atualizar comparativo</Button>
        </div>
      )}

      <section className="cartao p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase"><Sparkles className="size-3.5" /> Visão conjunta</p>
            <p className="text-[17px] leading-[1.7] text-foreground/90">{c.resumo}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted"><span className="text-foreground">Entre plataformas:</span> {c.estrategia_multiplataforma}</p>
          </div>
          <div className="space-y-3 rounded-2xl bg-surface-secondary p-4">
            <div className="flex items-baseline justify-between"><span className="text-sm text-muted">Consistência</span><span className="num titulo-display text-3xl font-semibold">{c.consistencia}<span className="text-base text-muted">/10</span></span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-accent" style={{ width: `${c.consistencia * 10}%` }} /></div>
            <p className="text-xs leading-relaxed text-muted">{c.leitura_consistencia}</p>
            <p className="border-t pt-3 text-xs leading-relaxed linha-fina">
              <span className="text-muted">Mais forte:</span> <span className="font-medium">{c.plataforma_mais_forte === 'equilibrado' ? 'equilibrado' : NOME[c.plataforma_mais_forte]}</span>
              <span className="block text-muted">{c.por_que_mais_forte}</span>
            </p>
          </div>
        </div>
      </section>

      {/* números lado a lado */}
      <section className="cartao overflow-hidden">
        <div data-rolavel="x" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
              <tr className="border-b linha-fina"><th className="px-5 py-3 font-normal" /><th className="px-3 py-3 font-normal">Posts/semana</th><th className="px-3 py-3 font-normal">Views (média)</th><th className="px-3 py-3 font-normal">Engajamento</th><th className="px-3 py-3 font-normal">Duração</th></tr>
            </thead>
            <tbody>
              {r.contas.map((x) => (
                <tr key={x.plataforma} className="border-b linha-fina last:border-0">
                  <td className="px-5 py-3"><span className="flex items-center gap-2 font-medium"><IconePlataforma plataforma={x.plataforma} className="size-4" />{NOME[x.plataforma]} <span className="text-xs font-normal text-muted">@{x.conta}</span></span></td>
                  <td className="num px-3 py-3">{x.metricas.posts_por_semana != null ? fmtDec(x.metricas.posts_por_semana, 1) : '—'}</td>
                  <td className="num px-3 py-3">{fmtNum(x.metricas.mediana_views)}</td>
                  <td className="num px-3 py-3">{x.metricas.mediana_engajamento != null ? `${fmtDec(x.metricas.mediana_engajamento, 2)}%` : '—'}</td>
                  <td className="num px-3 py-3">{fmtDuracao(x.metricas.duracao_mediana_s) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* diferenças */}
      <section className="cartao p-6">
        <h3 className="titulo-display mb-4 text-lg font-semibold">O que muda entre as plataformas</h3>
        <div className="space-y-4">
          {c.diferencas.map((x) => (
            <div key={x.dimensao} className="border-b pb-4 linha-fina last:border-0 last:pb-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium">{DIMENSAO[x.dimensao] ?? x.dimensao}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${x.diferente ? 'bg-[var(--ambar)]/15 text-[var(--ambar)]' : 'bg-[var(--menta)]/15 text-[var(--menta)]'}`}>{x.diferente ? 'diferente' : 'igual nas duas'}</span>
              </div>
              <div className={`grid gap-2 ${plats.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {plats.map((p) => {
                  const como = x.por_plataforma.find((y) => y.plataforma === p)?.como_e
                  return (
                    <div key={p} className="rounded-xl bg-surface-secondary/50 p-3 text-sm leading-relaxed">
                      <span className="mb-1 flex items-center gap-1.5 text-[11px] text-muted"><IconePlataforma plataforma={p} className="size-3" />{NOME[p]}</span>
                      {como || '—'}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{x.leitura}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao p-6">
          <h3 className="titulo-display mb-3 text-lg font-semibold">O que funciona em cada uma</h3>
          <div className="space-y-4">
            {c.funciona_em_cada.map((x) => (
              <div key={x.plataforma}>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><IconePlataforma plataforma={x.plataforma} className="size-3.5" />{NOME[x.plataforma]}</p>
                <ul className="space-y-1.5">{x.itens.map((i) => <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="text-[var(--menta)]">↑</span>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
        <section className="cartao p-6">
          <h3 className="titulo-display mb-3 text-lg font-semibold">{r.papel === 'referencia' ? 'O que adaptar para você' : 'O que fazer com isso'}</h3>
          <ul className="space-y-2.5">{c.para_voce.map((i) => <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="text-accent">→</span>{i}</li>)}</ul>
        </section>
      </div>

      <p className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
        Comparado {fmtRelativo(r.gerado)}
        <button onClick={pedir} className="flex items-center gap-1 hover:text-foreground"><ArrowsRotateRight className="size-3" /> Comparar de novo</button>
      </p>
    </div>
  )
}
