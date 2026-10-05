import { Button } from '@heroui/react'
import { ArrowRight } from '@gravity-ui/icons'
import { CheckDesenhado, Radar } from '../components/Animacoes'
import { useEffect, useState, type CSSProperties } from 'react'
import { ia, type Conta, type Marca, type ResumoRelatorio, type Tarefa } from '../api'
import { aura, auraMarca } from '../aura'
import { AvatarConta } from '../components/Avatar'
import { fmtNum, fmtRelativo } from '../formato'

type Aba = 'inicio' | 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'downloads'

interface Props {
  contas: Conta[]
  tarefas: Tarefa[]
  irPara: (a: Aba) => void
}

export function TelaInicio({ contas, tarefas, irPara }: Props) {
  const [relatorios, setRelatorios] = useState<Record<string, ResumoRelatorio> | null>(null)
  const [marca, setMarca] = useState<Marca | null>(null)
  const [temEstrategia, setTemEstrategia] = useState(false)
  const [nome, setNome] = useState<string>('')

  useEffect(() => {
    ia.relatorios().then(setRelatorios).catch(() => setRelatorios({}))
    ia.marca().then(setMarca).catch(() => {})
    ia.estrategia().then((e) => setTemEstrategia(!!e.estrategia)).catch(() => {})
  }, [])
  useEffect(() => { setNome(marca?.nome || '') }, [marca])

  const proprias = contas.filter((c) => c.papel === 'proprio')
  const concorrentes = contas.filter((c) => c.papel !== 'proprio')
  const analisados = concorrentes.filter((c) => relatorios?.[`${c.plataforma}/${c.conta}`]).length
  const camposBrief = marca ? Object.values(marca).filter((v) => v?.trim()).length : 0
  const posts = contas.reduce((s, c) => s + (c.videos || 0), 0)
  const ativas = tarefas.filter((t) => ['na fila', 'listando', 'baixando', 'comentários'].includes(t.status)).length

  const passos: { titulo: string; texto: string; feito: boolean; ir: Aba; acao: string }[] = [
    { titulo: 'Conecte seu perfil', texto: 'A IA analisa o seu perfil com o mesmo motor dos concorrentes.', feito: proprias.length > 0, ir: 'meuperfil', acao: 'Conectar' },
    { titulo: 'Conte sobre você', texto: 'Negócio, público e metas: o contexto de toda recomendação.', feito: camposBrief >= 6, ir: 'meuperfil', acao: 'Preencher brief' },
    { titulo: 'Escolha seus concorrentes', texto: 'Quem você quer acompanhar de perto.', feito: concorrentes.length >= 3, ir: 'contas', acao: 'Adicionar' },
    { titulo: 'Analise o mercado', texto: 'Posicionamento, ganchos, comentários e o que performa.', feito: analisados > 0, ir: 'inteligencia', acao: 'Analisar' },
    { titulo: 'Gere sua estratégia', texto: 'Diagnóstico, pilares, metas e as primeiras ideias.', feito: temEstrategia, ir: 'meuperfil', acao: 'Gerar' },
  ]
  const proximo = passos.findIndex((p) => !p.feito)
  const feitos = passos.filter((p) => p.feito).length
  const recentes = Object.entries(relatorios ?? {}).sort((a, b) => b[1].gerado.localeCompare(a[1].gerado)).slice(0, 4)
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="space-y-6">
      {/* faixa de abertura */}
      <section className="aura overflow-hidden rounded-[1.75rem] px-7 py-9 text-white sm:px-10 sm:py-12" style={auraMarca}>
        <p className="text-sm text-white/70">{saudacao}{nome ? `, ${nome}` : ''}</p>
        <h1 className="titulo-display mt-2 max-w-2xl text-4xl leading-[1.05] font-semibold sm:text-5xl">
          {proximo === -1 ? 'Tudo pronto. Hora de criar.' : 'Vamos descobrir o que funciona no seu mercado.'}
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {proximo !== -1 && (
            <Button className="bg-white font-semibold text-black" onPress={() => irPara(passos[proximo].ir)}>
              {passos[proximo].acao} <ArrowRight />
            </Button>
          )}
          <span className="num text-sm text-white/70">{feitos} de {passos.length} etapas concluídas</span>
        </div>
      </section>

      {/* jornada */}
      <section className="cartao p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="titulo-display text-lg font-semibold">Sua jornada</h2>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-secondary">
            <div className="h-full rounded-full botao-sinal transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
          </div>
        </div>
        <ol className="cascata grid gap-2 md:grid-cols-5">
          {passos.map((p, i) => {
            const atual = i === proximo
            return (
              <li key={p.titulo} style={{ '--i': i } as CSSProperties}>
                <button onClick={() => irPara(p.ir)}
                  className={`flex h-full w-full flex-col gap-2 rounded-2xl p-4 text-left transition-all outline-none hover:-translate-y-0.5 ${
                    atual ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-surface-secondary/70 hover:bg-surface-secondary'}`}>
                  <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                    p.feito ? 'bg-[var(--menta)] text-black' : atual ? 'botao-sinal' : 'bg-surface-tertiary text-muted'}`}>
                    {p.feito ? <CheckDesenhado tamanho={14} /> : <span className="num">{i + 1}</span>}
                  </span>
                  <span className="font-medium leading-snug">{p.titulo}</span>
                  <span className="text-xs leading-relaxed text-muted">{p.texto}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {/* números */}
      <section className="cascata grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Concorrentes', fmtNum(concorrentes.length), 'contas' as Aba],
          ['Posts catalogados', fmtNum(posts), 'biblioteca' as Aba],
          ['Análises de IA', fmtNum(Object.keys(relatorios ?? {}).length), 'inteligencia' as Aba],
          ['Em andamento', fmtNum(ativas), 'downloads' as Aba],
        ].map(([rotulo, valor, ir], i) => (
          <button key={rotulo as string} style={{ '--i': i + 5 } as CSSProperties} onClick={() => irPara(ir as Aba)} className="cartao p-5 text-left transition-transform hover:-translate-y-0.5">
            <p className="text-xs text-muted">{rotulo}</p>
            <p className="num titulo-display mt-1 text-3xl font-semibold">{valor}</p>
          </button>
        ))}
      </section>

      {/* análises recentes */}
      <section className="cartao p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="titulo-display text-lg font-semibold">Últimas análises</h2>
          <Button size="sm" variant="ghost" onPress={() => irPara('inteligencia')}>Ver todas <ArrowRight /></Button>
        </div>
        {recentes.length === 0 ? (
          <div className="rounded-2xl bg-surface-secondary/70 p-6 text-center text-sm text-muted">
            <div className="mx-auto w-fit text-foreground"><Radar tamanho={90} /></div>
            Nenhuma análise ainda. Comece analisando um concorrente na aba Inteligência.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentes.map(([chave, r]) => {
              const c = contas.find((x) => `${x.plataforma}/${x.conta}` === chave)
              const notas = r.notas
              const media = (notas.consistencia + notas.ganchos + notas.clareza_da_mensagem + notas.producao + notas.engajamento) / 5
              return (
                <button key={chave} onClick={() => irPara('inteligencia')}
                  className="flex gap-4 rounded-2xl bg-surface-secondary/70 p-4 text-left transition-colors hover:bg-surface-secondary">
                  <div className="aura grid size-14 shrink-0 place-items-center rounded-2xl" style={aura(chave)}>
                    {c && <AvatarConta conta={c} tamanho="sm" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-medium">{c?.perfil?.nome || c?.nome || chave}</p>
                      <span className="num shrink-0 text-sm font-semibold texto-sinal">{media.toFixed(1)}</span>
                    </div>
                    <p className="text-xs text-muted">{c?.papel === 'proprio' ? 'Seu perfil' : 'Concorrente'} · analisado {fmtRelativo(r.gerado)}</p>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{r.resumo}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
