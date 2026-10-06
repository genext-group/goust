import { Button, toast } from '@heroui/react'
import { ArrowDownToLine, ArrowLeft, Check, Magnifier, Plus } from '@gravity-ui/icons'
import { useEffect, useRef, useState } from 'react'
import { interpretarEntrada, perfis, type Conta, type PerfilEncontrado, type Plataforma } from '../api'
import { aura } from '../aura'
import { fmtNum } from '../formato'
import { tocar } from '../sons'
import { ContextoPerfil, type ContextoEscolhido } from './ContextoPerfil'
import { IconePlataforma } from './Plataforma'

type Papel = 'concorrente' | 'referencia'

/** Do link do perfil, já tira plataforma e @ (vira um resultado exato, sem precisar buscar). */
function doLink(texto: string): PerfilEncontrado | null {
  const t = texto.trim()
  const tk = t.match(/tiktok\.com\/@([A-Za-z0-9._]+)/)
  if (tk) return { plataforma: 'tiktok', conta: tk[1].toLowerCase(), nome: null, foto: null, seguidores: null, verificado: false, exato: true }
  const ig = t.match(/instagram\.com\/([A-Za-z0-9._]+)/)
  if (ig && !['p', 'reel', 'reels', 'stories', 'explore'].includes(ig[1])) {
    return { plataforma: 'instagram', conta: ig[1].toLowerCase(), nome: null, foto: null, seguidores: null, verificado: false, exato: true }
  }
  return null
}

function Avatar({ p, tamanho = 40 }: { p: PerfilEncontrado; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      {p.foto && !falhou
        ? <img src={p.foto} alt="" className="size-full rounded-full object-cover" onError={() => setFalhou(true)} />
        : <span className="aura grid size-full place-items-center overflow-hidden rounded-full text-sm font-semibold text-white uppercase" style={aura(p.conta)}>{p.conta.slice(0, 1)}</span>}
      <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-surface ring-2 ring-[var(--surface)] [&_svg]:size-2.5">
        <IconePlataforma plataforma={p.plataforma} />
      </span>
    </span>
  )
}

/** Busca de perfis com prévia (foto, nome, seguidores) para seguir como concorrente ou referência.
 *  Seguir já dispara a coleta e a análise. Links de vídeo continuam indo para `aoVideo`. */
