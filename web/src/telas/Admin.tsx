import { Button, Drawer, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { ArrowRotateRight, CircleExclamation, Magnifier, Pause, Play } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { admin, type ControlesAdmin, type DetalheUsuarioAdmin, type EventoAdmin, type OperacaoAdmin, type PlanoId, type SaudeAdmin, type UsuarioAdmin, type VisaoAdmin } from '../api'
import { aura } from '../aura'
import { Selecao } from '../components/ui/Selecao'
import { fmtNum, fmtRelativo } from '../formato'
import { tocar } from '../sons'

type Sub = 'visao' | 'usuarios' | 'custos' | 'operacao'
const PLANOS: { valor: PlanoId; rotulo: string; preco: number }[] = [
  { valor: 'gratis', rotulo: 'Grátis', preco: 0 }, { valor: 'criador', rotulo: 'Criador', preco: 79 },
  { valor: 'pro', rotulo: 'Pro', preco: 179 }, { valor: 'agencia', rotulo: 'Agência', preco: 449 },
]
const nomePlano = (p: string) => PLANOS.find((x) => x.valor === p)?.rotulo ?? p

let DOLAR = 5.4
const brl = (usd: number, casas = 2) => `R$ ${(usd * DOLAR).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: v < 1 ? 3 : 2 })}`
const quando = (epoch?: number | null) => (epoch ? fmtRelativo(new Date(epoch * 1000).toISOString()) : 'nunca')

const OPERACOES: Record<string, string> = {
  perfil: 'Análise de perfil', mercado: 'Panorama do mercado', estrategia: 'Estratégia', calendario: 'Calendário',
  roteiro: 'Roteiro', imagem: 'Imagem', estilo: 'Guia de estilo', inteligencia: 'Rotina (manual)', coleta: 'Coleta de posts',
  analise_video: 'Análise de vídeos', 'rotina:mercado': 'Rotina · sinais', 'rotina:descoberta': 'Rotina · descoberta',
  'rotina:ideias': 'Rotina · ideias', historico: 'Antes do registro detalhado',
}
const nomeOperacao = (o: string) => OPERACOES[o] ?? (o.startsWith('api:') ? o.replace(/^api:api_/, '').replace(/_/g, ' ') : o)

function textoEvento(e: EventoAdmin) {
  const d = e.dados as Record<string, string | boolean | null>
  const conta = d.conta ? ` @${d.conta}` : ''
  if (e.tipo === 'cadastro') return 'Criou a conta'
  if (e.tipo === 'sessao') return 'Abriu o app'
  if (e.tipo === 'download') return 'Baixou posts'
  if (e.tipo === 'acompanhar') return `Adicionou${conta} como ${d.papel === 'referencia' ? 'referência' : d.papel === 'proprio' ? 'perfil próprio' : 'concorrente'}${d.com_contexto ? ' (com contexto)' : ''}`
  if (e.tipo === 'admin:controles') return `Admin alterou: ${Object.entries(d).filter(([k]) => k !== 'por').map(([k, v]) => `${k} = ${v ?? '—'}`).join(', ')}`
  if (e.tipo === 'admin:rotina') return 'Admin rodou a rotina'
  if (e.tipo.startsWith('ia:')) return `Pediu ${nomeOperacao(e.tipo.slice(3)).toLowerCase()}${conta}`
  if (e.tipo.startsWith('erro:')) return `Falhou: ${nomeOperacao(e.tipo.slice(5)).toLowerCase()}${conta}${d.erro ? ` — ${String(d.erro).slice(0, 140)}` : ''}`
  return e.tipo
}
const corEvento = (t: string) => t.startsWith('erro:') ? 'var(--sinal-b)' : t.startsWith('admin:') ? 'var(--ambar)' : t.startsWith('ia:') ? 'var(--accent)' : t === 'cadastro' ? 'var(--menta)' : 'var(--muted)'

// ---------------------------------------------------------------- peças visuais

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: 'bom' | 'alerta' }) {
  return (
    <div className="cartao p-4">
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={`num titulo-display mt-1 text-2xl font-semibold ${tom === 'alerta' ? 'text-[var(--sinal-b)]' : tom === 'bom' ? 'text-[var(--menta)]' : ''}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-muted">{detalhe}</p>}
    </div>
  )
}

/** Barras por dia, empilhadas (cada série com sua cor). Passe o mouse para ver o dia. */
function BarrasDia<T extends { dia: string }>({ dados, series, altura = 140, formatar }: {
  dados: T[]; series: { chave: keyof T; cor: string; rotulo: string }[]; altura?: number; formatar: (v: number) => string
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const total = (d: T) => series.reduce((s, x) => s + Number(d[x.chave] || 0), 0)
  const max = Math.max(...dados.map(total), 0.000001)
  const d = ativo !== null ? dados[ativo] : null
  return (
    <div>
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {d ? (
          <>
            <span className="font-medium text-foreground">{new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
            {series.map((s) => <span key={String(s.chave)}><i className="mr-1 inline-block size-2 rounded-full" style={{ background: s.cor }} />{s.rotulo}: {formatar(Number(d[s.chave] || 0))}</span>)}
          </>
        ) : series.map((s) => <span key={String(s.chave)}><i className="mr-1 inline-block size-2 rounded-full" style={{ background: s.cor }} />{s.rotulo}</span>)}
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: altura }} onMouseLeave={() => setAtivo(null)}>
        {dados.map((x, i) => (
          <div key={x.dia} onMouseEnter={() => setAtivo(i)} className="flex h-full flex-1 flex-col justify-end rounded-md transition-colors hover:bg-surface-secondary/60">
            {series.map((s) => {
              const v = Number(x[s.chave] || 0)
              return v > 0 ? <div key={String(s.chave)} style={{ height: `${(v / max) * 100}%`, background: s.cor, opacity: ativo === null || ativo === i ? 1 : 0.45 }}
                className="w-full min-h-[2px] first:rounded-t-md transition-opacity" /> : null
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{dados[0] && new Date(dados[0].dia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
        <span>hoje</span>
      </div>
    </div>
  )
}

function Barra({ valor, max, cor = 'var(--accent)' }: { valor: number; max: number; cor?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (valor / Math.max(max, 1e-9)) * 100)}%`, background: cor }} /></div>
}

