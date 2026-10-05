import { Button, Toast } from '@heroui/react'
import { House, Moon, Person, Persons, Picture, Sparkles, Sun, Thunderbolt, Volume, VolumeXmark } from '@gravity-ui/icons'
import { ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { api, definirObtencaoToken, type Ambiente, type Conta, type Tarefa } from './api'
import { AmbienteContexto } from './ambiente'
import { LogoAnimado, TelaCarregando } from './components/Animacoes'
import { aoMudarSons, definirSons, instalarSonsDeClique, sonsLigados, tocar } from './sons'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaContas } from './telas/Contas'
import { TelaDownloads, ativa } from './telas/Downloads'
import { TelaInteligencia } from './telas/Inteligencia'
import { TelaMeuPerfil } from './telas/MeuPerfil'
import { TelaInicio } from './telas/Inicio'

type Aba = 'inicio' | 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'downloads'

/** Verifica o ambiente. Online: login pelo Clerk (cada criador vê só os próprios dados). Local: direto. */
export default function App() {
  const [amb, setAmb] = useState<Ambiente | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.ambiente().then(setAmb).catch(() => setErro('Não foi possível falar com o servidor.'))
  }, [])

  if (!amb) return erro ? <div className="grid min-h-screen place-items-center text-muted">{erro}</div> : <TelaCarregando texto="Abrindo o painel…" />
  const painel = (
    <AmbienteContexto.Provider value={{ nuvem: amb.nuvem }}>
      <Painel nuvem={amb.nuvem} clerk={!!amb.clerk} />
    </AmbienteContexto.Provider>
  )
  if (!amb.clerk) return painel
  return (
    <ClerkProvider publishableKey={amb.clerk} localization={ptBR} appearance={{ variables: { colorPrimary: '#0071e3', borderRadius: '0.875rem' } }}>
      <Show when="signed-out">
        <TelaEntrar />
      </Show>
      <Show when="signed-in">
        <ComToken>{painel}</ComToken>
      </Show>
    </ClerkProvider>
  )
}

function TelaEntrar() {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="surgir flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="mx-auto w-fit"><LogoAnimado tamanho={48} /></div>
          <h1 className="titulo-display mt-3 text-3xl font-semibold">Referências</h1>
          <p className="mt-1 text-muted">Monitore concorrentes e crie conteúdo com IA.</p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  )
}

/** Entrega ao api.ts a forma de obter o token de sessão; só mostra o painel depois disso. */
function ComToken({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    definirObtencaoToken(() => getToken())
    setPronto(true)
    return () => definirObtencaoToken(null)
  }, [getToken])
  return pronto ? <>{children}</> : null
}