export function BuscaPerfis({ aoAdicionar, aoVideo, papelPadrao = 'concorrente', proprio = false, placeholder, emLinha = false }: {
  aoAdicionar: (contas: Conta[]) => void
  aoVideo?: (url: string) => void
  papelPadrao?: Papel
  /** conectar o seu próprio perfil: sem escolha de papel, coleta o perfil inteiro */
  proprio?: boolean
  placeholder?: string
  /** resultados no fluxo da página (dentro de cartões com overflow, como o assistente), em vez de flutuando */
  emLinha?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<PerfilEncontrado[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [limitada, setLimitada] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [escolhido, setEscolhido] = useState<PerfilEncontrado | null>(null)
  const [salvando, setSalvando] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const pedido = useRef(0)
  const tipo = interpretarEntrada(texto)

  // busca com espera (debounce) e descarte de respostas antigas
  useEffect(() => {
    setEscolhido(null)
    const t = texto.trim()
    if (tipo.tipo === 'video' || t.replace('@', '').length < 2) { setResultados(null); setBuscando(false); return }
    const link = doLink(t)
    const termo = link ? link.conta : t
    const n = ++pedido.current
    setBuscando(true)
    setAberto(true)
    if (link) setResultados([link])
    const timer = setTimeout(async () => {
      try {
        const r = await perfis.buscar(termo, link?.plataforma)
        if (n !== pedido.current) return
        const lista = link ? [{ ...link, ...(r.resultados.find((x) => x.conta === link.conta && x.plataforma === link.plataforma) ?? {}) }, ...r.resultados.filter((x) => x.conta !== link.conta)] : r.resultados
        setResultados(lista)
        setLimitada(r.limitada)
        setAtivo(0)
      } catch {
        if (n === pedido.current) setResultados(link ? [link] : [])
      } finally {
        if (n === pedido.current) setBuscando(false)
      }
    }, link ? 50 : 420)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  useEffect(() => {
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [])

  const escolher = (p: PerfilEncontrado) => {
    if (p.proprio && !proprio) {
      toast.warning('Esse é o seu perfil principal', { description: `@${p.conta} é o perfil da sua conta e não pode ser adicionado como concorrente ou referência.` })
      return
    }
    if (p.acompanha) { toast(`Você já acompanha @${p.conta}`); return }
    tocar('clique')
    setEscolhido(p)
  }
  const acompanhar = async (ctx?: ContextoEscolhido) => {
    if (!escolhido) return
    const papel = ctx?.papel ?? papelPadrao
    setSalvando(true)
    try {
      const r = await perfis.acompanhar({ conta: escolhido.conta, plataforma: escolhido.plataforma, papel: proprio ? 'proprio' : papel,
                                          nome: escolhido.nome, aspectos: ctx?.aspectos, nota: ctx?.nota })
      aoAdicionar(r.contas)
      tocar('coleta')
      toast.success(proprio ? `@${escolhido.conta} conectado` : `@${escolhido.conta} adicionado como ${papel === 'concorrente' ? 'concorrente' : 'referência'}`,
        { description: proprio ? 'Coletando seus posts. A análise da IA começa logo em seguida.' : 'Coletando os 30 posts mais recentes. A análise da IA começa logo em seguida.' })
      if (r.aviso) toast.warning('Coleta limitada', { description: r.aviso })
      setTexto(''); setResultados(null); setEscolhido(null); setAberto(false)
    } catch (e) {
      toast.danger('Não deu para adicionar', { description: (e as Error).message })
    } finally { setSalvando(false) }
  }
  const teclado = (e: React.KeyboardEvent) => {
    if (escolhido) {
      if (e.key === 'Enter' && proprio) { e.preventDefault(); acompanhar() }
      if (e.key === 'Escape') setEscolhido(null)
      return
    }
    if (tipo.tipo === 'video' && e.key === 'Enter') { e.preventDefault(); aoVideo?.(texto.trim()); setTexto(''); return }
    if (!resultados?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo]) }
    if (e.key === 'Escape') setAberto(false)
  }
  const mostrar = aberto && (buscando || resultados !== null) && !(escolhido && !proprio)

  return (
    <div ref={caixa} className="relative text-left">
      <div className={`cartao flex items-center gap-2 p-2 transition-shadow ${mostrar ? 'ring-2 ring-accent/40' : ''}`}>
        <span className="pl-2 text-muted [&_svg]:size-4">{tipo.plataforma ? <IconePlataforma plataforma={tipo.plataforma} /> : <Magnifier />}</span>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclado} onFocus={() => setAberto(true)}
          aria-label="Buscar perfil" role="combobox" aria-expanded={mostrar} autoComplete="off"
          style={{ outline: "none", boxShadow: "none", border: 0 }}
          placeholder={placeholder ?? 'Busque pelo nome ou @, ou cole o link de um perfil ou vídeo'}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted focus-visible:outline-none" />
        {tipo.tipo === 'video' && aoVideo && (
          <Button className="botao-sinal shrink-0" onPress={() => { aoVideo(texto.trim()); setTexto('') }}><ArrowDownToLine /> Baixar vídeo</Button>
        )}
      </div>

      {mostrar && (
        <div className={`entrar-cima mt-2 overflow-hidden rounded-3xl border bg-surface linha-fina ${emLinha ? 'relative' : 'absolute inset-x-0 top-full z-40 shadow-2xl'}`}>
          {escolhido ? (
            <div className="p-5">
              <button onClick={() => setEscolhido(null)} className="mb-3 flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="size-3" /> Voltar aos resultados</button>
              <div className="flex items-center gap-4">
                <Avatar p={escolhido} tamanho={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{escolhido.nome || `@${escolhido.conta}`}{escolhido.verificado && <Check className="ml-1 inline size-4 text-accent" />}</p>
                  <p className="truncate text-sm text-muted">@{escolhido.conta} · {escolhido.plataforma === 'tiktok' ? 'TikTok' : 'Instagram'}{escolhido.seguidores != null ? ` · ${fmtNum(escolhido.seguidores)} seguidores` : ''}</p>
                </div>
              </div>
              <Button className="botao-sinal mt-4 w-full" size="lg" isPending={salvando} onPress={() => acompanhar()}>
                <Plus /> {proprio ? 'Este é o meu perfil: conectar e analisar' : 'Acompanhar e analisar'}
              </Button>
              <p className="mt-2 text-center text-xs text-muted">{proprio ? 'Coletamos seus posts e a IA analisa em seguida.' : 'Coletamos os 30 posts mais recentes e a IA analisa em seguida.'}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs text-muted">
                <span>{buscando ? 'Procurando no Instagram e no TikTok…' : resultados?.length ? 'Perfis encontrados' : ''}</span>
                {limitada && !buscando && <span className="text-[var(--ambar)]">Busca limitada · API de dados sem créditos</span>}
              </div>
              <ul role="listbox" data-rolavel="y" className="max-h-[420px] overflow-y-auto px-2 pb-2">
                {buscando && !resultados?.length && [0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="carregando size-10 rounded-full" />
                    <span className="flex-1 space-y-1.5"><span className="carregando block h-3 w-1/2" /><span className="carregando block h-2.5 w-1/3" /></span>
                  </li>
                ))}
                {resultados?.map((p, i) => (
                  <li key={`${p.plataforma}/${p.conta}`} role="option" aria-selected={i === ativo}>
                    <button onMouseEnter={() => setAtivo(i)} onClick={() => escolher(p)}
                      aria-disabled={!!(p.proprio && !proprio)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${i === ativo ? 'bg-surface-secondary' : ''} ${p.proprio && !proprio ? 'opacity-60' : ''}`}>
                      <Avatar p={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nome || `@${p.conta}`}{p.verificado && <Check className="ml-1 inline size-3.5 text-accent" />}</span>
                        <span className="block truncate text-xs text-muted">
                          @{p.conta} · {p.plataforma === 'tiktok' ? 'TikTok' : 'Instagram'}
                          {p.seguidores != null ? ` · ${fmtNum(p.seguidores)} seguidores` : p.web ? ' · encontrado na web' : ''}
                        </span>
                      </span>
                      {p.proprio && !proprio ? <span className="shrink-0 rounded-full bg-[var(--menta)]/15 px-2 py-0.5 text-[11px] text-[var(--menta)]">Seu perfil</span>
                        : p.acompanha ? <span className="shrink-0 rounded-full bg-surface-tertiary px-2 py-0.5 text-[11px] text-muted">Já acompanha</span>
                        : p.exato ? <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">@ exato</span> : null}
                    </button>
                  </li>
                ))}
                {!buscando && resultados?.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted">Nenhum perfil encontrado. Confira o @ ou cole o link do perfil.</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}
      {escolhido && !proprio && (
        <ContextoPerfil aberto perfil={escolhido} inicial={{ papel: undefined }} salvando={salvando}
          aoConfirmar={(c) => acompanhar(c)} aoFechar={() => setEscolhido(null)} />
      )}
    </div>
  )
}

export type { Plataforma }