function Secao({ titulo, acao, children, className = '' }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`cartao p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="titulo-display font-semibold">{titulo}</h3>{acao}</div>
      {children}
    </section>
  )
}

function Chip({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'bom' | 'alerta' | 'accent' | 'aviso' }) {
  const cls = { neutro: 'bg-surface-secondary text-muted', bom: 'bg-[var(--menta)]/15 text-[var(--menta)]', alerta: 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]',
    accent: 'bg-accent/15 text-accent', aviso: 'bg-[var(--ambar)]/15 text-[var(--ambar)]' }[tom]
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
}

function Avatar({ email }: { email: string | null }) {
  const e = email || '?'
  return <span className="aura grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white uppercase" style={aura(e)}>{e.slice(0, 1)}</span>
}

function LinhaTempo({ eventos, comEmail = false }: { eventos: EventoAdmin[]; comEmail?: boolean }) {
  if (!eventos.length) return <p className="text-sm text-muted">Nada registrado ainda.</p>
  return (
    <ol className="space-y-2.5">
      {eventos.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: corEvento(e.tipo) }} />
          <span className="min-w-0 flex-1">
            <span className="block break-words">{comEmail && e.email && <span className="font-medium">{e.email.split('@')[0]} · </span>}{textoEvento(e)}</span>
            <span className="text-xs text-muted">{fmtRelativo(e.ts)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Saude({ s }: { s: SaudeAdmin }) {
  const itens: [string, ReactNode, 'bom' | 'alerta' | 'aviso' | 'neutro'][] = [
    ['OpenAI', s.openai ? 'conectada' : 'sem chave', s.openai ? 'bom' : 'alerta'],
    ['Créditos da API de dados', s.saldo_dados == null ? '—' : fmtNum(s.saldo_dados), s.saldo_dados == null ? 'neutro' : s.saldo_dados < 500 ? 'alerta' : s.saldo_dados < 2000 ? 'aviso' : 'bom'],
    ['Tarefas rodando', `${s.tarefas.ativas}${s.tarefas.travadas ? ` · ${s.tarefas.travadas} travada(s)` : ''}`, s.tarefas.travadas ? 'alerta' : 'neutro'],
    ['Erros (24 h)', s.tarefas.erros_24h, s.tarefas.erros_24h ? 'aviso' : 'bom'],
    ['Rotina diária', `${quando(s.rotina.ultima)}${s.rotina.com_falha ? ` · ${s.rotina.com_falha} com falha` : ''}`, s.rotina.com_falha ? 'aviso' : 'bom'],
    ['Lote (7 dias)', s.lote_ativo ? Object.entries(s.lote).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nada ainda' : 'desligado', s.lote.erro ? 'aviso' : 'neutro'],
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map(([r, v, t]) => (
        <div key={r} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-secondary/50 px-4 py-3">
          <span className="text-sm text-muted">{r}</span><Chip tom={t}>{v}</Chip>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- visão geral

function VisaoGeral({ v, usuarios }: { v: VisaoAdmin; usuarios: UsuarioAdmin[] }) {
  const k = v.kpis
  const receitaUsd = v.receita_mensal_brl * 0.88 / v.dolar
  const margem = receitaUsd ? (receitaUsd - v.custo.projecao_mes) / receitaUsd : null
  const funil = [
    ['Criaram a conta', usuarios.length],
    ['Conectaram o próprio perfil', usuarios.filter((u) => u.proprios > 0).length],
    ['Seguem concorrente ou referência', usuarios.filter((u) => u.concorrentes + u.referencias > 0).length],
    ['Têm relatório de IA', usuarios.filter((u) => u.relatorios > 0).length],
    ['Usaram o Criar', usuarios.filter((u) => u.conteudos > 0).length],
    ['Voltaram (2+ dias ativos)', usuarios.filter((u) => u.dias_ativos_30d >= 2).length],
  ] as const
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Usuários" valor={fmtNum(k.usuarios)} detalhe={`+${k.novos_7d} na semana · +${k.novos_30d} no mês`} />
        <Kpi rotulo="Ativos" valor={`${k.ativos_hoje} / ${k.ativos_7d} / ${k.ativos_30d}`} detalhe="hoje / 7 dias / 30 dias" />
        <Kpi rotulo="Receita mensal (planos)" valor={`R$ ${v.receita_mensal_brl.toLocaleString('pt-BR')}`}
          detalhe={v.planos.map((p) => `${p.n} ${nomePlano(p.plano)}`).join(' · ')} />
        <Kpi rotulo="Custo do mês" valor={brl(v.custo.mes)} detalhe={`projeção ${brl(v.custo.projecao_mes)}${margem !== null ? ` · margem ${(margem * 100).toFixed(0)}%` : ''}`}
          tom={margem !== null && margem < 0.5 ? 'alerta' : undefined} />
      </div>

      <Secao titulo={`Custo por dia · últimos ${v.dias} dias`} acao={<span className="text-xs text-muted">{brl(v.custo.d30)} no período · {brl(v.custo.por_ativo_30d)} por usuário ativo</span>}>
        <BarrasDia dados={v.serie} formatar={(x) => brl(x)}
          series={[{ chave: 'ia', cor: 'var(--accent)', rotulo: 'IA (OpenAI)' }, { chave: 'dados', cor: 'var(--sinal-b)', rotulo: 'API de dados' }]} />
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Uso por dia">
          <BarrasDia dados={v.serie} formatar={(x) => fmtNum(x)} altura={110}
            series={[{ chave: 'ativos', cor: 'var(--menta)', rotulo: 'Usuários ativos' }, { chave: 'novos', cor: 'var(--accent)', rotulo: 'Novos' }]} />
          <div className="mt-4">
            <BarrasDia dados={v.serie} formatar={(x) => fmtNum(x)} altura={70}
              series={[{ chave: 'tarefas_ia', cor: 'var(--accent)', rotulo: 'Pedidos de IA' }, { chave: 'erros', cor: 'var(--sinal-b)', rotulo: 'Erros' }]} />
          </div>
        </Secao>
        <Secao titulo="Funil de ativação">
          <div className="space-y-3">
            {funil.map(([r, n]) => (
              <div key={r}>
                <div className="mb-1 flex justify-between text-sm"><span>{r}</span><span className="num text-muted">{n} · {usuarios.length ? Math.round((n / usuarios.length) * 100) : 0}%</span></div>
                <Barra valor={n} max={usuarios.length} cor="var(--menta)" />
              </div>
            ))}
          </div>
        </Secao>
      </div>

      <Secao titulo="Produto">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['Perfis seguidos', k.seguidos, `${k.concorrentes} concorrentes · ${k.referencias} referências`],
            ['Com contexto para a IA', k.com_contexto, k.seguidos ? `${Math.round((k.com_contexto / k.seguidos) * 100)}% dos seguidos` : ''],
            ['Posts no catálogo', k.posts, `${fmtNum(k.contas_catalogo)} contas`],
            ['Vídeos analisados', k.analises_video, ''],
            ['Relatórios de perfil', k.relatorios, `${k.estrategias} estratégias`],
            ['Conteúdos criados', k.conteudos, `${k.imagens} imagens`],
            ['Insights (7 dias)', k.insights_7d, `${k.insights_uteis} úteis · ${k.insights_descartados} descartados`],
            ['Descobertas aceitas', k.descobertas_aceitas, `de ${k.descobertas} sugeridas`],
          ] as const).map(([r, n, d]) => (
            <div key={r}><p className="text-xs text-muted">{r}</p><p className="num titulo-display text-xl font-semibold">{fmtNum(n)}</p>{d && <p className="text-[11px] text-muted">{d}</p>}</div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Saúde da plataforma"><Saude s={v.saude} /></Secao>
    </div>
  )
}

// ---------------------------------------------------------------- custos

function Custos({ v, usuarios }: { v: VisaoAdmin; usuarios: UsuarioAdmin[] }) {
  const maxOp = Math.max(...v.por_operacao.map((o) => o.usd), 0)
  const ranking = [...usuarios].sort((a, b) => b.custo_30d - a.custo_30d)
  const economiaLote = v.custo.lote_30  // o que foi pago em lote = metade do preço normal
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Hoje" valor={brl(v.custo.hoje)} detalhe={usd(v.custo.hoje)} />
        <Kpi rotulo="7 dias" valor={brl(v.custo.d7)} detalhe={usd(v.custo.d7)} />
        <Kpi rotulo={`${v.dias} dias`} valor={brl(v.custo.d30)} detalhe={`IA ${brl(v.custo.ia_30)} · dados ${brl(v.custo.dados_30)} · imagens ${brl(v.custo.imagens_30)}`} />
        <Kpi rotulo="Economia com lote" valor={brl(economiaLote)} detalhe="o mesmo trabalho pela metade do preço" tom="bom" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Secao titulo="Onde o dinheiro vai (por operação)">
          <div className="space-y-3">
            {v.por_operacao.map((o) => (
              <div key={o.operacao}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate">{nomeOperacao(o.operacao)}</span>
                  <span className="num shrink-0 text-muted">{brl(o.usd)} · {fmtNum(o.chamadas)} chamadas · {o.usuarios} usuário(s)</span>
                </div>
                <Barra valor={o.usd} max={maxOp} />
              </div>
            ))}
            {!v.por_operacao.length && <p className="text-sm text-muted">Sem custos no período.</p>}
          </div>
        </Secao>
        <Secao titulo="Por usuário (30 dias)">
          <div className="space-y-2.5">
            {ranking.map((u) => {
              const preco = PLANOS.find((p) => p.valor === u.plano)?.preco ?? 0
              return (
                <div key={u.id} className="flex items-center gap-3 text-sm">
                  <Avatar email={u.email} />
                  <span className="min-w-0 flex-1"><span className="block truncate">{u.email}</span><span className="text-xs text-muted">{nomePlano(u.plano)}{preco ? ` · R$ ${preco}` : ''}</span></span>
                  <span className="text-right"><span className="num block">{brl(u.custo_30d)}</span>
                    {u.margem_30d !== null && <span className={`text-xs ${u.margem_30d < 0.5 ? 'text-[var(--sinal-b)]' : 'text-[var(--menta)]'}`}>margem {(u.margem_30d * 100).toFixed(0)}%</span>}</span>
                </div>
              )
            })}
          </div>
        </Secao>
      </div>
      <Secao titulo="Por modelo">
        <div data-rolavel="x" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-2 font-normal">Modelo</th><th className="pb-2 text-right font-normal">Chamadas</th><th className="pb-2 text-right font-normal">Entrada</th><th className="pb-2 text-right font-normal">Saída</th><th className="pb-2 text-right font-normal">Créditos</th><th className="pb-2 text-right font-normal">Custo</th></tr></thead>
            <tbody>
              {v.por_modelo.map((m) => (
                <tr key={m.modelo} className="border-t linha-fina">
                  <td className="py-2">{m.modelo.replace(':lote', '')} {m.modelo.endsWith(':lote') && <Chip tom="bom">lote −50%</Chip>}</td>
                  <td className="num py-2 text-right">{fmtNum(m.chamadas)}</td><td className="num py-2 text-right">{fmtNum(m.entrada)}</td>
                  <td className="num py-2 text-right">{fmtNum(m.saida)}</td><td className="num py-2 text-right">{m.creditos ? fmtNum(m.creditos) : '—'}</td>
                  <td className="num py-2 text-right">{brl(m.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- usuários

function Usuarios({ usuarios, abrir }: { usuarios: UsuarioAdmin[]; abrir: (u: UsuarioAdmin) => void }) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'recentes' | 'custo' | 'atividade' | 'visita'>('recentes')
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const f = usuarios.filter((u) => !b || `${u.email} ${u.nome}`.toLowerCase().includes(b))
    const por = { recentes: (u: UsuarioAdmin) => -new Date(u.criado_em).getTime(), custo: (u: UsuarioAdmin) => -u.custo_mes,
      atividade: (u: UsuarioAdmin) => -u.dias_ativos_30d, visita: (u: UsuarioAdmin) => -(u.ultima_visita ?? 0) }[ordem]
    return [...f].sort((a, b) => por(a) - por(b))
  }, [usuarios, busca, ordem])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="cartao flex min-w-0 flex-1 items-center gap-2 px-3">
          <Magnifier className="size-4 text-muted" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por e-mail ou nome" aria-label="Buscar usuário"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        </div>
        <Selecao valor={ordem} aoMudar={setOrdem} rotuloAcessivel="Ordenar" variante="pilula" tamanho="sm" opcoes={[
          { valor: 'recentes', rotulo: 'Mais recentes' }, { valor: 'visita', rotulo: 'Última visita' },
          { valor: 'atividade', rotulo: 'Mais ativos' }, { valor: 'custo', rotulo: 'Maior custo' },
        ]} />
      </div>
      <div className="cartao overflow-hidden">
        <div data-rolavel="x" className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b linha-fina">
                {['Usuário', 'Plano', 'Última visita', 'Dias ativos (30d)', 'Perfis', 'Gerou', 'Custo do mês', 'Situação'].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} onClick={() => { tocar('clique'); abrir(u) }} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && abrir(u)}
                  className="cursor-pointer border-b transition-colors linha-fina last:border-0 hover:bg-surface-secondary/50 focus-visible:bg-surface-secondary/50 focus-visible:outline-none">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3"><Avatar email={u.email} />
                      <span className="min-w-0"><span className="block max-w-[240px] truncate font-medium">{u.email}</span>
                        <span className="text-xs text-muted">desde {new Date(u.criado_em).toLocaleDateString('pt-BR')}{u.admin ? ' · admin' : ''}</span></span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Chip tom={u.plano === 'gratis' ? 'neutro' : 'accent'}>{nomePlano(u.plano)}</Chip></td>
                  <td className="px-4 py-3 text-muted">{quando(u.ultima_visita)}</td>
                  <td className="num px-4 py-3">{u.dias_ativos_30d} <span className="text-xs text-muted">· {u.sessoes_30d} sessões</span></td>
                  <td className="px-4 py-3 text-xs text-muted">{u.proprios ? 'perfil ✓' : 'sem perfil'} · {u.concorrentes} conc. · {u.referencias} ref.</td>
                  <td className="px-4 py-3 text-xs text-muted">{u.relatorios} relat. · {u.conteudos} cont. · {u.imagens} img.</td>
                  <td className="num px-4 py-3">{brl(u.custo_mes)}{u.controles.limite_usd_mes ? <span className="block text-xs text-muted">teto {usd(u.controles.limite_usd_mes)}</span> : null}</td>
                  <td className="px-4 py-3">
                    {u.controles.bloqueado ? <Chip tom="alerta">suspenso</Chip> : u.erros_7d ? <Chip tom="aviso">{u.erros_7d} erro(s)</Chip>
                      : !u.onboarding && !u.proprios ? <Chip>não ativou</Chip> : <Chip tom="bom">ok</Chip>}
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">Nenhum usuário encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DetalheUsuario({ u, aoFechar, aoMudar }: { u: UsuarioAdmin | null; aoFechar: () => void; aoMudar: () => void }) {
  const [d, setD] = useState<DetalheUsuarioAdmin | null>(null)
  const [ctl, setCtl] = useState<ControlesAdmin>({})
  const [salvando, setSalvando] = useState(false)
  const carregar = useCallback(() => {
    if (!u) return
    admin.usuario(u.id).then((x) => { setD(x); setCtl({ plano: x.controles.plano ?? 'gratis', limite_usd_mes: x.controles.limite_usd_mes ?? null, bloqueado: !!x.controles.bloqueado, nota: x.controles.nota ?? '' }) })
      .catch((e) => toast.danger('Não deu para abrir', { description: (e as Error).message }))
  }, [u])
  useEffect(() => { setD(null); carregar() }, [carregar])

  const salvar = async (mudanca: ControlesAdmin) => {
    if (!u) return
    setSalvando(true)
    try {
      await admin.atualizar(u.id, mudanca)
      tocar('sucesso'); toast.success('Salvo'); aoMudar(); carregar()
    } catch (e) { toast.danger('Não deu para salvar', { description: (e as Error).message }) } finally { setSalvando(false) }
  }
  const rodar = async () => {
    if (!u) return
    try { await admin.rodarRotina(u.id); tocar('analise'); toast.success('Rotina na fila', { description: 'Roda agora, direto (sem lote).' }) }
    catch (e) { toast.danger('Não deu para rodar', { description: (e as Error).message }) }
  }
  const totalOp = d?.por_operacao.reduce((s, o) => s + o.usd, 0) ?? 0
  const maxOp = Math.max(...(d?.por_operacao.map((o) => o.usd) ?? [0]), 0)

  return (
    <Drawer.Backdrop isOpen={!!u} onOpenChange={(v) => !v && aoFechar()}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-full w-screen max-w-full flex-col sm:w-[720px]">
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <div className="flex items-center gap-3 pr-8">
              <Avatar email={u?.email ?? null} />
              <div className="min-w-0">
                <Drawer.Heading className="titulo-display truncate text-lg font-semibold">{u?.email}</Drawer.Heading>
                <p className="text-xs text-muted">{u?.nome || 'sem nome'} · desde {u && new Date(u.criado_em).toLocaleDateString('pt-BR')} · última visita {quando(u?.ultima_visita)}</p>
              </div>
            </div>
          </Drawer.Header>
          <Drawer.Body data-rolavel="y" className="space-y-5 overflow-y-auto pb-10">
            {!d ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="carregando h-24 rounded-2xl" />)}</div> : (
              <>
                <section className="rounded-3xl bg-surface-secondary/50 p-4">
                  <p className="mb-3 text-sm font-medium">Controles</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Selecao rotulo="Plano" valor={(ctl.plano ?? 'gratis') as PlanoId} aoMudar={(p) => { setCtl((c) => ({ ...c, plano: p })); salvar({ plano: p }) }}
                      opcoes={PLANOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo, descricao: p.preco ? `R$ ${p.preco}/mês` : 'sem cobrança' }))} />
                    <TextField value={ctl.limite_usd_mes == null ? '' : String(ctl.limite_usd_mes)}
                      onChange={(t) => setCtl((c) => ({ ...c, limite_usd_mes: t.trim() === '' ? null : Number(t.replace(',', '.')) || 0 }))}>
                      <Label>Teto de gasto com IA (US$/mês)</Label>
                      <Input inputMode="decimal" placeholder="sem teto" onBlur={() => salvar({ limite_usd_mes: ctl.limite_usd_mes ?? null })} />
                    </TextField>
                  </div>
                  <TextField className="mt-3" value={ctl.nota ?? ''} onChange={(t) => setCtl((c) => ({ ...c, nota: t }))}>
                    <Label>Anotação interna (só admins veem)</Label>
                    <TextArea className="min-h-16" placeholder="Ex.: cliente da assessoria, liberar Pro até dezembro" onBlur={() => salvar({ nota: ctl.nota ?? '' })} />
                  </TextField>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant={ctl.bloqueado ? 'primary' : 'ghost'} isPending={salvando}
                      className={ctl.bloqueado ? '' : 'text-[var(--sinal-b)]'} onPress={() => { const b = !ctl.bloqueado; setCtl((c) => ({ ...c, bloqueado: b })); salvar({ bloqueado: b }) }}>
                      {ctl.bloqueado ? <><Play /> Reativar conta</> : <><Pause /> Suspender conta</>}
                    </Button>
                    <Button size="sm" variant="ghost" onPress={rodar}><ArrowRotateRight /> Rodar a rotina agora</Button>
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi rotulo="Custo (30 dias)" valor={brl(totalOp)} detalhe={usd(totalOp)} />
                  <Kpi rotulo="Dias ativos" valor={d.atividade.length} detalhe={`${d.atividade.reduce((s, a) => s + a.sessoes, 0)} sessões`} />
                  <Kpi rotulo="Insights" valor={d.insights.total} detalhe={`${d.insights.vistos} vistos · ${d.insights.uteis} úteis`} />
                  <Kpi rotulo="Rotina" valor={quando(d.rotina.ultima)} detalhe={d.rotina.falhas?.length ? `${d.rotina.falhas.length} falha(s)` : 'sem falhas'}
                    tom={d.rotina.falhas?.length ? 'alerta' : undefined} />
                </div>

                {d.custos_dia.length > 0 && (
                  <div><p className="mb-2 text-sm font-medium">Custo por dia</p>
                    <BarrasDia dados={d.custos_dia} altura={90} formatar={(x) => brl(x)}
                      series={[{ chave: 'ia', cor: 'var(--accent)', rotulo: 'IA' }, { chave: 'dados', cor: 'var(--sinal-b)', rotulo: 'Dados' }]} /></div>
                )}

                <div><p className="mb-2 text-sm font-medium">Custo por operação (30 dias)</p>
                  <div className="space-y-2.5">
                    {d.por_operacao.map((o, i) => (
                      <div key={i}>
                        <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{nomeOperacao(o.operacao)} <span className="text-muted">· {o.modelo}</span></span>
                          <span className="num shrink-0 text-muted">{o.chamadas}× · {brl(o.usd, 3)}</span></div>
                        <Barra valor={o.usd} max={maxOp} />
                      </div>
                    ))}
                    {!d.por_operacao.length && <p className="text-sm text-muted">Sem gasto no período.</p>}
                  </div>
                </div>

                <div><p className="mb-2 text-sm font-medium">Perfis ({d.contas.length})</p>
                  <div className="space-y-2">
                    {d.contas.map((c) => (
                      <div key={`${c.plataforma}/${c.conta}`} className="rounded-2xl bg-surface-secondary/50 px-3 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">@{c.conta} <span className="text-xs text-muted">· {c.plataforma} · {fmtNum(c.posts)} posts</span></span>
                          <Chip tom={c.papel === 'proprio' ? 'bom' : c.papel === 'referencia' ? 'accent' : 'aviso'}>{c.papel === 'proprio' ? 'próprio' : c.papel === 'referencia' ? 'referência' : 'concorrente'}</Chip>
                        </div>
                        {(c.nota || c.aspectos?.length > 0) && <p className="mt-1 text-xs text-muted">{c.aspectos?.join(', ')}{c.nota ? ` · “${c.nota}”` : ''}</p>}
                        <p className="mt-0.5 text-[11px] text-muted">{c.ultima_analise ? `analisado ${fmtRelativo(c.ultima_analise)}` : 'sem análise ainda'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div><p className="mb-2 text-sm font-medium">Tarefas de IA recentes</p>
                  <div className="space-y-1.5">
                    {d.tarefas.slice(0, 15).map((t) => (
                      <div key={t.id} className="flex items-start gap-2 text-sm">
                        <Chip tom={t.status === 'erro' ? 'alerta' : t.status === 'concluído' ? 'bom' : 'aviso'}>{t.status}</Chip>
                        <span className="min-w-0 flex-1"><span>{nomeOperacao(t.tipo)}{t.conta ? ` · @${t.conta}` : ''}</span>
                          {t.erro && <span className="block text-xs break-words text-[var(--sinal-b)]">{t.erro.slice(0, 200)}</span>}</span>
                        <span className="shrink-0 text-xs text-muted">{fmtRelativo(t.criada)}</span>
                      </div>
                    ))}
                    {!d.tarefas.length && <p className="text-sm text-muted">Nenhuma ainda.</p>}
                  </div>
                </div>

                <div><p className="mb-2 text-sm font-medium">Linha do tempo</p><LinhaTempo eventos={d.linha_tempo} /></div>
              </>
            )}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

// ---------------------------------------------------------------- operação

function Operacao() {
  const [o, setO] = useState<OperacaoAdmin | null>(null)
  const carregar = useCallback(() => admin.operacao().then(setO).catch(() => {}), [])
  useEffect(() => { carregar(); const t = setInterval(() => !document.hidden && carregar(), 15000); return () => clearInterval(t) }, [carregar])
  const coletar = async () => {
    const r = await admin.coletarLote()
    toast.success(r.aplicados ? `${r.aplicados} resultado(s) aplicados` : 'Nenhum lote pronto ainda'); carregar()
  }
  if (!o) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="carregando h-32 rounded-3xl" />)}</div>
  return (
    <div className="space-y-4">
      <Secao titulo="Saúde" acao={<Button size="sm" variant="ghost" onPress={carregar}><ArrowRotateRight /> Atualizar</Button>}><Saude s={o.saude} /></Secao>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Fila de IA (todos os usuários)">
          <div data-rolavel="y" className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {o.tarefas.map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-sm">
                <Chip tom={t.status === 'erro' ? 'alerta' : t.status === 'concluído' ? 'bom' : 'aviso'}>{t.status}</Chip>
                <span className="min-w-0 flex-1"><span className="block truncate">{nomeOperacao(t.tipo)}{t.conta ? ` · @${t.conta}` : ''} <span className="text-xs text-muted">· {t.email?.split('@')[0]}</span></span>
                  {t.status !== 'concluído' && t.status !== 'erro' && t.etapa && <span className="block text-xs text-muted">{t.etapa}</span>}
                  {t.erro && <span className="block text-xs break-words text-[var(--sinal-b)]">{t.erro.slice(0, 180)}</span>}</span>
                <span className="shrink-0 text-xs text-muted">{fmtRelativo(t.criada)}</span>
              </div>
            ))}
          </div>
        </Secao>
        <Secao titulo="Erros recentes" acao={o.erros.length ? <Chip tom="alerta"><CircleExclamation className="mr-1 size-3" />{o.erros.length}</Chip> : undefined}>
          <div data-rolavel="y" className="max-h-[420px] overflow-y-auto pr-1"><LinhaTempo eventos={o.erros} comEmail /></div>
        </Secao>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Rotina diária por usuário">
          <div className="space-y-2.5">
            {o.rotinas.map((r) => (
              <div key={r.email} className="text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{r.email}</span><span className="shrink-0 text-xs text-muted">{quando(r.ultima)}</span></div>
                <p className="text-xs text-muted">{r.resultado ? Object.entries(r.resultado).map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : v}`).join(' · ') : 'ainda não rodou'}</p>
                {r.falhas?.map((f, i) => <p key={i} className="text-xs break-words text-[var(--sinal-b)]">{f.slice(0, 160)}</p>)}
              </div>
            ))}
          </div>
        </Secao>
        <Secao titulo="Lotes (Batch API, −50%)" acao={<Button size="sm" variant="ghost" onPress={coletar}>Aplicar prontos</Button>}>
          <div className="space-y-2">
            {o.lotes.map((l, i) => (
              <div key={l.lote_id ?? i} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-mono text-xs">{l.lote_id ?? 'aguardando envio'}</span>
                  <span className="text-xs text-muted">{fmtRelativo(l.criado)} · {l.pedidos} pedido(s){l.feito ? ` · pronto ${fmtRelativo(l.feito)}` : ''}</span></span>
                <Chip tom={l.erros ? 'alerta' : l.feitos === l.pedidos ? 'bom' : 'aviso'}>{l.erros ? `${l.erros} erro` : l.feitos === l.pedidos ? 'aplicado' : l.estados}</Chip>
              </div>
            ))}
            {!o.lotes.length && <p className="text-sm text-muted">Nenhum lote nos últimos 7 dias.</p>}
          </div>
        </Secao>
      </div>
      <Secao titulo="Tudo o que aconteceu (ao vivo)">
        <div data-rolavel="y" className="max-h-[520px] overflow-y-auto pr-1"><LinhaTempo eventos={o.eventos} comEmail /></div>
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- tela

