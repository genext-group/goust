import { Button, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, ArrowsRotateRight, Check, Plus, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { COLETA_INICIAL, api, ia, inicio, marcas, type Conta, type Parecido, type Plataforma } from '../api'
import { fmtNum } from '../formato'
import { IconePlataforma } from '../components/Plataforma'
import { aura, auraMarca } from '../aura'
import { CheckDesenhado, LogoAnimado, Radar } from '../components/Animacoes'
import { AnimProcesso } from '../components/AnimProcessos'
import { BuscaPerfis } from '../components/BuscaPerfis'
import { useAtividade } from '../components/Atividade'
import { tocar } from '../sons'

const PASSOS = ['Boas-vindas', 'Seu perfil', 'Seu negócio', 'Concorrentes', 'Pronto'] as const

/** Acha, na lista devolvida pelo servidor, a conta que acabou de ser adicionada. */
function acharConta(lista: Conta[], texto: string, papel: 'proprio' | 'concorrente' | 'referencia') {
  const alvo = texto.trim().replace(/^@/, '').replace(/\/+$/, '').split('/').pop()!.split('?')[0].replace(/^@/, '').toLowerCase()
  return lista.find((c) => c.conta.toLowerCase() === alvo) ?? lista.filter((c) => (c.papel ?? 'concorrente') === papel).at(-1)
}

export function BoasVindas({ contas, setContas, aoTerminar }: {
  contas: Conta[]; setContas: (c: Conta[]) => void; aoTerminar: () => void
}) {
  const [passo, setPasso] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [nome, setNome] = useState('')
  const proprio = contas.find((c) => c.papel === 'proprio')

  useEffect(() => {
    ia.marca().then((m) => { setDescricao(m.produto || ''); setNome(m.nome || '') }).catch(() => {})
  }, [])

  const ir = (n: number) => { tocar('navegar'); setPasso(n) }
  const concluir = async () => {
    await inicio.config({ onboarding: true }).catch(() => {})
    aoTerminar()
  }

  return (
    <div className="ambiente relative min-h-screen overflow-x-clip">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-8 sm:py-12">
        <header className="flex items-center gap-3">
          <LogoAnimado />
          <span className="titulo-display text-lg font-semibold tracking-tight">Goust</span>
          <div className="ml-auto flex items-center gap-1.5" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
            {PASSOS.map((p, i) => (
              <span key={p} className={`h-1.5 rounded-full transition-all duration-500 ${i === passo ? 'botao-sinal w-8' : i < passo ? 'w-3 bg-accent/60' : 'w-3 bg-surface-tertiary'}`} />
            ))}
          </div>
        </header>

        <main key={passo} className="troca-pagina flex flex-1 flex-col justify-center py-10">
          {passo === 0 && <Abertura aoComecar={() => ir(1)} />}
          {passo === 1 && <PassoPerfil proprio={proprio} setContas={setContas} aoSeguir={() => ir(2)} aoVoltar={() => ir(0)} />}
          {passo === 2 && (
            <PassoNegocio descricao={descricao} setDescricao={setDescricao} nome={nome} setNome={setNome}
              temPerfil={!!proprio} aoSeguir={() => ir(3)} aoVoltar={() => ir(1)} />
          )}
          {passo === 3 && <PassoConcorrentes descricao={descricao} setContas={setContas} aoSeguir={() => ir(4)} aoVoltar={() => ir(2)} />}
          {passo === 4 && <PassoMagica contas={contas} aoTerminar={concluir} />}
        </main>
      </div>
    </div>
  )
}

function Abertura({ aoComecar }: { aoComecar: () => void }) {
  return (
    <div className="space-y-8">
      <section className="aura overflow-hidden rounded-[2rem] px-8 py-12 text-white sm:px-12 sm:py-16" style={auraMarca}>
        <p className="text-sm text-white/70">Bem-vindo</p>
        <h1 className="titulo-display mt-2 text-4xl leading-[1.04] font-semibold sm:text-6xl">
          Descubra o que funciona no seu mercado. E crie a partir disso.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/80">
          Em 3 passos a IA coleta seu perfil e o dos concorrentes, analisa o que dá resultado e monta sua estratégia e seu
          calendário.
        </p>
      </section>
      <ol className="cascata grid gap-3 sm:grid-cols-3">
        {[['coleta', 'Coleta', 'Posts, métricas e comentários de cada perfil.'],
          ['analise', 'Análise', 'Posicionamento, ganchos, formatos e o que o público pede.'],
          ['geracao', 'Criação', 'Estratégia, calendário, roteiros e imagens no seu estilo.']].map(([t, n, d], i) => (
          <li key={n} style={{ '--i': i } as React.CSSProperties} className="cartao flex items-start gap-3 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-secondary text-foreground">
              <AnimProcesso tipo={t as 'coleta'} tamanho={36} />
            </span>
            <span><span className="block font-medium">{n}</span><span className="block text-sm leading-relaxed text-muted">{d}</span></span>
          </li>
        ))}
      </ol>
      <div className="flex justify-end">
        <Button size="lg" className="botao-sinal" onPress={aoComecar}>Começar <ArrowRight /></Button>
      </div>
    </div>
  )
}

function Rodape({ aoVoltar, children }: { aoVoltar: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <Button variant="ghost" onPress={aoVoltar}><ArrowLeft /> Voltar</Button>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function PassoPerfil({ proprio, setContas, aoSeguir, aoVoltar }: {
  proprio?: Conta; setContas: (c: Conta[]) => void; aoSeguir: () => void; aoVoltar: () => void
}) {
  return (
    <div>
      <p className="num text-sm text-muted">Passo 1 de 3</p>
      <h2 className="titulo-display mt-1 text-4xl font-semibold">Qual é o seu perfil?</h2>
      <p className="mt-2 max-w-xl text-muted">
        A IA analisa o seu perfil com o mesmo olhar que usa nos concorrentes. A coleta começa agora e segue sozinha enquanto
        você responde o resto.
      </p>
      {proprio ? (
        <div className="cartao mt-8 flex items-center gap-3 p-4">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--menta)] text-black"><CheckDesenhado tamanho={16} /></span>
          <p className="flex-1">@{proprio.conta} conectado. A coleta já começou.</p>
        </div>
      ) : (
        <div className="mt-8">
          <BuscaPerfis proprio emLinha aoAdicionar={(lista) => { setContas(lista); aoSeguir() }} placeholder="Busque seu perfil pelo nome ou @, ou cole o link" />
        </div>
      )}
      <Rodape aoVoltar={aoVoltar}>
        {!proprio && <Button variant="ghost" onPress={aoSeguir}>Ainda não tenho perfil</Button>}
        {proprio && <Button className="botao-sinal" onPress={aoSeguir}>Continuar <ArrowRight /></Button>}
      </Rodape>
    </div>
  )
}

function PassoNegocio({ descricao, setDescricao, nome, setNome, temPerfil, aoSeguir, aoVoltar }: {
  descricao: string; setDescricao: (s: string) => void; nome: string; setNome: (s: string) => void
  temPerfil: boolean; aoSeguir: () => void; aoVoltar: () => void
}) {
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [alcance, setAlcance] = useState<'' | 'local' | 'online'>('')
  const [cidade, setCidade] = useState('')

  useEffect(() => {
    ia.marca().then((m) => {
      if (m.alcance) setAlcance(/local|cidade|regi/i.test(m.alcance) ? 'local' : 'online')
      setCidade(m.cidade || '')
    }).catch(() => {})
  }, [])

  const preencher = async () => {
    setLendo(true)
    try {
      const r = await ia.rascunharBrief()
      const atual = await ia.marca()
      const novo = { ...atual }
      Object.entries(r).forEach(([k, v]) => { if (v && !atual[k]?.trim()) novo[k] = v })
      await ia.salvarMarca(novo)
      setDescricao(novo.produto || descricao)
      setNome(novo.nome || nome)
      tocar('geracaoFim')
      toast.success('A IA rascunhou o seu brief', { description: 'Você revisa tudo depois em Meu perfil.' })
    } catch (e) {
      toast.danger('Não deu para ler o perfil ainda', { description: (e as Error).message })
    } finally { setLendo(false) }
  }
  const seguir = async () => {
    setSalvando(true)
    try {
      const atual = await ia.marca()
      await ia.salvarMarca({
        ...atual, nome: nome.trim(), produto: descricao.trim(),
        alcance: alcance === 'local' ? 'local (atende uma cidade/região)' : 'online/nacional (atende o Brasil todo)',
        cidade: alcance === 'local' ? cidade.trim() : '',
      })
    } catch { /* segue mesmo assim */ }
    setSalvando(false)
    aoSeguir()
  }

  return (
    <div>
      <p className="num text-sm text-muted">Passo 2 de 3</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h2 className="titulo-display text-4xl font-semibold">O que você faz?</h2>
        {temPerfil && (
          <Button variant="tertiary" isPending={lendo} onPress={preencher}>
            <Sparkles /> {lendo ? 'Lendo seu perfil…' : 'Preencher pelo meu perfil'}
          </Button>
        )}
      </div>
      <p className="mt-2 max-w-xl text-muted">Uma frase basta. É com ela que a IA procura seus concorrentes e calibra as recomendações.</p>
      <div className="mt-8 grid gap-5">
        <TextField value={nome} onChange={setNome}>
          <Label>Nome da marca ou do criador</Label>
          <Input placeholder="Ex.: Dinheiro em Dia" />
        </TextField>
        <TextField value={descricao} onChange={setDescricao}>
          <Label>O que você vende e para quem</Label>
          <TextArea className="min-h-24 text-base" placeholder="Ex.: Consultoria de finanças para casais que querem sair das dívidas em 12 meses." />
        </TextField>
        <div>
          <p className="text-sm font-medium">Onde estão os seus clientes?</p>
          <p className="mt-0.5 text-sm text-muted">Isso muda quem é seu concorrente de verdade.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <OpcaoAlcance ativo={alcance === 'local'} onPress={() => setAlcance('local')} titulo="Na minha cidade ou região"
              texto="Lanchonete, clínica, academia, loja física. Concorrente é quem atende a sua cidade." />
            <OpcaoAlcance ativo={alcance === 'online'} onPress={() => setAlcance('online')} titulo="No Brasil todo (online)"
              texto="App, curso, e-commerce, serviço online. Concorrente é quem vende algo parecido, em qualquer lugar." />
          </div>
          {alcance === 'local' && (
            <TextField value={cidade} onChange={setCidade} className="mt-3">
              <Label>Cidade</Label>
              <Input placeholder="Ex.: Campinas, SP" />
            </TextField>
          )}
        </div>
      </div>
      <Rodape aoVoltar={aoVoltar}>
        <Button className="botao-sinal" isPending={salvando} isDisabled={!descricao.trim() || !alcance || (alcance === 'local' && !cidade.trim())} onPress={seguir}>Continuar <ArrowRight /></Button>
      </Rodape>
    </div>
  )
}

function OpcaoAlcance({ ativo, onPress, titulo, texto }: { ativo: boolean; onPress: () => void; titulo: string; texto: string }) {
  return (
    <button type="button" onClick={onPress} aria-pressed={ativo}
      className={`flex items-start gap-3 rounded-2xl p-3.5 text-left transition-all ${ativo ? 'bg-accent/12 ring-1 ring-accent/50' : 'bg-surface hover:bg-surface-secondary'}`}>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${ativo ? 'botao-sinal' : 'linha-fina'}`}>
        {ativo && <Check className="size-3" />}
      </span>
      <span><span className="block text-sm font-medium">{titulo}</span><span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{texto}</span></span>
    </button>
  )
}

type Tipo = 'concorrente' | 'referencia'
type Candidato = Pick<Parecido, 'plataforma' | 'conta' | 'nome' | 'foto' | 'seguidores' | 'motivo'> & { tipo: Tipo }

function PassoConcorrentes({ descricao, setContas, aoSeguir, aoVoltar }: {
  descricao: string; setContas: (c: Conta[]) => void; aoSeguir: () => void; aoVoltar: () => void
}) {
  const [itens, setItens] = useState<Candidato[] | null>(null)
  const [erro, setErro] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cidade, setCidade] = useState<string | null>(null)

  useEffect(() => {
    tocar('analise')
    ia.marca().then((m) => setCidade(/local|cidade|regi/i.test(m.alcance || '') ? (m.cidade || 'sua cidade') : null)).catch(() => {})
    marcas.parecidos({ chaves: [], negocio: true })
      .then((r) => {
        const lista: Candidato[] = r.itens.map((x) => ({ ...x, tipo: x.tipo }))
        setItens(lista)
        const chave = (x: Candidato) => `${x.plataforma}/${x.conta}`
        setMarcados(new Set([...lista.filter((x) => x.tipo === 'concorrente').slice(0, 4), ...lista.filter((x) => x.tipo === 'referencia').slice(0, 2)].map(chave)))
        tocar('analiseFim')
      })
      .catch((e) => { setItens([]); setErro((e as Error).message) })
  }, [descricao])

  const k = (x: Candidato) => `${x.plataforma}/${x.conta}`
  const alternar = (c: string) => setMarcados((m) => { const n = new Set(m); n.has(c) ? n.delete(c) : n.add(c); return n })
  const trocarTipo = (c: Candidato) => setItens((l) => (l ?? []).map((x) => k(x) === k(c) ? { ...x, tipo: x.tipo === 'concorrente' ? 'referencia' : 'concorrente' } : x))
  const adicionarManual = () => {
    const conta = manual.trim().replace(/^@/, '').split('/').filter(Boolean).pop()?.split('?')[0]?.replace(/^@/, '').toLowerCase()
    if (!conta) return
    const plataforma: Plataforma = manual.includes('tiktok') ? 'tiktok' : 'instagram'
    const novo: Candidato = { plataforma, conta, nome: null, foto: null, seguidores: null, motivo: 'Adicionado por você', tipo: 'concorrente' }
    setItens((l) => [novo, ...(l ?? []).filter((x) => k(x) !== k(novo))])
    setMarcados((m) => new Set(m).add(k(novo)))
    setManual('')
  }
  const seguir = async () => {
    setOcupado(true)
    try {
      const escolhidos = (itens ?? []).filter((s) => marcados.has(k(s)))
      let lista: Conta[] = []
      const adicionadas: Conta[] = []
      for (const s of escolhidos) {
        try {
          lista = await api.adicionarConta(s.conta, s.plataforma, s.tipo)
          const c = acharConta(lista, s.conta, s.tipo)
          if (c) adicionadas.push(c)
        } catch { /* perfil inválido: segue com os outros */ }
      }
      if (lista.length) setContas(lista)
      if (adicionadas.length) {
        await api.baixar(adicionadas, { modo: 'recentes', quantidade: COLETA_INICIAL, somente_reels: false, analisar_ao_fim: true })
      }
      aoSeguir()
    } finally { setOcupado(false) }
  }

  const grupos: { tipo: Tipo; titulo: string; texto: string }[] = [
    {
      tipo: 'concorrente', titulo: 'Concorrentes diretos',
      texto: cidade ? `Disputam o mesmo cliente que você em ${cidade}.` : 'Vendem algo parecido para o mesmo público, em qualquer lugar do Brasil.',
    },
    {
      tipo: 'referencia', titulo: 'Referências',
      texto: cidade ? 'O mesmo tipo de negócio em outras cidades e perfis que inspiram. Não disputam seu cliente, mas ensinam.'
        : 'Não disputam o seu cliente, mas fazem conteúdo que vale estudar.',
    },
  ]

  return (
    <div>
      <p className="num text-sm text-muted">Passo 3 de 3</p>
      <h2 className="titulo-display mt-1 text-4xl font-semibold">Quem você quer acompanhar?</h2>
      <p className="mt-2 max-w-xl text-muted">A Goust buscou perfis reais no Instagram e no TikTok. Marque quem faz sentido; se algum estiver no grupo errado, toque na etiqueta para trocar.</p>

      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionarManual() }}>
        <Input aria-label="Adicionar perfil" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="@perfil ou link (Instagram ou TikTok)" className="flex-1" />
        <Button type="submit" variant="tertiary" isDisabled={!manual.trim()}><Plus /> Adicionar</Button>
      </form>

      {itens === null ? (
        <div className="cartao mt-5 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-foreground"><Radar tamanho={110} /></div>
          <p className="font-medium">Buscando perfis do seu mercado no Instagram e no TikTok…</p>
          <p className="text-sm text-muted">Leva até um minuto.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-7">
          {erro && <p className="text-sm text-muted">Não consegui buscar agora ({erro}). Adicione os perfis acima.</p>}
          {!erro && !itens.length && <p className="text-sm text-muted">Não encontrei perfis parecidos. Adicione os que você conhece acima.</p>}
          {grupos.map((g) => {
            const doGrupo = itens.filter((x) => x.tipo === g.tipo)
            if (!doGrupo.length) return null
            return (
              <section key={g.tipo}>
                <h3 className="text-sm font-semibold">{g.titulo} <span className="font-normal text-muted">· {doGrupo.length}</span></h3>
                <p className="mt-0.5 text-[13px] text-muted">{g.texto}</p>
                <div className="cascata mt-3 grid gap-2 sm:grid-cols-2">
                  {doGrupo.map((s, i) => (
                    <CartaoCandidato key={k(s)} s={s} i={i} ativo={marcados.has(k(s))} aoAlternar={() => alternar(k(s))} aoTrocarTipo={() => trocarTipo(s)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Rodape aoVoltar={aoVoltar}>
        <span className="hidden text-sm text-muted sm:inline">{marcados.size} selecionado{marcados.size === 1 ? '' : 's'}</span>
        <Button className="botao-sinal" isPending={ocupado} isDisabled={itens === null} onPress={seguir}>
          {marcados.size ? 'Acompanhar e analisar' : 'Pular'} <ArrowRight />
        </Button>
      </Rodape>
    </div>
  )
}

function CartaoCandidato({ s, i, ativo, aoAlternar, aoTrocarTipo }: { s: Candidato; i: number; ativo: boolean; aoAlternar: () => void; aoTrocarTipo: () => void }) {
  const [falhou, setFalhou] = useState(false)
  const chave = `${s.plataforma}/${s.conta}`
  return (
    <div role="button" tabIndex={0} onClick={aoAlternar} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAlternar() } }}
      style={{ '--i': i } as React.CSSProperties}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left transition-all ${ativo ? 'bg-accent/12 ring-1 ring-accent/50' : 'bg-surface hover:bg-surface-secondary'}`}>
      <span className="aura relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white uppercase" style={aura(chave)}>
        {s.conta.slice(0, 1)}
        {s.foto && !falhou && <img src={s.foto} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 size-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{s.nome || `@${s.conta}`}</span>
        <span className="flex items-center gap-1 truncate text-xs text-muted">
          <IconePlataforma plataforma={s.plataforma} className="size-3 shrink-0" />@{s.conta}{s.seguidores != null ? ` · ${fmtNum(s.seguidores)} seguidores` : ''}
        </span>
        <span className="mt-1.5 line-clamp-2 block text-[13px] leading-relaxed text-foreground/75">{s.motivo}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); aoTrocarTipo() }} title="Trocar de grupo"
          className="mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted linha-fina transition-colors hover:text-foreground">
          {s.tipo === 'concorrente' ? 'Concorrente direto' : 'Referência'} <ArrowsRotateRight className="size-2.5" />
        </button>
      </span>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors ${ativo ? 'botao-sinal' : 'linha-fina'}`}>
        {ativo && <Check className="size-3.5" />}
      </span>
    </div>
  )
}

function PassoMagica({ contas, aoTerminar }: { contas: Conta[]; aoTerminar: () => void }) {
  const { downloads, ia: tarefasIA } = useAtividade()
  useEffect(() => { inicio.piloto({ estrategia: true, calendario: true }).catch(() => {}) }, [])

  const linhas = contas.map((c) => {
    const dl = downloads.find((t) => t.plataforma === c.plataforma && t.conta === c.conta)
    const an = tarefasIA.find((t) => t.tipo === 'perfil' && t.plataforma === c.plataforma && t.conta === c.conta)
    const etapa: 'coleta' | 'comentarios' | 'analise' | 'pronto' | 'espera' =
      an && ['na fila', 'rodando'].includes(an.status) ? 'analise'
        : an?.status === 'concluído' ? 'pronto'
          : dl?.status === 'comentários' ? 'comentarios'
            : dl && ['na fila', 'listando', 'baixando'].includes(dl.status) ? 'coleta' : dl ? 'pronto' : 'espera'
    const texto = { coleta: dl?.total ? `Coletando ${dl.baixados + dl.pulados} de ${dl.total}` : 'Coletando posts…',
      comentarios: 'Lendo comentários…', analise: an?.total ? `IA analisando ${an.feito} de ${an.total}` : 'IA analisando…',
      pronto: 'Pronto', espera: 'Na fila' }[etapa]
    return { c, etapa, texto }
  })

  return (
    <div className="space-y-6">
      <section className="aura overflow-hidden rounded-[2rem] px-8 py-10 text-white sm:px-12" style={auraMarca}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="grid size-20 place-items-center rounded-3xl bg-white/10 backdrop-blur-md"><AnimProcesso tipo="geracao" tamanho={60} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="titulo-display text-4xl leading-tight font-semibold">A mágica começou.</h2>
            <p className="mt-2 max-w-lg text-white/80">
              Quando a coleta e as análises terminarem, a IA gera sozinha sua estratégia e o calendário das próximas 2 semanas.
              Você pode explorar o painel enquanto isso.
            </p>
          </div>
        </div>
      </section>
      <div className="cartao divide-y linha-fina [&>*]:linha-fina">
        {linhas.length === 0 && <p className="p-5 text-sm text-muted">Nenhum perfil adicionado. Você pode fazer isso no painel.</p>}
        {linhas.map(({ c, etapa, texto }) => (
          <div key={`${c.plataforma}/${c.conta}`} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-secondary text-foreground">
              {etapa === 'pronto' ? <span className="text-[var(--menta)]"><CheckDesenhado tamanho={16} /></span>
                : etapa === 'espera' ? <span className="size-2 rounded-full bg-muted" />
                  : <AnimProcesso tipo={etapa} tamanho={30} />}
            </span>
            <p className="min-w-0 flex-1 truncate font-medium">@{c.conta} {c.papel === 'proprio' && <span className="text-xs font-normal text-accent">· você</span>}</p>
            <p className={`num text-sm ${etapa === 'pronto' ? 'text-[var(--menta)]' : 'text-muted'}`}>{texto}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="lg" className="botao-sinal" onPress={aoTerminar}>Explorar o painel <ArrowRight /></Button>
      </div>
    </div>
  )
}
