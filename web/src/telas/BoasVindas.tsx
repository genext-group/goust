import { Button, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { ia, inicio, type Conta } from '../api'
import { auraMarca } from '../aura'
import { CheckDesenhado, LogoAnimado } from '../components/Animacoes'
import { AnimProcesso } from '../components/AnimProcessos'
import { BuscaPerfis } from '../components/BuscaPerfis'
import { PassoConhecidos, PassoDescobrir } from './onboarding/Descobrir'
import { useAtividade } from '../components/Atividade'
import { tocar } from '../sons'

const PASSOS = ['Boas-vindas', 'Seu perfil', 'Seu negócio', 'Quem você conhece', 'Descobrir', 'Pronto'] as const

export function BoasVindas({ contas, setContas, aoTerminar, passoInicial = 0 }: {
  contas: Conta[]; setContas: (c: Conta[]) => void; aoTerminar: () => void; passoInicial?: number
}) {
  const [passo, setPasso] = useState(Math.min(Math.max(passoInicial, 0), PASSOS.length - 1))
  const [descricao, setDescricao] = useState('')
  const [nome, setNome] = useState('')
  const proprio = contas.find((c) => c.papel === 'proprio')

  useEffect(() => {
    ia.marca().then((m) => { setDescricao(m.produto || ''); setNome(m.nome || '') }).catch(() => {})
  }, [])

  const ir = (n: number) => {
    tocar('navegar'); setPasso(n)
    inicio.config({ onboarding_passo: n }).catch(() => {})  // atualizar a página volta para cá
  }
  const concluir = async () => {
    await inicio.config({ onboarding: true, onboarding_passo: null }).catch(() => {})
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
          {passo === 3 && <PassoConhecidos contas={contas} setContas={setContas} aoSeguir={() => ir(4)} aoVoltar={() => ir(2)} />}
          {passo === 4 && <PassoDescobrir contas={contas} setContas={setContas} aoSeguir={() => ir(5)} aoVoltar={() => ir(3)} />}
          {passo === 5 && <PassoMagica contas={contas} aoTerminar={concluir} />}
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
      <p className="num text-sm text-muted">Passo 1 de 4</p>
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
      <p className="num text-sm text-muted">Passo 2 de 4</p>
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
    const texto = { coleta: dl?.total ? `Coletando ${dl.baixados + dl.pulados} de ${dl.total}` : dl?.status === 'listando' ? 'Contando os posts…' : 'Na fila…',
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
