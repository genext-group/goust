import { Button, Input, Label, TextArea, TextField, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles } from '@gravity-ui/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { api, ia, type Conta, type Marca, type Plataforma, type Tarefa, type TarefaIA } from '../../api'
import { AvatarConta } from '../Avatar'
import { Pipeline } from './Pipeline'

type Campo = { k: string; rotulo: string; dica: string; longo?: boolean; atalhos?: string[]; multiplo?: boolean }

const ETAPAS: { id: string; titulo: string; pergunta: string; campos: Campo[] }[] = [
  { id: 'perfil', titulo: 'Seu perfil', pergunta: 'Qual é o seu perfil?', campos: [] },
  {
    id: 'negocio', titulo: 'Negócio', pergunta: 'O que você oferece?',
    campos: [
      { k: 'nome', rotulo: 'Nome da marca ou do criador', dica: 'Ex.: Dinheiro em Dia' },
      { k: 'produto', rotulo: 'O que você vende', dica: 'Oferta, preço e como funciona', longo: true },
      { k: 'diferenciais', rotulo: 'Por que escolher você', dica: 'O que só você tem', longo: true },
      { k: 'site', rotulo: 'Site', dica: 'https://…' },
    ],
  },
  {
    id: 'publico', titulo: 'Público', pergunta: 'Para quem você fala?',
    campos: [
      { k: 'publico', rotulo: 'Quem é o seu cliente ideal', dica: 'Idade, momento de vida, profissão, renda…', longo: true },
      { k: 'dores_do_publico', rotulo: 'O que tira o sono dele e o que ele quer conquistar', dica: 'Dores, medos, desejos', longo: true },
    ],
  },
  {
    id: 'objetivos', titulo: 'Objetivos', pergunta: 'Onde você quer chegar?',
    campos: [
      { k: 'objetivos', rotulo: 'Objetivo principal com conteúdo', dica: 'Escolha um atalho ou escreva', longo: true,
        atalhos: ['Vender meu produto', 'Gerar leads', 'Crescer audiência', 'Virar referência no nicho', 'Lançar um produto'] },
      { k: 'metas', rotulo: 'Metas em números e prazo', dica: 'Ex.: 10 mil seguidores e 300 leads por mês até março', longo: true },
      { k: 'onde_quer_chegar', rotulo: 'Como você quer estar daqui a um ano', dica: 'A visão por trás das metas', longo: true },
      { k: 'posicionamento_desejado', rotulo: 'Como quer ser lembrado', dica: 'Ex.: o jeito mais simples de organizar o dinheiro', longo: true },
    ],
  },
  {
    id: 'producao', titulo: 'Produção', pergunta: 'Como você produz?',
    campos: [
      { k: 'tom', rotulo: 'Tom de voz', dica: 'Escolha até três', multiplo: true,
        atalhos: ['Próximo', 'Bem-humorado', 'Didático', 'Direto ao ponto', 'Inspirador', 'Técnico', 'Premium'] },
      { k: 'frequencia_possivel', rotulo: 'Quanto você consegue publicar', dica: 'Seja realista',
        atalhos: ['1 post por semana', '3 posts por semana', '5 posts por semana', 'Todo dia'] },
      { k: 'recursos_producao', rotulo: 'Recursos de produção', dica: 'Quem aparece, quem edita, equipamento, tempo disponível', longo: true },
      { k: 'restricoes', rotulo: 'O que você não faz', dica: 'Temas, formatos ou estilos fora de questão', longo: true },
    ],
  },
  { id: 'revisao', titulo: 'Revisão', pergunta: 'Tudo certo?', campos: [] },
]

interface Props {
  contas: Conta[]
  setContas: (c: Conta[]) => void
  downloads: Tarefa[]
  tarefasIA: TarefaIA[]
  relatoriosProprios: Set<string>
  etapaInicial?: number
  aoColetar: () => void
  aoConcluir: (gerarEstrategia: boolean) => void
}

