import { Button, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, ArrowsRotateRight, Check, TrashBin, Xmark } from '@gravity-ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { COLETA_INICIAL, api, central, ia, marcas, type Conta, type Parecido, type Plataforma } from '../../api'
import { aura } from '../../aura'
import { fmtNum } from '../../formato'
import { tocar } from '../../sons'
import { Explosao } from '../../components/AnimProcessos'
import { BuscaPerfis } from '../../components/BuscaPerfis'
import { useAtividade } from '../../components/Atividade'
import { Mascote } from '../../components/Goust'
import { IconePlataforma } from '../../components/Plataforma'
import { useConfirmar } from '../../components/ui/Confirmar'

type Tipo = 'concorrente' | 'referencia'

/** Cada grupo tem a sua cor em toda a primeira configuração: dá para bater o olho e saber o que é o quê. */
export const GRUPO: Record<Tipo, { nome: string; cor: string; curto: string }> = {
  concorrente: { nome: 'Concorrente direto', curto: 'Concorrente', cor: 'var(--concorrente)' },
  referencia: { nome: 'Referência', curto: 'Referência', cor: 'var(--referencia)' },
}

function Etiqueta({ tipo, onPress, grande }: { tipo: Tipo; onPress?: () => void; grande?: boolean }) {
  const g = GRUPO[tipo]
  const conteudo = (
    <>
      <span className="size-1.5 rounded-full" style={{ background: g.cor }} />
      {g.nome}
      {onPress && <ArrowsRotateRight className="size-2.5 opacity-70" />}
    </>
  )
  const classe = `inline-flex items-center gap-1.5 rounded-full font-medium ${grande ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'}`
  const estilo = { color: g.cor, background: `color-mix(in oklab, ${g.cor} 14%, transparent)` }
  return onPress
    ? <button type="button" onClick={(e) => { e.stopPropagation(); onPress() }} title="Trocar de grupo" className={`${classe} transition-transform active:scale-95`} style={estilo}>{conteudo}</button>
    : <span className={classe} style={estilo}>{conteudo}</span>
}

function Avatar({ conta, foto, tamanho = 40, tipo }: { conta: string; foto?: string | null; tamanho?: number; tipo?: Tipo }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="aura relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white uppercase"
      style={{ ...aura(conta), width: tamanho, height: tamanho, fontSize: tamanho * 0.38, boxShadow: tipo ? `0 0 0 2px var(--background), 0 0 0 4px ${GRUPO[tipo].cor}` : undefined }}>
      {conta.slice(0, 1)}
      {foto && !falhou && <img src={foto} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 size-full object-cover" />}
    </span>
  )
}

