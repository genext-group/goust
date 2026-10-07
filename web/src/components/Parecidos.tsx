import { Button, toast } from '@heroui/react'
import { ArrowsRotateRight, Check, Sparkles, Xmark } from '@gravity-ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { central, marcas as marcasApi, perfis, type Conta, type Parecido } from '../api'
import { aura } from '../aura'
import { fmtNum } from '../formato'
import { tocar } from '../sons'
import { AnimProcesso } from './AnimProcessos'
import { ContextoPerfil, type ContextoEscolhido } from './ContextoPerfil'
import { IconePlataforma } from './Plataforma'

const ETAPAS = ['Lendo os perfis escolhidos…', 'Procurando no Instagram e no TikTok…', 'Comparando os candidatos…', 'Separando concorrentes de referências…']

interface Semente { chave: string; nome: string; contas: Conta[] }

/**
 * Encontrar marcas parecidas: com o seu negócio (brief) ou com marcas que você já acompanha.
 * A IA monta buscas por assunto, a API de dados traz perfis reais e a IA ranqueia por semelhança.
 */
export function Parecidos({ contas, setContas, aoAdicionar }: { contas: Conta[]; setContas: (c: Conta[]) => void; aoAdicionar: () => void }) {
  const sementes = useMemo<Semente[]>(() => {
    const m = new Map<string, Semente>()
    contas.filter((c) => c.papel !== 'proprio').forEach((c) => {
      const k = c.marca_id ? `m${c.marca_id}` : `${c.plataforma}/${c.conta}`
      const s = m.get(k) ?? { chave: k, nome: c.marca || c.perfil?.nome || c.nome, contas: [] }
      s.contas.push(c); m.set(k, s)
    })
    return [...m.values()].sort((a, b) => Number(b.contas[0].papel === 'concorrente') - Number(a.contas[0].papel === 'concorrente'))
  }, [contas])
  const [sel, setSel] = useState<Set<string>>(new Set())   // vazio = para o meu negócio
  const [buscando, setBuscando] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [res, setRes] = useState<{ perfil_ideal: string | null; itens: Parecido[] } | null>(null)
  const [adicionando, setAdicionando] = useState<Parecido | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!buscando) return
    setEtapa(0)
    const t = setInterval(() => setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1)), 7000)
    return () => clearInterval(t)
  }, [buscando])

  const alternar = (k: string) => { tocar('clique'); setSel((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x }) }
  const buscar = async (forcar = false) => {
    setBuscando(true); setRes(null); tocar('analise')
    try {
      const chaves = sementes.filter((s) => sel.has(s.chave)).flatMap((s) => s.contas.map((c) => `${c.plataforma}/${c.conta}`))
      const r = await marcasApi.parecidos(chaves.length ? { chaves, forcar } : { papel: 'negocio', forcar })
      setRes(r); tocar(r.itens.length ? 'analiseFim' : 'aviso')
    } catch (e) { toast.danger('Não deu para buscar agora', { description: (e as Error).message }) } finally { setBuscando(false) }
  }
  const tirar = (p: Parecido) => setRes((r) => r && { ...r, itens: r.itens.filter((x) => x !== p) })
  const ignorar = (p: Parecido) => { tirar(p); tocar('clique'); if (p.id) central.descoberta(p.id, 'ignorar').catch(() => {}) }
  const acompanhar = async (c: ContextoEscolhido) => {
    if (!adicionando) return
    setSalvando(true)
    try {
      const p = adicionando
      const r = p.id ? await central.descoberta(p.id, 'adicionar', c.papel, { aspectos: c.aspectos, nota: c.nota })
        : await perfis.acompanhar({ plataforma: p.plataforma, conta: p.conta, papel: c.papel, nome: p.nome, aspectos: c.aspectos, nota: c.nota })
      if (r.contas) setContas(r.contas)
      tirar(p); setAdicionando(null); tocar('coleta'); aoAdicionar()
      toast.success(`@${p.conta} adicionado como ${c.papel === 'concorrente' ? 'concorrente' : 'referência'}`, { description: 'Coletando os posts recentes. A análise da IA vem em seguida.' })
    } catch (e) { toast.danger('Não deu para adicionar', { description: (e as Error).message }) } finally { setSalvando(false) }
  }

  const nomesSel = sementes.filter((s) => sel.has(s.chave)).map((s) => s.nome)

  return (
    <section className="cartao overflow-hidden">
      <button onClick={() => setAberto((a) => !a)} className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={aberto}>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent"><Sparkles className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="titulo-display block text-lg font-semibold">Encontrar marcas parecidas</span>
          <span className="block text-sm text-muted">Concorrentes do seu negócio ou perfis parecidos com os que você já acompanha.</span>
        </span>
        <span className={`text-muted transition-transform ${aberto ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {aberto && (
        <div className="entrar-cima border-t px-5 pt-4 pb-5 linha-fina">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Parecidos com</p>
          <div data-rolavel="y" className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
            <button onClick={() => { tocar('clique'); setSel(new Set()) }} aria-pressed={!sel.size}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all ${!sel.size ? 'bg-accent text-accent-foreground' : 'bg-surface-secondary/70 hover:bg-surface-secondary'}`}>
              {!sel.size && <Check className="size-3.5" />} O meu negócio
            </button>
            {sementes.map((s) => {
              const ativo = sel.has(s.chave)
              const c = s.contas[0]
              return (
                <button key={s.chave} onClick={() => alternar(s.chave)} aria-pressed={ativo}
                  className={`flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm transition-all ${ativo ? 'bg-accent text-accent-foreground' : 'bg-surface-secondary/70 hover:bg-surface-secondary'}`}>
                  {c.perfil?.foto ? <img src={c.perfil.foto} alt="" className="size-6 rounded-full object-cover" />
                    : <span className="aura grid size-6 place-items-center rounded-full text-[10px] font-semibold text-white uppercase" style={aura(c.conta)}>{c.conta[0]}</span>}
                  {s.nome}
                  <span className={`text-[10px] ${ativo ? 'opacity-80' : 'text-muted'}`}>{c.papel === 'referencia' ? 'ref.' : 'conc.'}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button className="botao-sinal" isPending={buscando} onPress={() => buscar()}>
              <Sparkles /> {sel.size ? `Buscar parecidos com ${nomesSel.length === 1 ? nomesSel[0] : `${nomesSel.length} marcas`}` : 'Buscar concorrentes do meu negócio'}
            </Button>
            <span className="text-xs text-muted">Busca perfis reais no Instagram e no TikTok e a IA escolhe os mais parecidos.</span>
          </div>

          {buscando && (
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-surface-secondary/50 p-4">
              <AnimProcesso tipo="analise" tamanho={40} />
              <div>
                <p key={etapa} className="entrar-cima text-sm font-medium">{ETAPAS[etapa]}</p>
                <p className="text-xs text-muted">Leva uns 30 segundos.</p>
              </div>
            </div>
          )}

          {res && !buscando && (
            <div className="mt-5">
              {res.perfil_ideal && <p className="mb-3 text-sm text-muted"><span className="text-foreground">O que procuramos:</span> {res.perfil_ideal}</p>}
              {!res.itens.length ? (
                <p className="rounded-2xl bg-surface-secondary/50 p-4 text-sm text-muted">Nada novo dessa vez. Tente outras marcas como base, ou volte depois.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {res.itens.map((p) => <CartaoParecido key={`${p.plataforma}/${p.conta}`} p={p} aoAcompanhar={() => setAdicionando(p)} aoIgnorar={() => ignorar(p)} />)}
                </div>
              )}
              <button onClick={() => buscar(true)} className="mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-foreground"><ArrowsRotateRight className="size-3" /> Buscar de novo</button>
            </div>
          )}
        </div>
      )}

      {adicionando && (
        <ContextoPerfil aberto salvando={salvando}
          perfil={{ plataforma: adicionando.plataforma, conta: adicionando.conta, nome: adicionando.nome, foto: adicionando.foto }}
          inicial={{ papel: adicionando.tipo, nota: adicionando.motivo }}
          aoConfirmar={acompanhar} aoFechar={() => setAdicionando(null)} />
      )}
    </section>
  )
}

function CartaoParecido({ p, aoAcompanhar, aoIgnorar }: { p: Parecido; aoAcompanhar: () => void; aoIgnorar: () => void }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className="surgir flex flex-col rounded-2xl bg-surface-secondary/50 p-4">
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          {p.foto && !falhou ? <img src={p.foto} alt="" onError={() => setFalhou(true)} className="size-11 rounded-full object-cover" />
            : <span className="aura grid size-11 place-items-center rounded-full text-sm font-semibold text-white uppercase" style={aura(p.conta)}>{p.conta[0]}</span>}
          <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-surface ring-2 ring-[var(--surface)] [&_svg]:size-2.5"><IconePlataforma plataforma={p.plataforma} /></span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.nome || `@${p.conta}`}</p>
          <p className="truncate text-xs text-muted">@{p.conta}{p.seguidores != null ? ` · ${fmtNum(p.seguidores)} seguidores` : ''}</p>
        </div>
        <button onClick={aoIgnorar} aria-label="Ignorar" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"><Xmark className="size-3.5" /></button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.tipo === 'concorrente' ? 'bg-[var(--sinal-b)]/15 text-[var(--sinal-b)]' : 'bg-accent/15 text-accent'}`}>
          {p.tipo === 'concorrente' ? 'Concorrente direto' : 'Referência'}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-tertiary"><span className="block h-full rounded-full bg-[var(--menta)]" style={{ width: `${p.semelhanca}%` }} /></span>
        <span className="num text-[11px] text-muted">{p.semelhanca}%</span>
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed">{p.motivo}</p>
      {p.parecido_com.length > 0 && <p className="mt-1.5 text-[11px] text-muted">Parecido com {p.parecido_com.join(', ')}</p>}
      <Button size="sm" className="botao-sinal mt-3" onPress={aoAcompanhar}>Acompanhar</Button>
    </div>
  )
}