export function Assistente({ contas, setContas, downloads, tarefasIA, relatoriosProprios, etapaInicial = 0, aoColetar, aoConcluir }: Props) {
  const [etapa, setEtapa] = useState(etapaInicial)
  const [brief, setBrief] = useState<Marca | null>(null)
  const [preenchendo, setPreenchendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const proprias = contas.filter((c) => c.papel === 'proprio')

  useEffect(() => { ia.marca().then(setBrief) }, [])
  if (!brief) return null
  const atual = ETAPAS[etapa]

  const salvar = async () => { await ia.salvarMarca(brief) }
  const avancar = async () => {
    if (atual.campos.length) await salvar().catch(() => {})
    setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1))
  }
  const preencherComIA = async () => {
    setPreenchendo(true)
    try {
      const r = await ia.rascunharBrief(brief.site || undefined)
      const novo = { ...brief }
      Object.entries(r).forEach(([k, v]) => { if (v && !brief[k]?.trim()) novo[k] = v })
      setBrief(novo)
      toast.success('A IA preencheu os campos vazios', { description: 'Revise cada etapa. O que ela deduziu vem marcado com "(sugestão — confirme)".' })
    } catch (e) {
      toast.danger('Não deu para preencher', { description: (e as Error).message })
    } finally { setPreenchendo(false) }
  }
  const concluir = async (gerar: boolean) => {
    setSalvando(true)
    await salvar()
    setSalvando(false)
    aoConcluir(gerar)
  }

  return (
    <div className="cartao overflow-hidden">
      {/* progresso */}
      <div className="flex gap-1 px-6 pt-6">
        {ETAPAS.map((e, i) => (
          <button key={e.id} onClick={() => setEtapa(i)} aria-label={`Ir para ${e.titulo}`} className="group flex-1 text-left outline-none">
            <span className={`block h-1 rounded-full transition-colors ${i <= etapa ? 'botao-sinal' : 'bg-surface-tertiary'}`} />
            <span className={`mt-2 hidden text-xs sm:block ${i === etapa ? 'font-medium text-foreground' : 'text-muted group-hover:text-foreground'}`}>{e.titulo}</span>
          </button>
        ))}
      </div>

      <div key={atual.id} className="surgir px-6 pt-8 pb-6 sm:px-10">
        <p className="num text-xs text-muted">Etapa {etapa + 1} de {ETAPAS.length}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h2 className="titulo-display text-3xl font-semibold">{atual.pergunta}</h2>
          {atual.id === 'negocio' && (
            <Button variant="tertiary" isPending={preenchendo} onPress={preencherComIA}>
              <Sparkles /> {preenchendo ? 'Lendo seus perfis e o site…' : 'Preencher com IA'}
            </Button>
          )}
        </div>

        <div className="mt-6">
          {atual.id === 'perfil' && (
            <EtapaPerfil proprias={proprias} setContas={setContas} downloads={downloads} tarefasIA={tarefasIA}
              relatoriosProprios={relatoriosProprios} aoColetar={aoColetar} />
          )}
          {atual.campos.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2">
              {atual.campos.map((c) => (
                <CampoBrief key={c.k} campo={c} valor={brief[c.k] ?? ''} aoMudar={(v) => setBrief({ ...brief, [c.k]: v })} />
              ))}
            </div>
          )}
          {atual.id === 'revisao' && <Revisao brief={brief} irPara={setEtapa} />}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-6 py-4 linha-fina sm:px-10">
        <Button variant="ghost" isDisabled={etapa === 0} onPress={() => setEtapa((e) => e - 1)}><ArrowLeft /> Voltar</Button>
        {atual.id === 'revisao' ? (
          <div className="flex gap-2">
            <Button variant="tertiary" isPending={salvando} onPress={() => concluir(false)}>Salvar</Button>
            <Button className="botao-sinal" isPending={salvando} onPress={() => concluir(true)}><Sparkles /> Salvar e gerar minha estratégia</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {atual.id === 'perfil' && !proprias.length && <span className="hidden text-xs text-muted sm:inline">Dá para pular e voltar depois</span>}
            <Button className="botao-sinal" onPress={avancar}>Continuar <ArrowRight /></Button>
          </div>
        )}
      </div>
    </div>
  )
}

