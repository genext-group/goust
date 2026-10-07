import { Bulb, ChartLine, CircleExclamation, Comments, Compass, Flag, Megaphone, Rocket, Sparkles, Star, Target } from '@gravity-ui/icons'
import type { RegistroRelatorio } from '../../api'
import { fmtDec, fmtDuracao, fmtNum } from '../../formato'
import { ListaIdeias, ListaOportunidades } from './Blocos'
import { Feedback, Insight, ListaItens, Secao, SeloDesempenho, semAspas, TextoComVideos } from './Compartilhado'

const NOME_NOTA: Record<string, string> = {
  consistencia: 'Consistência', ganchos: 'Ganchos', clareza_da_mensagem: 'Clareza', producao: 'Produção', engajamento: 'Engajamento',
}

export function RelatorioPerfil({ r }: { r: RegistroRelatorio }) {
  const rel = r.relatorio
  const ref = r.papel === 'referencia'
  const m = r.metricas
  const notas = Object.entries(rel.notas).filter(([k]) => k !== 'justificativa') as [string, number][]
  const media = notas.reduce((s, [, n]) => s + n, 0) / notas.length

  return (
    <div className="space-y-4">
      {/* Resumo + notas */}
      <section className="cartao overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_280px]">
          <div className="group/insight relative">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
              <Sparkles className="size-3.5" /> Resumo executivo
              {r.papel && r.papel !== 'proprio' && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal ${ref ? 'bg-accent/15' : 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]'}`}>
                  analisado como {ref ? 'referência' : 'concorrente'}
                </span>
              )}
            </p>
            {r.contexto?.nota && <p className="mb-3 text-xs text-muted italic">Seu contexto: “{r.contexto.nota}”</p>}
            <p className="text-[17px] leading-[1.7] text-foreground/90"><TextoComVideos texto={rel.resumo_executivo} /></p>
            <div className="mt-3 flex justify-end"><Feedback secao="resumo_executivo" item={rel.resumo_executivo} /></div>
          </div>
          <div className="space-y-3 rounded-2xl bg-surface-secondary p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Nota geral</span>
              <span className="num titulo-display text-3xl font-semibold">{fmtDec(media, 1)}</span>
            </div>
            {notas.map(([k, n]) => (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-xs"><span>{NOME_NOTA[k]}</span><span className="num text-muted">{n}/10</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${n * 10}%`, opacity: 0.35 + n / 15 }} />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs leading-relaxed text-muted">{rel.notas.justificativa}</p>
          </div>
        </div>
        <div className="num grid grid-cols-2 border-t linha-fina sm:grid-cols-5">
          {[
            ['Posts no catálogo', fmtNum(m.videos)],
            ['Posts/semana', m.posts_por_semana?.toLocaleString('pt-BR') ?? '—'],
            ['Views (média)', fmtNum(m.mediana_views)],
            ['Engajamento (média)', m.mediana_engajamento != null ? `${fmtDec(m.mediana_engajamento, 2)}%` : '—'],
            ['Duração (média)', m.duracao_mediana_s ? fmtDuracao(Math.round(m.duracao_mediana_s)) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="border-r p-4 linha-fina last:border-r-0">
              <p className="text-[11px] tracking-wide text-muted uppercase">{k}</p>
              <p className="mt-0.5 text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Posicionamento */}
      <Secao titulo="Posicionamento" icone={<Compass />} descricao="Como a marca quer ser percebida, segundo o que ela publica.">
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <ul className="divide-y linha-fina [&>li]:linha-fina">
            <Insight secao="posicionamento.proposta_de_valor" texto={rel.posicionamento.proposta_de_valor}><Rotulo r="Proposta de valor" t={rel.posicionamento.proposta_de_valor} /></Insight>
            <Insight secao="posicionamento.publico_alvo" texto={rel.posicionamento.publico_alvo}><Rotulo r="Público-alvo" t={rel.posicionamento.publico_alvo} /></Insight>
            <Insight secao="posicionamento.categoria" texto={rel.posicionamento.categoria_percebida}><Rotulo r="Categoria percebida" t={rel.posicionamento.categoria_percebida} /></Insight>
          </ul>
          <ul className="divide-y linha-fina [&>li]:linha-fina">
            <Insight secao="posicionamento.tom" texto={rel.posicionamento.tom_de_voz}><Rotulo r="Tom de voz" t={rel.posicionamento.tom_de_voz} /></Insight>
            <Insight secao="posicionamento.arquetipo" texto={rel.posicionamento.arquetipo}><Rotulo r="Arquétipo" t={rel.posicionamento.arquetipo} /></Insight>
            <li className="py-3">
              <p className="text-xs tracking-wide text-muted uppercase">Diferenciais declarados</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rel.posicionamento.diferenciais.map((d) => <span key={d} className="rounded-full bg-surface-secondary px-2.5 py-1 text-sm">{d}</span>)}
              </div>
            </li>
          </ul>
        </div>
      </Secao>

      {/* Perfil, cadência e voz do público (relatórios a partir da versão 2) */}
      {(rel.perfil_e_bio?.length || rel.cadencia) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {!!rel.perfil_e_bio?.length && (
            <Secao titulo="Perfil e bio" icone={<Target />} descricao="Bio, links e chamada para ação do perfil.">
              <ListaItens secao="perfil_e_bio" itens={rel.perfil_e_bio} />
            </Secao>
          )}
          {rel.cadencia && (
            <Secao titulo="Cadência" icone={<ChartLine />} descricao="Quando publicam e quando performa melhor (horário de Brasília).">
              <ul className="divide-y linha-fina [&>li]:linha-fina">
                <Insight secao="cadencia" texto={rel.cadencia.resumo} />
              </ul>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Rotulos titulo="Melhores dias" itens={rel.cadencia.melhores_dias} />
                <Rotulos titulo="Melhores horários" itens={rel.cadencia.melhores_horarios} />
              </div>
              <p className="mt-3 rounded-xl border-l-2 border-accent bg-surface-secondary px-3 py-2 text-sm leading-relaxed">
                <span className="font-medium text-accent">Para você: </span>{rel.cadencia.frequencia_recomendada}
              </p>
            </Secao>
          )}
        </div>
      )}

      {rel.voz_do_publico && (
        <Secao titulo="Voz do público" icone={<Comments />}
          descricao="O que as pessoas perguntam, objetam, pedem e elogiam nos comentários. Matéria-prima de roteiro.">
          <p className="mb-2 text-[15px] leading-relaxed">{rel.voz_do_publico.sentimento_geral}</p>
          <div className="grid gap-x-8 lg:grid-cols-2">
            {([['duvidas', 'Dúvidas'], ['objecoes', 'Objeções'], ['pedidos', 'Pedidos'], ['elogios', 'Elogios']] as const).map(([k, nome]) =>
              rel.voz_do_publico![k].length ? (
                <div key={k} className="mt-3">
                  <p className="text-xs tracking-wide text-muted uppercase">{nome}</p>
                  <ListaItens secao={`voz.${k}`} itens={rel.voz_do_publico![k]} />
                </div>
              ) : null,
            )}
          </div>
        </Secao>
      )}

      {/* O que diz */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Mensagens centrais" icone={<Megaphone />}><ListaItens secao="mensagens_centrais" itens={rel.mensagens_centrais} /></Secao>
        <Secao titulo="Dores e desejos explorados" icone={<Target />}><ListaItens secao="dores_e_desejos" itens={rel.dores_e_desejos} /></Secao>
        <Secao titulo="Provas e argumentos" icone={<Star />}><ListaItens secao="provas_e_argumentos" itens={rel.provas_e_argumentos} /></Secao>
        <Secao titulo="Chamadas para ação" icone={<Flag />}><ListaItens secao="ctas" itens={rel.ctas} /></Secao>
      </div>

      {/* Pilares */}
      <Secao titulo="Pilares de conteúdo" icone={<ChartLine />} descricao="Participação no conteúdo e desempenho comparado à média da própria conta.">
        <ul className="divide-y linha-fina [&>li]:linha-fina">
          {rel.pilares.map((p) => (
            <Insight key={p.nome} secao="pilares" texto={`${p.nome}: ${p.descricao}`} videos={p.videos}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{p.nome}</p>
                <SeloDesempenho d={p.desempenho} />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.participacao_pct)}%` }} />
                </div>
                <span className="num w-10 text-right text-sm text-muted">{p.participacao_pct}%</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted"><TextoComVideos texto={p.descricao} /></p>
            </Insight>
          ))}
        </ul>
      </Secao>

      {/* Formatos + ganchos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Formatos" icone={<ChartLine />}>
          <ul className="divide-y linha-fina [&>li]:linha-fina">
            {rel.formatos.map((f) => (
              <Insight key={f.formato} secao="formatos" texto={`${f.formato}: ${f.observacao}`}>
                <p className="font-medium">{f.formato} <span className="num text-sm font-normal text-muted">· {f.participacao_pct}%</span></p>
                <SeloDesempenho d={f.desempenho} />
                <p className="mt-1 text-sm leading-relaxed text-muted"><TextoComVideos texto={f.observacao} /></p>
              </Insight>
            ))}
          </ul>
        </Secao>
        <Secao titulo="Ganchos que eles usam" icone={<Bulb />}>
          <ul className="divide-y linha-fina [&>li]:linha-fina">
            {rel.ganchos.map((g) => (
              <Insight key={g.padrao} secao="ganchos" texto={`${g.padrao} — ${g.por_que_funciona}`} videos={g.videos}>
                <p className="font-medium">{g.padrao}</p>
                <p className="mt-1 text-sm italic">“{semAspas(g.exemplo)}”</p>
                <p className="mt-1 text-sm leading-relaxed text-muted"><TextoComVideos texto={g.por_que_funciona} /></p>
              </Insight>
            ))}
          </ul>
        </Secao>
      </div>

      {/* Performa / não performa */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="O que performa" icone={<Rocket />}><ListaItens secao="o_que_performa" itens={rel.o_que_performa} /></Secao>
        <Secao titulo="O que não performa" icone={<CircleExclamation />}><ListaItens secao="o_que_nao_performa" itens={rel.o_que_nao_performa} /></Secao>
        <Secao titulo="Pontos fortes" icone={<Star />}><ListaItens secao="pontos_fortes" itens={rel.pontos_fortes} /></Secao>
        <Secao titulo={ref ? "O que não copiar" : "Pontos fracos"} icone={<CircleExclamation />}><ListaItens secao="pontos_fracos" itens={rel.pontos_fracos} /></Secao>
      </div>

      {rel.mudancas_desde_ultima_analise.length > 0 && (
        <Secao titulo="O que mudou" icone={<Comments />} descricao="Comparado à análise anterior (ou aos 30 dias anteriores).">
          <ListaItens secao="mudancas" itens={rel.mudancas_desde_ultima_analise} />
        </Secao>
      )}

      <Secao titulo={ref ? "O que adaptar para você" : "Oportunidades para você"} icone={<Target />} descricao={ref ? "O que levar dessa referência para o seu negócio. Ações testáveis já na próxima semana." : "Onde você pode ganhar desse concorrente. Ações testáveis já na próxima semana."}>
        <ListaOportunidades secao="oportunidades_para_voce" itens={rel.oportunidades_para_voce} />
      </Secao>

      <Secao titulo="Ideias de conteúdo" icone={<Bulb />} descricao="Ideias originais para o seu perfil, inspiradas no que funciona aqui.">
        <ListaIdeias secao="ideias_de_conteudo" itens={rel.ideias_de_conteudo} />
      </Secao>

      <p className="pb-4 text-center text-xs text-muted">
        Baseado em {r.videos_analisados.length} vídeos analisados (áudio, imagem e legenda). Passe o mouse num insight para avaliá-lo.
      </p>
    </div>
  )
}

function Rotulos({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted uppercase">{titulo}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {itens.map((x) => <span key={x} className="rounded-full bg-surface-secondary px-2.5 py-1 text-sm">{x}</span>)}
      </div>
    </div>
  )
}

function Rotulo({ r, t }: { r: string; t: string }) {
  return (
    <>
      <p className="text-xs tracking-wide text-muted uppercase">{r}</p>
      <p className="mt-0.5 text-[15px] leading-relaxed">{t}</p>
    </>
  )
}
