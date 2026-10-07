import { Button, toast } from '@heroui/react'
import { ArrowsRotateRight, Check, ChevronDown, Xmark } from '@gravity-ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { central, marcas as marcasApi, perfis, type Conta, type Parecido, type ResultadoParecidos } from '../api'
import { fmtNum } from '../formato'
import { tocar } from '../sons'
import { ContextoPerfil, type ContextoEscolhido } from './ContextoPerfil'
import { IconePlataforma } from './Plataforma'

const ETAPAS = ['Lendo a base da busca', 'Buscando perfis no Instagram', 'Buscando perfis e vídeos no TikTok', 'Comparando os candidatos', 'Separando concorrentes de referências']

interface Semente { chave: string; nome: string; contas: Conta[] }

/**
 * Descobrir perfis: duas pesquisas independentes, do seu mercado (brief) e parecidos com as marcas escolhidas.
 * Visual neutro: o destaque fica no conteúdo (perfis), não nos controles.
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
  const [aberto, setAberto] = useState(false)
  const [negocio, setNegocio] = useState(true)
  const [sel, setSel] = useState<Set<string> | null>(null)   // null = padrão (todos os concorrentes)
  const escolhidas = sel ?? new Set(sementes.filter((s) => s.contas[0].papel === 'concorrente').map((s) => s.chave))
  const [buscando, setBuscando] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [res, setRes] = useState<ResultadoParecidos | null>(null)
  const [adicionando, setAdicionando] = useState<Parecido | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!buscando) return
    setEtapa(0)
    const t = setInterval(() => setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1)), 8000)
    return () => clearInterval(t)
  }, [buscando])

  const alternar = (k: string) => {
    tocar('clique')
    const x = new Set(escolhidas); if (x.has(k)) x.delete(k); else x.add(k)
    setSel(x)
  }
  const nada = !negocio && !escolhidas.size
  const buscar = async (forcar = false) => {
    if (nada) return
    setBuscando(true); setRes(null); tocar('analise')
    try {
      const chaves = sementes.filter((s) => escolhidas.has(s.chave)).flatMap((s) => s.contas.map((c) => `${c.plataforma}/${c.conta}`))
      const r = await marcasApi.parecidos({ chaves, negocio, forcar })
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
      toast.success(`@${p.conta} adicionado`, { description: 'Coletando os posts recentes. A análise vem em seguida.' })
    } catch (e) { toast.danger('Não deu para adicionar', { description: (e as Error).message }) } finally { setSalvando(false) }
  }

  const grupos = res ? ([['mercado', 'Do seu mercado'], ['marcas', 'Parecidos com as suas marcas']] as const)
    .map(([k, t]) => ({ k, t, itens: res.itens.filter((x) => (x.grupo ?? 'mercado') === k), ideal: res.ideais?.[k] })).filter((g) => g.itens.length) : []

  return (
    <section className="rounded-3xl border linha-fina">
      <button onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-secondary/30">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Descobrir perfis parecidos</span>
          <span className="block text-sm text-muted">Do seu mercado e parecidos com as marcas que você já acompanha, no Instagram e no TikTok.</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform duration-300 ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="entrar-cima border-t px-5 pt-5 pb-5 linha-fina">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-muted">Base da busca</p>
            <div className="flex gap-3 text-xs text-muted">
              <button onClick={() => setSel(new Set(sementes.map((s) => s.chave)))} className="hover:text-foreground">Todas as marcas</button>
              <button onClick={() => setSel(new Set())} className="hover:text-foreground">Nenhuma</button>
            </div>
          </div>
          <div data-rolavel="y" className="mt-2 flex max-h-[124px] flex-wrap gap-1.5 overflow-y-auto">
            <Chip ativo={negocio} onPress={() => { tocar('clique'); setNegocio((n) => !n) }}>Seu negócio</Chip>
            <span className="mx-1 self-center text-border">·</span>
            {sementes.map((s) => {
              const c = s.contas[0]
              return (
                <Chip key={s.chave} ativo={escolhidas.has(s.chave)} onPress={() => alternar(s.chave)}>
                  {c.perfil?.foto ? <img src={c.perfil.foto} alt="" className="size-4 rounded-full object-cover" />
                    : <span className="grid size-4 place-items-center rounded-full bg-surface-secondary text-[9px] uppercase">{c.conta[0]}</span>}
                  {s.nome}
                </Chip>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" className="bg-foreground text-background" isPending={buscando} isDisabled={nada} onPress={() => buscar()}>Buscar perfis</Button>
            <span className="text-xs text-muted">
              {nada ? 'Escolha o seu negócio ou alguma marca como base.'
                : [negocio && 'seu mercado', escolhidas.size && `parecidos com ${escolhidas.size} ${escolhidas.size === 1 ? 'marca' : 'marcas'}`].filter(Boolean).join(' + ')}
            </span>
          </div>

          {buscando && (
            <div className="mt-6 space-y-2">
              {ETAPAS.map((e, i) => (
                <p key={e} className={`flex items-center gap-2.5 text-sm transition-opacity ${i > etapa ? 'opacity-30' : ''}`}>
                  {i < etapa ? <Check className="size-3.5 text-[var(--menta)]" />
                    : i === etapa ? <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-foreground/70 border-t-transparent" />
                      : <span className="size-3.5 rounded-full border border-border" />}
                  {e}
                </p>
              ))}
            </div>
          )}

          {res && !buscando && (
            <div className="mt-6 space-y-7">
              {!grupos.length && <p className="text-sm text-muted">Nada novo dessa vez. Tente outra base, ou volte depois.</p>}
              {grupos.map((g) => (
                <div key={g.k}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h4 className="text-sm font-medium">{g.t}</h4>
                    <span className="num text-xs text-muted">{g.itens.length}</span>
                  </div>
                  {g.ideal && <p className="-mt-1 mb-3 max-w-3xl text-xs leading-relaxed text-muted">{g.ideal}</p>}
                  <div className="grid gap-px overflow-hidden rounded-2xl border bg-[var(--border)] linha-fina sm:grid-cols-2 xl:grid-cols-3">
                    {g.itens.map((p) => <CartaoParecido key={`${p.plataforma}/${p.conta}`} p={p} aoAcompanhar={() => setAdicionando(p)} aoIgnorar={() => ignorar(p)} />)}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{res.pesquisa?.web ? 'Encontrados pela busca na web' : res.pesquisa ? `${res.pesquisa.buscas} buscas · ${fmtNum(res.pesquisa.candidatos)} perfis avaliados` : ''}</span>
                <button onClick={() => buscar(true)} className="flex items-center gap-1.5 hover:text-foreground"><ArrowsRotateRight className="size-3" /> Buscar de novo</button>
              </div>
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

function Chip({ ativo, onPress, children }: { ativo: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onPress} aria-pressed={ativo}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition-colors ${ativo ? 'border-foreground/40 bg-foreground/[0.06] text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}>
      {ativo && <Check className="size-3" />}{children}
    </button>
  )
}

function CartaoParecido({ p, aoAcompanhar, aoIgnorar }: { p: Parecido; aoAcompanhar: () => void; aoIgnorar: () => void }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className="group surgir flex flex-col bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-secondary text-xs font-medium text-muted uppercase">
          {p.conta[0]}
          {p.foto && !falhou && <img src={p.foto} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 size-full object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.nome || `@${p.conta}`}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <IconePlataforma plataforma={p.plataforma} className="size-3 shrink-0" />@{p.conta}{p.seguidores != null ? ` · ${fmtNum(p.seguidores)}` : ''}
          </p>
        </div>
        <button onClick={aoIgnorar} aria-label="Ignorar" title="Não mostrar mais"
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground max-sm:opacity-100"><Xmark className="size-3.5" /></button>
      </div>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-foreground/80">{p.motivo}</p>
      {p.parecido_com.length > 0 && <p className="mt-2 truncate text-xs text-muted">Parecido com {p.parecido_com.slice(0, 3).join(', ')}</p>}
      <div className="mt-3 flex items-center gap-2 text-xs whitespace-nowrap text-muted">
        <span>{p.tipo === 'concorrente' ? 'Concorrente' : 'Referência'}</span>
        <span>·</span>
        <span className="num">{p.semelhanca}%</span>
        <button onClick={aoAcompanhar} className="ml-auto shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-foreground transition-colors linha-fina hover:bg-foreground hover:text-background">
          Acompanhar
        </button>
      </div>
    </div>
  )
}