export function TelaAdmin() {
  const [sub, setSub] = useState<Sub>('visao')
  const [v, setV] = useState<VisaoAdmin | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [aberto, setAberto] = useState<UsuarioAdmin | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(() => {
    Promise.all([admin.visao(30), admin.usuarios()])
      .then(([a, b]) => { DOLAR = a.dolar; setV(a); setUsuarios(b); setErro(null) })
      .catch((e) => setErro((e as Error).message))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const abas: { id: Sub; nome: string }[] = [{ id: 'visao', nome: 'Visão geral' }, { id: 'usuarios', nome: `Usuários${usuarios.length ? ` · ${usuarios.length}` : ''}` },
    { id: 'custos', nome: 'Custos' }, { id: 'operacao', nome: 'Operação' }]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-[var(--ambar)] uppercase">Super-admin</p>
          <h1 className="titulo-display text-3xl font-semibold">Plataforma</h1>
          <p className="mt-1 text-sm text-muted">{v ? `Atualizado ${quando(v.gerado)} · valores em R$ com dólar a ${v.dolar.toFixed(2).replace('.', ',')}` : 'Carregando…'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface-secondary p-1 text-sm">
            {abas.map((a) => (
              <button key={a.id} onClick={() => { tocar('clique'); setSub(a.id) }}
                className={`rounded-full px-3.5 py-1.5 transition-colors ${sub === a.id ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-foreground'}`}>{a.nome}</button>
            ))}
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Atualizar" onPress={carregar}><ArrowRotateRight /></Button>
        </div>
      </div>

      {erro && <div className="cartao p-6 text-sm text-[var(--sinal-b)]">{erro}</div>}
      {!v && !erro && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="carregando h-24 rounded-3xl" />)}</div>}
      {v && (
        <div key={sub} className="entrar-cima">
          {sub === 'visao' && <VisaoGeral v={v} usuarios={usuarios} />}
          {sub === 'usuarios' && <Usuarios usuarios={usuarios} abrir={setAberto} />}
          {sub === 'custos' && <Custos v={v} usuarios={usuarios} />}
          {sub === 'operacao' && <Operacao />}
        </div>
      )}
      <DetalheUsuario u={aberto} aoFechar={() => setAberto(null)} aoMudar={carregar} />
    </div>
  )
}
