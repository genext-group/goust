import { useMemo, useState, type ReactNode } from 'react'
import { urlCapa, type FormatoPost, type MarcaRadar, type Momento, type Plataforma, type Radar } from '../../api'
import { fmtDec, fmtNum } from '../../formato'
import { IconePlataforma } from '../Plataforma'

export const COR_FORMATO: Record<FormatoPost, { nome: string; cor: string }> = {
  reel: { nome: 'Reels', cor: '#6aa8ff' }, carrossel: { nome: 'Carrossel', cor: '#fbbf24' },
  foto: { nome: 'Foto', cor: '#34d399' }, tiktok: { nome: 'TikTok', cor: '#22d3ee' },
}
const MOMENTO: Record<Momento, { nome: string; cls: string }> = {
  acelerando: { nome: '↑ acelerando', cls: 'text-[var(--menta)]' }, estavel: { nome: 'estável', cls: 'text-muted' },
  esfriando: { nome: '↓ esfriando', cls: 'text-[var(--ambar)]' }, retomou: { nome: 'retomou', cls: 'text-accent' },
  parado: { nome: 'parado', cls: 'text-muted/70' },
}

function Delta({ v, sufixo = '%' }: { v: number | null; sufixo?: string }) {
  if (v === null || !isFinite(v)) return null
  const cls = v > 2 ? 'text-[var(--menta)]' : v < -2 ? 'text-[var(--ambar)]' : 'text-muted'
  return <span className={`num text-[11px] ${cls}`}>{v > 0 ? '+' : ''}{sufixo === '%' ? fmtDec(v, 0) : fmtNum(v)}{sufixo}</span>
}

/** 12 barrinhas: posts por semana (a última é a semana atual). */
export function Ritmo({ semanas, largura = 72 }: { semanas: number[]; largura?: number }) {
  const max = Math.max(...semanas, 1)
  return (
    <span className="inline-flex h-6 items-end gap-[2px]" style={{ width: largura }} title={`Posts por semana (12 semanas): ${semanas.join(', ')}`}>
      {semanas.map((n, i) => (
        <span key={i} className={`flex-1 rounded-[2px] ${i === semanas.length - 1 ? 'bg-foreground/35' : 'bg-foreground/70'}`}
          style={{ height: `${Math.max(n ? 12 : 4, (n / max) * 100)}%`, opacity: n ? 1 : 0.25 }} />
      ))}
    </span>
  )
}

function Avatares({ m, tamanho = 28 }: { m: MarcaRadar; tamanho?: number }) {
  return (
    <span className="flex shrink-0 -space-x-2">
      {m.contas.slice(0, 2).map((c) => (
        <span key={c.plataforma} className="relative grid place-items-center overflow-hidden rounded-full bg-surface-secondary text-[10px] text-muted uppercase ring-2 ring-[var(--surface)]"
          style={{ width: tamanho, height: tamanho }}>
          {c.conta[0]}
          {c.foto && <img src={c.foto} alt="" className="absolute inset-0 size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        </span>
      ))}
    </span>
  )
}

function Cartao({ rotulo, m, valor, sub, onClick, extra }: { rotulo: string; m?: MarcaRadar; valor: ReactNode; sub?: ReactNode; onClick?: () => void; extra?: ReactNode }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex min-w-0 flex-col gap-2 rounded-2xl border p-4 text-left transition-colors linha-fina enabled:hover:bg-surface-secondary/40">
      <span className="text-xs text-muted">{rotulo}</span>
      {m ? <span className="flex min-w-0 items-center gap-2"><Avatares m={m} tamanho={22} /><span className="truncate text-sm font-medium">{m.nome}</span></span> : null}
      <span className="num titulo-display text-2xl font-semibold">{valor}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {extra}
    </button>
  )
}

type Ordem = 'views' | 'posts' | 'engajamento' | 'seguidores'

