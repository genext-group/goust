import { Bulb, ChartLine, CircleExclamation, Compass, Flag, Rocket, Sparkles, Star, Target } from '@gravity-ui/icons'
import type { RegistroEstrategia } from '../../api'
import { ListaIdeias, ListaOportunidades } from '../ia/Blocos'
import { Feedback, Insight, ListaItens, Secao, TextoComVideos } from '../ia/Compartilhado'

const CONFIANCA = { alto: ['alta', 'var(--success)'], medio: ['média', 'var(--warning)'], baixo: ['baixa', 'var(--danger)'] }

export function EstrategiaView({ r }: { r: RegistroEstrategia }) {
  const e = r.estrategia
  const [nomeConf, corConf] = CONFIANCA[e.nivel_de_confianca]

  return (
    <div className="space-y-4">
      <section className="cartao group/insight relative p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
            <Sparkles className="size-3.5" /> Diagnóstico
          </p>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: corConf, background: `color-mix(in srgb, ${corConf} 12%, transparent)` }}>
            confiança {nomeConf}
          </span>
        </div>
        <p className="text-[17px] leading-[1.7] text-foreground/90"><TextoComVideos texto={e.resumo} /></p>
        <div className="mt-3 flex justify-end"><Feedback secao="estrategia.resumo" item={e.resumo} /></div>
        {e.o_que_falta_para_melhorar.length > 0 && (
          <div className="mt-2 rounded-xl bg-surface-secondary p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-medium"><CircleExclamation className="size-3.5 text-warning" /> Para melhorar esta análise</p>
            <ul className="list-disc space-y-0.5 pl-5 text-muted">{e.o_que_falta_para_melhorar.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      </section>

      <Secao titulo="Você contra os concorrentes" icone={<ChartLine />} descricao="Números reais dos perfis catalogados.">
        <div data-rolavel="x" className="-mx-2 overflow-x-auto">
          <table className="num w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                {['Métrica', 'Você', 'Média deles', 'Melhor', 'Leitura'].map((h) => <th key={h} className="px-2 pb-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y linha-fina [&>tr]:linha-fina">
              {e.benchmark.map((b) => (
                <tr key={b.metrica} className="align-top">
                  <td className="px-2 py-2.5 font-medium">{b.metrica}</td>
                  <td className="px-2 py-2.5">{b.voce}</td>
                  <td className="px-2 py-2.5">{b.media_concorrentes}</td>
                  <td className="px-2 py-2.5">{b.melhor}</td>
                  <td className="px-2 py-2.5 text-muted">{b.leitura}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Onde você está atrás" icone={<CircleExclamation />}><ListaItens secao="estrategia.atras" itens={e.onde_voce_esta_atras} /></Secao>
        <Secao titulo="Onde você já ganha" icone={<Star />}><ListaItens secao="estrategia.ganha" itens={e.onde_voce_ganha} /></Secao>
      </div>

      <Secao titulo="Posicionamento recomendado" icone={<Compass />}>
        <div className="group/insight relative">
          <p className="titulo-display text-xl leading-snug">“{e.posicionamento_recomendado.frase}”</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted uppercase">Para quem</dt><dd className="mt-0.5 leading-relaxed">{e.posicionamento_recomendado.para_quem}</dd></div>
            <div><dt className="text-xs text-muted uppercase">Contra quem</dt><dd className="mt-0.5 leading-relaxed">{e.posicionamento_recomendado.contra_quem}</dd></div>
            <div><dt className="text-xs text-muted uppercase">Por que você</dt><dd className="mt-0.5 leading-relaxed">{e.posicionamento_recomendado.por_que_voce}</dd></div>
          </dl>
          <div className="mt-2 flex justify-end"><Feedback secao="estrategia.posicionamento" item={e.posicionamento_recomendado.frase} /></div>
        </div>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Secao titulo="Pilares de conteúdo" icone={<Target />}>
          <ul className="divide-y linha-fina [&>li]:linha-fina">
            {e.pilares.map((p) => (
              <Insight key={p.nome} secao="estrategia.pilares" texto={`${p.nome}: ${p.objetivo}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{p.nome}</p>
                  <span className="num text-sm text-muted">{p.participacao_pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.participacao_pct)}%` }} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.objetivo}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...p.formatos, ...p.temas].map((x) => <span key={x} className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs">{x}</span>)}
                </div>
              </Insight>
            ))}
          </ul>
        </Secao>
        <div className="space-y-4">
          <Secao titulo="Mix por semana" icone={<Flag />}>
            <ul className="space-y-3">
              {e.mix_de_formatos.map((m) => (
                <li key={m.formato}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{m.formato}</p>
                    <span className="num text-sm font-semibold text-accent">{m.por_semana}×</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{m.por_que}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm"><span className="text-muted">Frequência: </span>{e.frequencia}</p>
            <p className="mt-1 text-sm"><span className="text-muted">Tom de voz: </span>{e.tom_de_voz}</p>
          </Secao>
        </div>
      </div>

      <Secao titulo="Metas para 90 dias" icone={<Rocket />}>
        <div className="grid gap-3 md:grid-cols-2">
          {e.metas.map((m) => (
            <div key={m.metrica} className="rounded-2xl bg-surface-secondary p-4">
              <p className="text-xs tracking-wide text-muted uppercase">{m.metrica}</p>
              <p className="num mt-1 text-lg font-semibold">{m.atual} → <span className="text-accent">{m.meta_90_dias}</span></p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{m.como}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Prioridades dos próximos 90 dias" icone={<Target />}>
        <ListaOportunidades secao="estrategia.prioridades" itens={e.prioridades_90_dias} />
      </Secao>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="O que adaptar de concorrentes e referências" icone={<Bulb />}>
          <ListaOportunidades secao="estrategia.adaptar" itens={e.o_que_adaptar_dos_concorrentes} />
        </Secao>
        <Secao titulo="Espaços livres" icone={<Compass />}>
          <ListaOportunidades secao="estrategia.espacos" itens={e.espacos_livres} />
        </Secao>
      </div>
      <Secao titulo="Primeiras ideias para o calendário" icone={<Bulb />}>
        <ListaIdeias secao="estrategia.ideias" itens={e.primeiras_ideias} />
      </Secao>
    </div>
  )
}
