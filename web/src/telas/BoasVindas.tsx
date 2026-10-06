import { Button, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { api, ia, inicio, type Conta, type Plataforma, type Sugestao } from '../api'
import { aura, auraMarca } from '../aura'
import { CheckDesenhado, LogoAnimado, Radar } from '../components/Animacoes'
import { AnimProcesso } from '../components/AnimProcessos'
import { BuscaPerfis } from '../components/BuscaPerfis'
import { useAtividade } from '../components/Atividade'
import { tocar } from '../sons'

const PASSOS = ['Boas-vindas', 'Seu perfil', 'Seu negócio', 'Concorrentes', 'Pronto'] as const

/** Acha, na lista devolvida pelo servidor, a conta que acabou de ser adicionada. */
function acharConta(lista: Conta[], texto: string, papel: 'proprio' | 'concorrente') {
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
          <span className="titulo-display text-lg font-semibold">Referências</span>
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
      await ia.salvarMarca({ ...atual, nome: nome.trim(), produto: descricao.trim() })
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
          <TextArea className="min-h-28 text-base" placeholder="Ex.: Consultoria de finanças para casais que querem sair das dívidas em 12 meses." />
        </TextField>
      </div>
      <Rodape aoVoltar={aoVoltar}>
        <Button className="botao-sinal" isPending={salvando} isDisabled={!descricao.trim()} onPress={seguir}>Continuar <ArrowRight /></Button>
      </Rodape>
    </div>
  )
}

function PassoConcorrentes({ descricao, setContas, aoSeguir, aoVoltar }: {
  descricao: string; setContas: (c: Conta[]) => void; aoSeguir: () => void; aoVoltar: () => void
}) {
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null)
  const [erro, setErro] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState('')
  const [extras, setExtras] = useState<Sugestao[]>([])
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    tocar('analise')
    inicio.sugerirConcorrentes(descricao)
      .then((s) => {
        setSugestoes(s)
        setMarcados(new Set(s.slice(0, 4).map((x) => `${x.plataforma}/${x.conta}`)))
        tocar('analiseFim')
      })
      .catch((e) => { setSugestoes([]); setErro((e as Error).message) })
  }, [descricao])

  const todos = [...extras, ...(sugestoes ?? [])]
  const alternar = (k: string) => setMarcados((m) => { const n = new Set(m); n.has(k) ? n.delete(k) : n.add(k); return n })
  const adicionarManual = () => {
    const conta = manual.trim().replace(/^@/, '').split('/').filter(Boolean).pop()?.split('?')[0]
    if (!conta) return
    const plataforma: Plataforma = manual.includes('tiktok') ? 'tiktok' : 'instagram'
    setExtras((x) => [{ plataforma, conta, nome: '', por_que: 'Adicionado por você' }, ...x])
    setMarcados((m) => new Set(m).add(`${plataforma}/${conta}`))
    setManual('')
  }
  const seguir = async () => {
    setOcupado(true)
    try {
      const escolhidos = todos.filter((s) => marcados.has(`${s.plataforma}/${s.conta}`))
      let lista: Conta[] = []
      const adicionadas: Conta[] = []
      for (const s of escolhidos) {
        try {
          lista = await api.adicionarConta(s.conta, s.plataforma, 'concorrente')
          const c = acharConta(lista, s.conta, 'concorrente')
          if (c) adicionadas.push(c)
        } catch { /* perfil inválido: segue com os outros */ }
      }
      if (lista.length) setContas(lista)
      if (adicionadas.length) {
        await api.baixar(adicionadas, { modo: 'recentes', quantidade: 30, somente_reels: false, analisar_ao_fim: true })
      }
      aoSeguir()
    } finally { setOcupado(false) }
  }

  return (
    <div>
      <p className="num text-sm text-muted">Passo 3 de 3</p>
      <h2 className="titulo-display mt-1 text-4xl font-semibold">Quem você quer acompanhar?</h2>
      <p className="mt-2 max-w-xl text-muted">A IA pesquisou perfis do seu nicho. Marque os que fazem sentido ou adicione os seus.</p>

      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionarManual() }}>
        <Input aria-label="Adicionar perfil" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="@perfil ou link (Instagram ou TikTok)" className="flex-1" />
        <Button type="submit" variant="tertiary" isDisabled={!manual.trim()}><Plus /> Adicionar</Button>
      </form>

      {sugestoes === null ? (
        <div className="cartao mt-5 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-foreground"><Radar tamanho={110} /></div>
          <p className="font-medium">Procurando perfis do seu nicho na web…</p>
          <p className="text-sm text-muted">Leva uns 30 segundos.</p>
        </div>
      ) : (
        <div className="cascata mt-5 grid gap-2 sm:grid-cols-2">
          {erro && <p className="text-sm text-muted sm:col-span-2">Não consegui pesquisar agora ({erro}). Adicione os perfis acima.</p>}
          {todos.map((s, i) => {
            const k = `${s.plataforma}/${s.conta}`
            const ativo = marcados.has(k)
            return (
              <button key={k} onClick={() => alternar(k)} style={{ '--i': i } as React.CSSProperties}
                className={`flex items-start gap-3 rounded-2xl p-3.5 text-left transition-all ${ativo ? 'bg-accent/12 ring-1 ring-accent/50' : 'bg-surface hover:bg-surface-secondary'}`}>
                <span className="aura grid size-11 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white uppercase" style={aura(k)}>
                  {s.conta.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">@{s.conta} <span className="text-xs font-normal text-muted">· {s.plataforma === 'tiktok' ? 'TikTok' : 'Instagram'}</span></span>
                  {s.nome && <span className="block truncate text-xs text-muted">{s.nome}</span>}
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">{s.por_que}</span>
                </span>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors ${ativo ? 'botao-sinal' : 'linha-fina'}`}>
                  {ativo && <Check className="size-3.5" />}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <Rodape aoVoltar={aoVoltar}>
        <span className="hidden text-sm text-muted sm:inline">{marcados.size} selecionado{marcados.size === 1 ? '' : 's'}</span>
        <Button className="botao-sinal" isPending={ocupado} isDisabled={sugestoes === null && extras.length === 0} onPress={seguir}>
          {marcados.size ? 'Acompanhar e analisar' : 'Pular'} <ArrowRight />
        </Button>
      </Rodape>
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