/**
 * Radar do mercado: o que mudou nos perfis que você acompanha, calculado dos posts coletados todo dia.
 * Destaques → ranking (clique abre a marca) → ritmo e formatos → posts em alta (clique abre o post).
 */
export function RadarMercado({ r, aoAbrirMarca, aoAbrirPost }: {
  r: Radar; aoAbrirMarca: (m: MarcaRadar) => void; aoAbrirPost: (p: { plataforma: Plataforma; conta: string; id: string }) => void
}) {
  const [ordem, setOrdem] = useState<Ordem>('views')
  const outros = r.marcas.filter((m) => m.papel !== 'proprio')
  const voce = r.marcas.find((m) => m.papel === 'proprio')
  const ativos = outros.filter((m) => m.posts >= 3)
  const maior = <T,>(xs: T[], f: (x: T) => number | null) => xs.reduce<T | null>((a, x) => (f(x) ?? -Infinity) > (a ? f(a) ?? -Infinity : -Infinity) ? x : a, null)
  const acelerou = maior(ativos.filter((m) => m.views_delta !== null), (m) => m.views_delta)
  const ativo = maior(outros, (m) => m.posts)
  const engaja = maior(ativos, (m) => m.engajamento)
  const postMes = maior(outros.filter((m) => m.melhor), (m) => m.melhor!.views)
  const mk = r.mercado
  const dMercado = mk && mk.posts_30_antes ? (mk.posts_30 / mk.posts_30_antes - 1) * 100 : null

  const ranking = useMemo(() => {
    const f: Record<Ordem, (m: MarcaRadar) => number> = {
      views: (m) => m.views_mediana ?? -1, posts: (m) => m.posts, engajamento: (m) => m.engajamento ?? -1, seguidores: (m) => m.seguidores ?? -1,
    }
    return [...(voce ? [voce] : []), ...[...outros].sort((a, b) => f[ordem](b) - f[ordem](a))]
  }, [outros, voce, ordem])
  const maxSemana = mk ? Math.max(...mk.semanas.map((s) => Object.values(s).reduce((a, b) => a + b, 0)), 1) : 1

  const Cab = ({ k, children, className = '' }: { k: Ordem; children: ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 font-normal ${className}`}>
      <button onClick={() => setOrdem(k)} className={`hover:text-foreground ${ordem === k ? 'text-foreground' : ''}`}>{children}{ordem === k ? ' ↓' : ''}</button>
    </th>
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="titulo-display text-lg font-semibold">Radar do mercado</h3>
          <p className="text-sm text-muted">Calculado dos posts coletados todo dia · últimos {r.dias} dias contra os {r.dias} anteriores</p>
        </div>
        {mk && <p className="text-sm text-muted"><span className="num font-medium text-foreground">{mk.posts_30}</span> posts no mercado <Delta v={dMercado} /></p>}
      </div>

      {/* destaques */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {acelerou && <Cartao rotulo="Mais acelerou" m={acelerou} valor={<>+{fmtDec(acelerou.views_delta!, 0)}%</>} sub="na média de alcance por post" onClick={() => aoAbrirMarca(acelerou)} />}
        {ativo && <Cartao rotulo="Mais ativo" m={ativo} valor={ativo.posts} sub={`posts em ${r.dias} dias`} onClick={() => aoAbrirMarca(ativo)} />}
        {engaja && <Cartao rotulo="Maior engajamento" m={engaja} valor={<>{fmtDec(engaja.engajamento!, 1)}%</>} sub="curtidas + comentários ÷ views" onClick={() => aoAbrirMarca(engaja)} />}
        {postMes?.melhor && (
          <Cartao rotulo="Post do mês" m={postMes} valor={fmtNum(postMes.melhor.views)} sub={`views · ${COR_FORMATO[postMes.melhor.formato].nome}`}
            onClick={() => aoAbrirPost(postMes.melhor!)} />
        )}
      </div>

      {/* ranking */}
      <div className="overflow-hidden rounded-2xl border linha-fina">
        <div data-rolavel="x" className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b linha-fina">
                <th className="px-4 py-2.5 font-normal">Marca</th>
                <Cab k="seguidores">Seguidores</Cab>
                <Cab k="posts">Ritmo</Cab>
                <Cab k="views">Média de alcance</Cab>
                <Cab k="engajamento">Engajamento</Cab>
                <th className="px-3 py-2.5 font-normal">Momento</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((m) => (
                <tr key={m.chave} onClick={() => m.papel !== 'proprio' && aoAbrirMarca(m)}
                  className={`border-b transition-colors linha-fina last:border-0 ${m.papel === 'proprio' ? 'bg-accent/[0.06]' : 'cursor-pointer hover:bg-surface-secondary/40'}`}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <Avatares m={m} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{m.papel === 'proprio' ? `Você · ${m.nome}` : m.nome}</span>
                        <span className="flex items-center gap-1 text-[11px] text-muted">
                          {m.contas.map((c) => <IconePlataforma key={c.plataforma} plataforma={c.plataforma} className="size-3" />)}
                          {m.papel === 'referencia' ? 'referência' : m.papel === 'proprio' ? 'seu perfil' : 'concorrente'}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3"><span className="num block">{fmtNum(m.seguidores)}</span>
                    {m.seguidores_delta !== null ? <Delta v={m.seguidores_delta} sufixo="" /> : <span className="text-[11px] text-muted/70">acompanhando</span>}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-3"><Ritmo semanas={m.semanas} />
                      <span><span className="num block">{m.posts}</span><Delta v={m.posts_delta} /></span></span>
                  </td>
                  <td className="px-3 py-3"><span className="num block">{m.views_mediana !== null ? fmtNum(m.views_mediana) : '—'}</span><Delta v={m.views_delta} /></td>
                  <td className="num px-3 py-3">{m.engajamento !== null ? `${fmtDec(m.engajamento, 1)}%` : '—'}</td>
                  <td className="px-3 py-3 text-xs">{m.momento ? <span className={MOMENTO[m.momento].cls}>{MOMENTO[m.momento].nome}</span> : <span className="text-muted/60">sem dados</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted linha-fina">
          Ritmo: posts por semana nas últimas 12 semanas. Média de alcance: views típicas por post (posts com 2+ dias).
          {r.historico_seguidores_desde ? ` Seguidores: variação aparece com alguns dias de histórico (desde ${new Date(r.historico_seguidores_desde + 'T12:00').toLocaleDateString('pt-BR')}).` : ''}
        </p>
      </div>

      {mk && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-5 linha-fina">
            <p className="text-sm font-medium">Ritmo do mercado</p>
            <p className="mb-4 text-xs text-muted">Posts por semana, por formato (12 semanas)</p>
            <div className="flex h-36 items-end gap-1.5">
              {mk.semanas.map((s, i) => {
                const tot = Object.values(s).reduce((a, b) => a + b, 0)
                return (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${tot} posts`}>
                    {(Object.keys(COR_FORMATO) as FormatoPost[]).map((f) => s[f] ? (
                      <div key={f} style={{ height: `${(s[f] / maxSemana) * 100}%`, background: COR_FORMATO[f].cor, opacity: i === mk.semanas.length - 1 ? 0.5 : 0.9 }} className="w-full first:rounded-t-[3px]" />
                    ) : null)}
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted"><span>{new Date(mk.inicio_semanas + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span><span>semana atual</span></div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
              {(Object.keys(COR_FORMATO) as FormatoPost[]).map((f) => <span key={f} className="flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: COR_FORMATO[f].cor }} />{COR_FORMATO[f].nome}</span>)}
            </div>
          </div>
          <div className="rounded-2xl border p-5 linha-fina">
            <p className="text-sm font-medium">O que está funcionando</p>
            <p className="mb-4 text-xs text-muted">Formatos nos últimos 60 dias: quanto o mercado usa × o retorno médio</p>
            <div className="space-y-3.5">
              {mk.por_formato.map((f) => (
                <div key={f.formato}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full" style={{ background: COR_FORMATO[f.formato].cor }} />{COR_FORMATO[f.formato].nome}
                      <span className="text-xs text-muted">{fmtDec(f.parcela, 0)}% dos posts</span></span>
                    <span className="num text-xs text-muted">
                      {f.views !== null ? `${fmtNum(f.views)} views · ` : ''}{f.interacoes !== null ? `${fmtNum(f.interacoes)} interações` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full" style={{ width: `${f.parcela}%`, background: COR_FORMATO[f.formato].cor }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mk && mk.em_alta.length > 0 && (
        <div>
          <p className="text-sm font-medium">Em alta nas últimas 2 semanas</p>
          <p className="mb-3 text-xs text-muted">Posts que mais superaram a média da própria conta</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {mk.em_alta.map((p) => (
              <button key={p.id} onClick={() => aoAbrirPost(p)} className="group text-left">
                <span className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-surface-secondary">
                  <img src={urlCapa(p.plataforma, p.conta, p.id)} alt="" loading="lazy"
                    className={`size-full transition-transform duration-500 group-hover:scale-[1.04] ${p.formato === 'carrossel' || p.formato === 'foto' ? 'object-contain' : 'object-cover'}`} />
                  <span className="num absolute top-1.5 left-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {p.vezes >= 100 ? '100×+' : `${fmtDec(p.vezes, 1)}×`}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs font-medium">{p.marca}</span>
                <span className="num block text-[11px] text-muted">{fmtNum(p.views)} views</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** Evolução de uma marca (aba Perfis): ritmo semanal, alcance por mês e seguidores. */
export function EvolucaoMarca({ m }: { m: MarcaRadar }) {
  const maxV = Math.max(...m.por_mes.map((x) => x.views ?? 0), 1)
  const nomeMes = (s: string) => new Date(s + '-15T12:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border bg-[var(--border)] linha-fina sm:grid-cols-3">
      <div className="bg-[var(--surface)] p-4">
        <p className="text-xs text-muted">Ritmo · 12 semanas</p>
        <div className="mt-2 flex items-end justify-between gap-3"><Ritmo semanas={m.semanas} largura={120} />
          <span className="text-right"><span className="num block text-lg font-semibold">{m.posts}</span><span className="text-[11px] text-muted">posts/30d</span> <Delta v={m.posts_delta} /></span></div>
      </div>
      <div className="bg-[var(--surface)] p-4">
        <p className="text-xs text-muted">Média de alcance por mês</p>
        <div className="mt-2 flex h-10 items-end gap-1.5">
          {m.por_mes.map((x) => (
            <div key={x.mes} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${nomeMes(x.mes)}: ${x.views !== null ? fmtNum(x.views) + ' views' : 'sem views'} · ${x.posts} posts`}>
              <div className="w-full rounded-[3px] bg-foreground/70" style={{ height: `${x.views ? Math.max(8, (x.views / maxV) * 100) : 4}%`, opacity: x.views ? 1 : 0.2 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-[10px] text-muted">{m.por_mes.map((x) => <span key={x.mes} className="flex-1 text-center">{nomeMes(x.mes)}</span>)}</div>
      </div>
      <div className="bg-[var(--surface)] p-4">
        <p className="text-xs text-muted">Seguidores</p>
        <p className="num mt-2 text-lg font-semibold">{fmtNum(m.seguidores)} {m.seguidores_delta !== null && <Delta v={m.seguidores_delta} sufixo="" />}</p>
        <p className="text-[11px] text-muted">
          {m.momento ? <span className={MOMENTO[m.momento].cls}>{MOMENTO[m.momento].nome}</span> : null}
          {m.seguidores_delta === null && m.seguidores_desde ? ` · variação a partir de ${new Date(m.seguidores_desde + 'T12:00').toLocaleDateString('pt-BR')}` : ''}
        </p>
      </div>
    </div>
  )
}