function CampoBrief({ campo, valor, aoMudar }: { campo: Campo; valor: string; aoMudar: (v: string) => void }) {
  const marcados = campo.multiplo ? valor.split(',').map((x) => x.trim()).filter(Boolean) : []
  const alternar = (a: string) => {
    if (!campo.multiplo) return aoMudar(a)
    const novo = marcados.includes(a) ? marcados.filter((x) => x !== a) : [...marcados, a].slice(-3)
    aoMudar(novo.join(', '))
  }
  return (
    <div className={campo.longo || campo.atalhos ? 'md:col-span-2' : ''}>
      <TextField value={valor} onChange={aoMudar}>
        <Label>{campo.rotulo}</Label>
        {campo.atalhos && (
          <div className="my-2 flex flex-wrap gap-1.5">
            {campo.atalhos.map((a) => {
              const ativo = campo.multiplo ? marcados.includes(a) : valor === a
              return (
                <button key={a} type="button" onClick={() => alternar(a)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${ativo ? 'border-accent bg-accent/15 text-foreground' : 'linha-fina text-muted hover:text-foreground'}`}>
                  {ativo && <Check className="mr-1 inline size-3" />}{a}
                </button>
              )
            })}
          </div>
        )}
        {campo.longo ? <TextArea placeholder={campo.dica} className="min-h-24" /> : <Input placeholder={campo.dica} />}
      </TextField>
    </div>
  )
}

function EtapaPerfil({ proprias, setContas, downloads, tarefasIA, relatoriosProprios, aoColetar }: {
  proprias: Conta[]; setContas: (c: Conta[]) => void; downloads: Tarefa[]; tarefasIA: TarefaIA[]
  relatoriosProprios: Set<string>; aoColetar: () => void
}) {
  const [novo, setNovo] = useState('')
  const [plat, setPlat] = useState<Plataforma>('instagram')
  const [ocupado, setOcupado] = useState(false)

  const conectar = async () => {
    if (!novo.trim()) return
    setOcupado(true)
    try {
      const lista = await api.adicionarConta(novo.trim(), plat, 'proprio')
      setContas(lista)
      const c = lista.find((x) => x.papel === 'proprio' && (novo.includes(x.conta) || x.conta === novo.trim().replace(/^@/, '')))
        ?? lista.filter((x) => x.papel === 'proprio').at(-1)
      if (c) {
        await api.baixar([c], { modo: 'todos', somente_reels: false, analisar_ao_fim: true })
        aoColetar()
      }
      setNovo('')
      toast.success('Perfil conectado', { description: 'A coleta e a análise começaram. Você pode seguir para as próximas etapas.' })
    } catch (e) {
      toast.danger('Não deu para conectar', { description: (e as Error).message })
    } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-muted">
        Conecte o seu Instagram ou TikTok. A gente coleta seus posts, lê os comentários e a IA analisa o seu perfil
        com o mesmo olhar que usa nos concorrentes. Isso roda sozinho enquanto você responde as próximas etapas.
      </p>
      {proprias.map((c) => (
        <Bloco key={`${c.plataforma}/${c.conta}`}>
          <div className="mb-4 flex items-center gap-3">
            <AvatarConta conta={c} />
            <div className="min-w-0">
              <p className="truncate font-medium">{c.perfil?.nome || c.nome}</p>
              <p className="truncate text-sm text-muted">@{c.conta}</p>
            </div>
          </div>
          <Pipeline conta={c} downloads={downloads} tarefasIA={tarefasIA} temRelatorio={relatoriosProprios.has(`${c.plataforma}/${c.conta}`)} />
        </Bloco>
      ))}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); conectar() }}>
        <Input aria-label="Seu @" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="@seuperfil ou link do perfil" className="min-w-60 flex-1" />
        <ToggleButtonGroup selectionMode="single" disallowEmptySelection selectedKeys={[plat]}
          onSelectionChange={(k) => setPlat([...k][0] as Plataforma)} aria-label="Plataforma">
          <ToggleButton id="instagram">Instagram</ToggleButton>
          <ToggleButton id="tiktok"><ToggleButtonGroup.Separator />TikTok</ToggleButton>
        </ToggleButtonGroup>
        <Button type="submit" className={proprias.length ? '' : 'botao-sinal'} variant={proprias.length ? 'tertiary' : undefined}
          isPending={ocupado} isDisabled={!novo.trim()}>
          <Plus /> {proprias.length ? 'Conectar outro' : 'Conectar e analisar'}
        </Button>
      </form>
    </div>
  )
}

function Revisao({ brief, irPara }: { brief: Marca; irPara: (n: number) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ETAPAS.filter((e) => e.campos.length).map((e) => {
        const idx = ETAPAS.indexOf(e)
        const preenchidos = e.campos.filter((c) => brief[c.k]?.trim())
        return (
          <Bloco key={e.id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">{e.titulo}</p>
              <button onClick={() => irPara(idx)} className="text-sm text-accent hover:underline">Editar</button>
            </div>
            {preenchidos.length === 0 ? <p className="text-sm text-muted">Nada preenchido ainda.</p> : (
              <dl className="space-y-1.5 text-sm">
                {preenchidos.map((c) => (
                  <div key={c.k}><dt className="text-xs text-muted">{c.rotulo}</dt><dd className="line-clamp-2 leading-relaxed">{brief[c.k]}</dd></div>
                ))}
              </dl>
            )}
          </Bloco>
        )
      })}
    </div>
  )
}

function Bloco({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface-secondary/70 p-4">{children}</div>
}