function Painel({ nuvem, clerk }: { nuvem: boolean; clerk: boolean }) {
  const [aba, setAba] = useState<Aba>('inicio')
  const [contas, setContas] = useState<Conta[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [versaoBiblioteca, setVersaoBiblioteca] = useState(0)
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains('dark'))
  const concluidasAntes = useRef<number | null>(null)
  const [som, setSom] = useState(sonsLigados)

  useEffect(() => aoMudarSons(setSom), [])
  useEffect(() => instalarSonsDeClique(), [])

  const carregarContas = useCallback(() => api.contas().then(setContas).catch(() => {}), [])
  const carregarTarefas = useCallback(() => api.tarefas().then(setTarefas).catch(() => {}), [])

  useEffect(() => {
    carregarContas()
    carregarTarefas()
    // online cada consulta custa um comando no Redis gratuito: consulta menos e só com a aba visível
    const t = setInterval(() => { if (!document.hidden) carregarTarefas() }, nuvem ? 4000 : 1500)
    return () => clearInterval(t)
  }, [carregarContas, carregarTarefas, nuvem])

  // quando um download termina, atualiza contadores e biblioteca
  const emAndamento = tarefas.filter(ativa).length
  const baixadosTotal = tarefas.reduce((s, t) => s + t.baixados, 0)
  useEffect(() => {
    if (concluidasAntes.current !== null && concluidasAntes.current !== baixadosTotal) {
      setVersaoBiblioteca((v) => v + 1)
      carregarContas()
    }
    concluidasAntes.current = baixadosTotal
  }, [baixadosTotal, carregarContas])

  useEffect(() => {
    const t = escuro ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', escuro)
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem('tema', t)
    } catch {
      /* armazenamento indisponível */
    }
  }, [escuro])

  const itens: ItemNav[] = [
    { id: 'inicio', nome: 'Início', icone: <House /> },
    { id: 'meuperfil', nome: 'Meu perfil', icone: <Person /> },
    { id: 'contas', nome: 'Concorrentes', icone: <Persons /> },
    { id: 'inteligencia', nome: 'Inteligência', icone: <Sparkles /> },
    { id: 'biblioteca', nome: 'Biblioteca', icone: <Picture /> },
    {
      id: 'downloads', nome: 'Atividade', icone: <Thunderbolt />,
      extra: emAndamento > 0 ? <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">{emAndamento}</span> : null,
    },
  ]
  const irPara = (a: Aba) => {
    if (a !== aba) tocar('navegar')
    setAba(a)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const aoBaixar = () => (carregarTarefas(), irPara('downloads'))

  const tela = {
    inicio: <TelaInicio contas={contas} tarefas={tarefas} irPara={irPara} />,
    meuperfil: <TelaMeuPerfil contas={contas} setContas={setContas} versaoBiblioteca={versaoBiblioteca} aoBaixar={aoBaixar}
      tarefasDownload={tarefas} recarregarTarefas={carregarTarefas} />,
    contas: <TelaContas contas={contas} setContas={setContas} aoBaixar={aoBaixar} />,
    inteligencia: <TelaInteligencia contas={contas} versaoBiblioteca={versaoBiblioteca} />,
    biblioteca: <TelaBiblioteca contas={contas} versao={versaoBiblioteca} />,
    downloads: <TelaDownloads tarefas={tarefas} aoMudar={carregarTarefas} />,
  }[aba]

  return (
    <div className="ambiente min-h-screen overflow-x-clip">
      <Toast.Provider placement="top end" />

      <header className="vidro sticky top-0 z-40 border-b linha-fina">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <button onClick={() => irPara('inicio')} className="flex shrink-0 items-center gap-2.5 outline-none" aria-label="Início">
            <LogoAnimado />
            <span className="titulo-display hidden text-lg font-semibold sm:inline">Referências</span>
          </button>
          <NavDeslizante itens={itens} aba={aba} irPara={irPara} className="mx-auto hidden md:flex" />
          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
            <Button isIconOnly size="sm" variant="ghost" aria-label={som ? 'Desligar sons' : 'Ligar sons'} data-sem-som
              onPress={() => definirSons(!som)}>
              {som ? <Volume /> : <VolumeXmark />}
            </Button>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Alternar tema" onPress={() => setEscuro((e) => !e)}>
              {escuro ? <Sun /> : <Moon />}
            </Button>
            {clerk && <UserButton />}
          </div>
        </div>
        <div className="overflow-x-auto px-2 pb-2 md:hidden">
          <NavDeslizante itens={itens} aba={aba} irPara={irPara} className="flex" />
        </div>
      </header>

      <main className="min-w-0">
        <div key={aba} className="troca-pagina mx-auto w-full min-w-0 max-w-6xl px-4 pt-8 pb-16 sm:px-8">{tela}</div>
      </main>
    </div>
  )
}

type ItemNav = { id: Aba; nome: string; icone: ReactNode; extra?: ReactNode }

/** Abas no topo com a "pílula" do item ativo deslizando até a aba escolhida. */
function NavDeslizante({ itens, aba, irPara, className = '' }: { itens: ItemNav[]; aba: Aba; irPara: (a: Aba) => void; className?: string }) {
  const caixa = useRef<HTMLElement>(null)
  const [pilula, setPilula] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const medir = () => {
      const el = caixa.current?.querySelector<HTMLElement>(`[data-aba="${aba}"]`)
      if (el) {
        setPilula({ x: el.offsetLeft, w: el.offsetWidth })
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (caixa.current) ro.observe(caixa.current)
    return () => ro.disconnect()
  }, [aba])

  return (
    <nav ref={caixa} aria-label="Seções" className={`relative items-center gap-0.5 rounded-full bg-surface-secondary/60 p-1 ${className}`}>
      {pilula && (
        <span aria-hidden className="absolute top-1 bottom-1 rounded-full bg-surface shadow-sm ring-1 ring-[var(--hairline)] transition-all duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
          style={{ left: pilula.x, width: pilula.w }} />
      )}
      {itens.map((it) => {
        const ativo = aba === it.id
        return (
          <button key={it.id} data-aba={it.id} onClick={() => irPara(it.id)} aria-current={ativo ? 'page' : undefined}
            className={`relative z-10 flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none ${
              ativo ? 'text-foreground' : 'text-muted hover:text-foreground'}`}>
            <span className={`transition-transform duration-300 [&_svg]:size-4 ${ativo ? 'scale-110 text-accent' : ''}`}>{it.icone}</span>
            {it.nome}
            {it.extra}
          </button>
        )
      })}
    </nav>
  )
}