function Rodape({ aoVoltar, children }: { aoVoltar: () => void; children: ReactNode }) {
  return (
    <div className="mt-10 flex items-center justify-between gap-3">
      <Button variant="ghost" onPress={aoVoltar}><ArrowLeft /> Voltar</Button>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

const chave = (x: { plataforma: Plataforma; conta: string }) => `${x.plataforma}/${x.conta}`

// ================================================================= passo 3: quem você já conhece

export function PassoConhecidos({ contas, setContas, aoSeguir, aoVoltar }: {
  contas: Conta[]; setContas: (c: Conta[]) => void; aoSeguir: () => void; aoVoltar: () => void
}) {
  const [tipo, setTipo] = useState<Tipo>('concorrente')
  const { downloads } = useAtividade()
  const [local, setLocal] = useState<string | null>(null)
  const { confirmacao, confirmar } = useConfirmar()
  const conhecidos = contas.filter((c) => c.papel === 'concorrente' || c.papel === 'referencia')

  useEffect(() => {
    ia.marca().then((m) => setLocal(/local|cidade|regi/i.test(m.alcance || '') ? (m.cidade || 'sua cidade') : null)).catch(() => {})
  }, [])

  const trocar = async (c: Conta) => {
    tocar('clique')
    setContas(await api.papelConta(c, c.papel === 'concorrente' ? 'referencia' : 'concorrente'))
  }
  const remover = async (c: Conta) => {
    if (!await confirmar({ titulo: `Tirar @${c.conta} da lista?`, confirmar: 'Tirar' })) return
    setContas(await api.removerConta(c))
  }
  const seguir = () => {
    // a coleta dos que você informou começa já: a análise deles chega antes
    const comColeta = new Set(downloads.map((d) => chave(d)))
    const novos = conhecidos.filter((c) => !c.videos && !comColeta.has(chave(c)))
    if (novos.length) api.baixar(novos, { modo: 'recentes', quantidade: COLETA_INICIAL, somente_reels: false, analisar_ao_fim: true }).catch(() => {})
    aoSeguir()
  }

  const explicacao: Record<Tipo, string> = {
    concorrente: local ? `Vende o mesmo tipo de produto para o mesmo cliente, em ${local}.` : 'Vende o mesmo tipo de produto para o mesmo cliente que você, em qualquer lugar.',
    referencia: local ? 'Não disputa seu cliente (outra cidade ou outro produto), mas o conteúdo inspira.' : 'Não disputa seu cliente, mas fala com o mesmo público ou faz conteúdo que inspira.',
  }

  return (
    <div>
      <p className="num text-sm text-muted">Passo 3 de 4</p>
      <h2 className="titulo-display mt-1 text-4xl font-semibold">Quem você já conhece?</h2>
      <p className="mt-2 max-w-xl text-muted">
        Comece pelos perfis que você já sabe que importam. Eles viram o gabarito da IA: no próximo passo ela cruza tudo
        com o seu perfil e acha outros com muito mais precisão.
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {(['concorrente', 'referencia'] as Tipo[]).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
            className="rounded-2xl p-3.5 text-left transition-all"
            style={{ background: `color-mix(in oklab, ${GRUPO[t].cor} ${tipo === t ? 14 : 6}%, transparent)`, boxShadow: tipo === t ? `inset 0 0 0 1px ${GRUPO[t].cor}` : undefined }}>
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: GRUPO[t].cor }}>
              <span className="grid size-4 place-items-center rounded-full border" style={{ borderColor: GRUPO[t].cor, background: tipo === t ? GRUPO[t].cor : undefined }}>
                {tipo === t && <Check className="size-2.5 text-black" />}
              </span>
              {GRUPO[t].nome}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-muted">{explicacao[t]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <BuscaPerfis key={tipo} papelPadrao={tipo} direto={{ rotulo: `+ ${GRUPO[tipo].curto}`, cor: GRUPO[tipo].cor }}
          aoAdicionar={(lista) => { setContas(lista); tocar(tipo === 'concorrente' ? 'favorito' : 'pasta') }}
          placeholder={`Busque o ${GRUPO[tipo].curto.toLowerCase()} pelo nome ou @, ou cole o link`} />
      </div>

      <div className="mt-5 grid gap-2">
        {conhecidos.length === 0 ? (
          <div className="flex items-center gap-4 rounded-2xl border border-dashed px-5 py-6 linha-fina">
            <span className="text-muted"><Mascote tamanho={40} variante="mono" animado estrela={false} /></span>
            <p className="text-sm text-muted">Nenhum perfil ainda. Se não souber nenhum, tudo bem: pule e a IA procura sozinha a partir do seu perfil e do que você contou.</p>
          </div>
        ) : conhecidos.map((c) => (
          <div key={chave(c)} className="surgir flex items-center gap-3 rounded-2xl bg-surface p-3">
            <Avatar conta={c.conta} foto={c.perfil?.foto} tipo={c.papel as Tipo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.perfil?.nome || c.nome || `@${c.conta}`}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted">
                <IconePlataforma plataforma={c.plataforma} className="size-3 shrink-0" />@{c.conta}{c.perfil?.seguidores != null ? ` · ${fmtNum(c.perfil.seguidores)}` : ''}
              </p>
            </div>
            <Etiqueta tipo={c.papel as Tipo} onPress={() => trocar(c)} />
            <button onClick={() => remover(c)} aria-label="Tirar da lista" className="grid size-7 place-items-center rounded-full text-muted hover:text-danger">
              <TrashBin className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Rodape aoVoltar={aoVoltar}>
        <Button className="botao-sinal" onPress={seguir}>
          {conhecidos.length ? 'Descobrir mais com a IA' : 'Pular: a IA procura sozinha'} <ArrowRight />
        </Button>
      </Rodape>
      {confirmacao}
    </div>
  )
}

// ================================================================= passo 4: descobrir (um por um)

const ETAPAS = [
  'Lendo o seu perfil e o seu brief',
  'Entendendo a sua categoria de produto',
  'Pesquisando marcas da mesma categoria na web',
  'Confirmando cada @ no Instagram e no TikTok',
  'Buscando criadores que falam com o seu público',
  'Separando concorrentes diretos de referências',
]

function Procurando({ base }: { base: { concorrentes: number; referencias: number } }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, ETAPAS.length - 1)), 18000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="mt-8 flex flex-col items-center text-center">
      <div className="relative grid size-44 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full opacity-20 [animation-duration:2.4s]" style={{ background: 'var(--concorrente)' }} />
        <span className="absolute inset-6 animate-ping rounded-full opacity-20 [animation-delay:1.2s] [animation-duration:2.4s]" style={{ background: 'var(--referencia)' }} />
        <Mascote tamanho={96} animado voar />
      </div>
      <p className="mt-6 text-lg font-medium">Cruzando o seu perfil com o mercado</p>
      {(base.concorrentes > 0 || base.referencias > 0) && (
        <p className="mt-1 text-sm text-muted">
          Usando como gabarito {base.concorrentes > 0 && <b style={{ color: 'var(--concorrente)' }}>{base.concorrentes} concorrente{base.concorrentes > 1 ? 's' : ''}</b>}
          {base.concorrentes > 0 && base.referencias > 0 && ' e '}
          {base.referencias > 0 && <b style={{ color: 'var(--referencia)' }}>{base.referencias} referência{base.referencias > 1 ? 's' : ''}</b>}
        </p>
      )}
      <ol className="mt-6 grid w-full max-w-sm gap-2 text-left text-sm">
        {ETAPAS.map((e, n) => (
          <li key={e} className={`flex items-center gap-2.5 transition-opacity duration-500 ${n > i ? 'opacity-30' : ''}`}>
            <span className={`grid size-5 place-items-center rounded-full ${n < i ? 'bg-[var(--menta)] text-black' : n === i ? 'botao-sinal' : 'border linha-fina'}`}>
              {n < i ? <Check className="size-3" /> : n === i ? <span className="size-1.5 animate-pulse rounded-full bg-white" /> : null}
            </span>
            {e}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted">Leva cerca de 2 minutos. Vale a espera: são perfis confirmados um a um.</p>
    </div>
  )
}

type Saida = { dir: 1 | -1; id: number } | null

export function PassoDescobrir({ contas, setContas, aoSeguir, aoVoltar }: {
  contas: Conta[]; setContas: (c: Conta[]) => void; aoSeguir: () => void; aoVoltar: () => void
}) {
  const [itens, setItens] = useState<Parecido[] | null>(null)
  const [categoria, setCategoria] = useState('')
  const [erro, setErro] = useState('')
  const [pos, setPos] = useState(0)
  const [escolhidos, setEscolhidos] = useState<Parecido[]>([])
  const [arrasto, setArrasto] = useState({ x: 0, y: 0, ativo: false })
  const [saida, setSaida] = useState<Saida>(null)
  const [festa, setFesta] = useState<{ n: number; tipo: Tipo } | null>(null)
  const [seguindo, setSeguindo] = useState(false)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const { downloads } = useAtividade()
  const base = useMemo(() => ({
    concorrentes: contas.filter((c) => c.papel === 'concorrente').length,
    referencias: contas.filter((c) => c.papel === 'referencia').length,
  }), [contas])

  const carregar = useCallback((forcar = false) => {
    setItens(null); setErro(''); setPos(0)
    tocar('analise')
    marcas.descobrirInicio(forcar)
      .then((r) => {
        const ordem = [...r.itens].sort((a, b) => (a.tipo === b.tipo ? b.semelhanca - a.semelhanca : a.tipo === 'concorrente' ? -1 : 1))
        setItens(ordem); setCategoria(r.categoria || '')
        tocar('analiseFim')
      })
      .catch((e) => { setItens([]); setErro((e as Error).message); tocar('erro') })
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const atual = itens?.[pos]
  const trocarTipo = () => {
    if (!atual) return
    tocar('clique')
    setItens((l) => l!.map((x, n) => (n === pos ? { ...x, tipo: x.tipo === 'concorrente' ? 'referencia' : 'concorrente' } : x)))
  }
  const decidir = (dir: 1 | -1) => {
    if (!atual || saida) return
    setSaida({ dir, id: pos })
    if (dir === 1) {
      tocar('favorito')
      setFesta({ n: Date.now(), tipo: atual.tipo })
      setTimeout(() => setFesta(null), 700)
      setEscolhidos((e) => [...e, atual])
      const pedido = atual.id ? central.descoberta(atual.id, 'adicionar', atual.tipo).then((r) => r.contas)
        : api.adicionarConta(atual.conta, atual.plataforma, atual.tipo)
      pedido.then((l) => { if (l) setContas(l) }).catch(() => toast.danger(`Não deu para adicionar @${atual.conta}`))
    } else {
      tocar('apagar')
      if (atual.id) central.descoberta(atual.id, 'ignorar').catch(() => {})
    }
    setTimeout(() => {
      setSaida(null); setArrasto({ x: 0, y: 0, ativo: false }); setPos((p) => p + 1)
      if (itens && pos + 1 >= itens.length) tocar('sucesso')
    }, 320)
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!atual || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') decidir(1)
      else if (e.key === 'ArrowLeft') decidir(-1)
      else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 't') trocarTipo()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const soltar = () => {
    if (!inicio.current) return
    inicio.current = null
    if (Math.abs(arrasto.x) > 110) decidir(arrasto.x > 0 ? 1 : -1)
    else setArrasto({ x: 0, y: 0, ativo: false })
  }

  const seguir = async () => {
    setSeguindo(true)
    // coleta de quem entrou agora (e de quem ficou sem coleta, se a página foi atualizada no meio)
    const ativos = new Set(downloads.map((d) => chave(d)))
    const pendentes = contas.filter((c) => c.papel !== 'proprio' && !c.videos && !ativos.has(chave(c)))
    if (pendentes.length) await api.baixar(pendentes, { modo: 'recentes', quantidade: COLETA_INICIAL, somente_reels: false, analisar_ao_fim: true }).catch(() => {})
    setSeguindo(false)
    aoSeguir()
  }

  const fim = itens !== null && pos >= itens.length
  const cabecalho = (
    <>
      <p className="num text-sm text-muted">Passo 4 de 4</p>
      <h2 className="titulo-display mt-1 text-4xl font-semibold">{fim ? 'Seu radar está montado' : 'Quem vale acompanhar?'}</h2>
      <p className="mt-2 max-w-xl text-muted">
        {itens === null ? 'A IA está cruzando o seu perfil, o que você contou e os perfis que você informou.'
          : fim ? 'Você pode buscar mais agora ou depois, em Concorrentes.'
            : <>Arraste para a direita para acompanhar, para a esquerda para pular.{categoria && <> Sua categoria: <b className="text-foreground">{categoria}</b>.</>}</>}
      </p>
    </>
  )

  if (itens === null) return <div>{cabecalho}<Procurando base={base} /></div>

  if (fim) {
    const porTipo = (t: Tipo) => escolhidos.filter((e) => e.tipo === t)
    return (
      <div>
        {cabecalho}
        <div className="surgir mt-8 grid gap-4 sm:grid-cols-2">
          {(['concorrente', 'referencia'] as Tipo[]).map((t) => (
            <div key={t} className="rounded-3xl p-5" style={{ background: `color-mix(in oklab, ${GRUPO[t].cor} 10%, transparent)` }}>
              <p className="text-sm font-semibold" style={{ color: GRUPO[t].cor }}>{t === 'concorrente' ? 'Concorrentes diretos' : 'Referências'}</p>
              <p className="titulo-display mt-1 text-4xl font-semibold">{contas.filter((c) => c.papel === t).length}</p>
              <p className="text-xs text-muted">{porTipo(t).length ? `${porTipo(t).length} escolhido${porTipo(t).length > 1 ? 's' : ''} agora` : 'nenhum novo agora'}</p>
              <div className="mt-3 flex -space-x-2">
                {contas.filter((c) => c.papel === t).slice(0, 8).map((c) => <Avatar key={chave(c)} conta={c.conta} foto={c.perfil?.foto} tamanho={32} />)}
              </div>
            </div>
          ))}
        </div>
        {erro && <p className="mt-4 text-sm text-muted">Não consegui buscar agora ({erro}).</p>}
        <Rodape aoVoltar={aoVoltar}>
          <Button variant="tertiary" onPress={() => carregar(true)}><ArrowsRotateRight /> Buscar mais</Button>
          <Button className="botao-sinal" isPending={seguindo} onPress={seguir}>Continuar <ArrowRight /></Button>
        </Rodape>
      </div>
    )
  }

  const girar = arrasto.x / 18
  const intencao = Math.max(-1, Math.min(1, arrasto.x / 110))
  return (
    <div>
      {cabecalho}
      <div className="mt-6 flex items-center justify-between text-xs text-muted">
        <span className="num">{pos + 1} de {itens.length}</span>
        <span className="num flex items-center gap-1.5">
          <Check className="size-3 text-[var(--menta)]" /> {escolhidos.length} acompanhando
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-secondary">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(pos / itens.length) * 100}%`, background: 'linear-gradient(90deg, var(--concorrente), var(--referencia))' }} />
      </div>

      <div className="relative mx-auto mt-6 h-[470px] w-full max-w-[380px] select-none">
        {itens.slice(pos, pos + 3).reverse().map((p) => {
          const n = itens.indexOf(p) - pos
          const topo = n === 0
          const saindo = topo && saida
          const transform = saindo ? `translate(${saida.dir * 140}%, ${arrasto.y}px) rotate(${saida.dir * 28}deg)`
            : topo ? `translate(${arrasto.x}px, ${arrasto.y * 0.3}px) rotate(${girar}deg)`
              : `translateY(${n * 14}px) scale(${1 - n * 0.05})`
          return (
            <div key={chave(p)}
              onPointerDown={topo ? (e) => { inicio.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setArrasto((a) => ({ ...a, ativo: true })) } : undefined}
              onPointerMove={topo ? (e) => { if (inicio.current) setArrasto({ x: e.clientX - inicio.current.x, y: e.clientY - inicio.current.y, ativo: true }) } : undefined}
              onPointerUp={topo ? soltar : undefined} onPointerCancel={topo ? soltar : undefined}
              className={`absolute inset-0 touch-none overflow-hidden rounded-[28px] border bg-[var(--surface)] shadow-2xl linha-fina ${topo ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ transform, opacity: saindo ? 0 : 1, zIndex: 10 - n,
                transition: arrasto.ativo && topo && !saindo ? 'none' : 'transform 320ms cubic-bezier(0.2,0.8,0.2,1), opacity 320ms' }}>
              <CartaoDescoberta p={p} aoTrocarTipo={topo ? trocarTipo : undefined} />
              {!topo && <span className="pointer-events-none absolute inset-0 bg-[var(--background)]" style={{ opacity: 0.35 + n * 0.2 }} />}
              {topo && (
                <>
                  <span className="pointer-events-none absolute top-[120px] left-5 sm:top-[150px] -rotate-12 rounded-xl border-[3px] px-3 py-1 text-xl font-black tracking-wider text-[var(--menta)]"
                    style={{ borderColor: 'var(--menta)', opacity: Math.max(0, intencao) }}>ACOMPANHAR</span>
                  <span className="pointer-events-none absolute top-[120px] right-5 sm:top-[150px] rotate-12 rounded-xl border-[3px] px-3 py-1 text-xl font-black tracking-wider text-muted"
                    style={{ borderColor: 'currentColor', opacity: Math.max(0, -intencao) }}>PULAR</span>
                </>
              )}
            </div>
          )
        })}
        {festa && (
          <span key={festa.n} className="pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <Explosao tamanho={180} cor={GRUPO[festa.tipo].cor} />
          </span>
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button onClick={() => decidir(-1)} aria-label="Pular" title="Pular (←)"
          className="grid size-14 place-items-center rounded-full border bg-surface text-muted shadow-lg linha-fina transition-transform hover:scale-105 hover:text-foreground active:scale-95">
          <Xmark className="size-6" />
        </button>
        <button onClick={trocarTipo} aria-label="Trocar de grupo" title="Trocar concorrente/referência (↑)"
          className="grid size-11 place-items-center rounded-full border bg-surface shadow-lg linha-fina transition-transform hover:scale-105 active:scale-95"
          style={{ color: atual ? GRUPO[atual.tipo === 'concorrente' ? 'referencia' : 'concorrente'].cor : undefined }}>
          <ArrowsRotateRight className="size-4" />
        </button>
        <button onClick={() => decidir(1)} aria-label="Acompanhar" title="Acompanhar (→)"
          className="grid size-14 place-items-center rounded-full text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: 'var(--menta)' }}>
          <Check className="size-6" />
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Atalhos: ← pular · → acompanhar · ↑ trocar de grupo</p>

      <Rodape aoVoltar={aoVoltar}>
        <Button variant="ghost" onPress={() => { setPos(itens.length); tocar('navegar') }}>Pular o resto</Button>
      </Rodape>
    </div>
  )
}

function CartaoDescoberta({ p, aoTrocarTipo }: { p: Parecido; aoTrocarTipo?: () => void }) {
  const [falhou, setFalhou] = useState(false)
  const cor = GRUPO[p.tipo].cor
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[160px] shrink-0 overflow-hidden sm:h-[200px]" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${cor} 45%, #0b0d14), #0b0d14)` }}>
        {p.foto && !falhou ? (
          <>
            <img src={p.foto} alt="" draggable={false} className="absolute inset-0 size-full scale-125 object-cover opacity-40 blur-2xl" />
            <img src={p.foto} alt="" draggable={false} onError={() => setFalhou(true)}
              className="absolute top-1/2 left-1/2 size-24 -translate-x-1/2 sm:size-28 -translate-y-1/2 rounded-full object-cover shadow-2xl ring-4" style={{ ['--tw-ring-color' as string]: cor }} />
          </>
        ) : (
          <span className="absolute top-1/2 left-1/2 grid size-24 -translate-x-1/2 sm:size-28 -translate-y-1/2 place-items-center rounded-full text-4xl font-semibold text-white uppercase ring-4"
            style={{ ...aura(p.conta), ['--tw-ring-color' as string]: cor }}>{p.conta[0]}</span>
        )}
        <span className="absolute top-3 left-3"><Etiqueta tipo={p.tipo} onPress={aoTrocarTipo} grande /></span>
        <span className="num absolute top-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">{p.semelhanca}% de afinidade</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <p className="titulo-display truncate text-xl font-semibold">{p.nome || `@${p.conta}`}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
          <IconePlataforma plataforma={p.plataforma} className="size-3.5 shrink-0" />@{p.conta}{p.seguidores != null ? ` · ${fmtNum(p.seguidores)} seguidores` : ''}
        </p>
        {p.produto && (
          <p className="mt-3 self-start rounded-lg px-2 py-1 text-xs font-medium" style={{ color: cor, background: `color-mix(in oklab, ${cor} 12%, transparent)` }}>
            {p.marca_oficial ? 'Vende: ' : 'Fala de: '}{p.produto}
          </p>
        )}
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/85 sm:line-clamp-3">{p.motivo}</p>
        {p.comparacao && (
          <p className="mt-auto border-t pt-3 text-[13px] leading-relaxed text-muted linha-fina">
            <span className="font-semibold text-foreground">Comparado a você: </span>{p.comparacao}
          </p>
        )}
      </div>
    </div>
  )
}
