import { Bulb, ChartLine, Compass, Megaphone, Rocket, Sparkles, Target } from '@gravity-ui/icons'
import type { Conta, RegistroPanorama } from '../../api'
import { AvatarConta } from '../Avatar'
import { ListaIdeias, ListaOportunidades } from './Blocos'
import { Feedback, Insight, ListaItens, Secao, TextoComVideos } from './Compartilhado'

const AMEACA = { alto: 'var(--danger)', medio: 'var(--warning)', baixo: 'var(--success)' }

export function PanoramaMercado({ r, contas }: { r: RegistroPanorama; contas: Conta[] }) {
  const p = r.panorama
  const contaDe = (chave: string) => contas.find((c) => `${c.plataforma}/${c.conta}` === chave)

  return (
    <div className="space-y-4">
      <section className="cartao group/insight relative p-6">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
          <Sparkles className="size-3.5" /> Resumo do mercado · {r.perfis.length} perfis
        </p>
        <p className="titulo-display text-[19px] leading-relaxed"><TextoComVideos texto={p.resumo_do_mercado} /></p>
        <div className="mt-3 flex justify-end"><Feedback secao="resumo_do_mercado" item={p.resumo_do_mercado} /></div>
      </section>

      <Secao titulo="Quem é quem" icone={<Compass />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {p.concorrentes.map((c) => {
            const conta = contaDe(c.perfil)
            return (
              <article key={c.perfil} className="group/insight relative rounded-2xl bg-surface-secondary p-4">
                <div className="flex items-center gap-3">
                  {conta && <AvatarConta conta={conta} tamanho="sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{conta?.perfil?.nome || conta?.nome || c.perfil}</p>
                    <p className="truncate text-xs text-muted">{c.perfil}</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: AMEACA[c.nivel_de_ameaca], background: `color-mix(in srgb, ${AMEACA[c.nivel_de_ameaca]} 12%, transparent)` }}>
                    ameaça {c.nivel_de_ameaca === 'medio' ? 'média' : c.nivel_de_ameaca === 'alto' ? 'alta' : 'baixa'}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed">{c.posicionamento_curto}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div><dt className="inline text-muted">Público: </dt><dd className="inline">{c.publico}</dd></div>
                  <div><dt className="inline text-muted">Tom: </dt><dd className="inline">{c.tom}</dd></div>
                  <div><dt className="inline text-success">Força: </dt><dd className="inline">{c.forca_principal}</dd></div>
                  <div><dt className="inline text-danger">Fraqueza: </dt><dd className="inline">{c.fraqueza_principal}</dd></div>
                </dl>
                <div className="mt-2 flex justify-end"><Feedback secao="concorrentes" item={`${c.perfil}: ${c.posicionamento_curto}`} /></div>
              </article>
            )
          })}
        </div>
      </Secao>

      <Secao titulo="Benchmarks" icone={<ChartLine />}>
        <ul className="divide-y linha-fina [&>li]:linha-fina">
          {p.benchmarks.map((b) => (
            <Insight key={b.metrica} secao="benchmarks" texto={`${b.metrica}: ${b.lider} (${b.valor}) — ${b.comentario}`}>
              <div className="grid gap-1 sm:grid-cols-[180px_1fr]">
                <p className="text-sm text-muted">{b.metrica}</p>
                <div>
                  <p className="font-medium">{b.lider} <span className="num font-normal text-muted">· {b.valor}</span></p>
                  <p className="text-sm leading-relaxed text-muted">{b.comentario}</p>
                </div>
              </div>
            </Insight>
          ))}
        </ul>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Narrativas dominantes" icone={<Megaphone />} descricao="O que todo mundo está dizendo.">
          <ListaItens secao="narrativas_dominantes" itens={p.narrativas_dominantes} />
        </Secao>
        <Secao titulo="Temas saturados" icone={<Target />} descricao="Difícil se diferenciar aqui.">
          <ListaItens secao="temas_saturados" itens={p.temas_saturados} />
        </Secao>
      </div>

      <Secao titulo="Tendências" icone={<Rocket />}><ListaItens secao="tendencias" itens={p.tendencias} /></Secao>

      <Secao titulo="Espaços em branco" icone={<Compass />} descricao="Posicionamentos, dores, formatos ou públicos que ninguém ocupa bem.">
        <ListaOportunidades secao="espacos_em_branco" itens={p.espacos_em_branco} />
      </Secao>

      <Secao titulo="Recomendações para você" icone={<Target />}>
        <ListaOportunidades secao="recomendacoes_para_voce" itens={p.recomendacoes_para_voce} />
      </Secao>

      <Secao titulo="Ideias de conteúdo" icone={<Bulb />}>
        <ListaIdeias secao="ideias_de_conteudo_mercado" itens={p.ideias_de_conteudo} />
      </Secao>
    </div>
  )
}
