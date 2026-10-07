import { Button, Toast } from '@heroui/react'
import { House, MagicWand, Moon, Person, Persons, Picture, Shield, Sparkles, Sun, Volume, VolumeXmark } from '@gravity-ui/icons'
import { ClerkProvider, UserButton, useAuth } from '@clerk/react'
import { TelaEntrar, aparenciaClerk, localizacaoGoust } from './telas/Entrar'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, definirObtencaoToken, ia, inicio, type Ambiente, type Conta, type Eu, type Tarefa, type TarefaIA } from './api'
import { AtividadeContexto, CentralAtividade, processos, useSonsDosProcessos } from './components/Atividade'
import { BoasVindas } from './telas/BoasVindas'
import { TelaCriar } from './telas/Criar'
import { TelaAdmin } from './telas/Admin'
import { AmbienteContexto } from './ambiente'
import { LogoAnimado, TelaCarregando } from './components/Animacoes'
import { instalarFadeDeRolagem } from './rolagem'
import { aoMudarSons, definirSons, instalarSonsDeClique, sonsLigados, tocar } from './sons'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaContas } from './telas/Contas'
import { TelaDownloads } from './telas/Downloads'
import { TelaInteligencia } from './telas/Inteligencia'
import { TelaMeuPerfil } from './telas/MeuPerfil'
import { TelaInicio } from './telas/Inicio'

type Aba = 'inicio' | 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'criar' | 'downloads' | 'admin'

/** Verifica o ambiente. Online: login pelo Clerk (cada criador vê só os próprios dados). Local: direto. */
export default function App() {
  const [amb, setAmb] = useState<Ambiente | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.ambiente().then(setAmb).catch(() => setErro('Não foi possível falar com o servidor.'))
  }, [])

  if (!amb) return erro ? <div className="grid min-h-screen place-items-center text-muted">{erro}</div> : <TelaCarregando texto="Abrindo a Goust…" />
  const painel = (
    <AmbienteContexto.Provider value={{ nuvem: amb.nuvem }}>
      <Painel nuvem={amb.nuvem} clerk={!!amb.clerk} />
    </AmbienteContexto.Provider>
  )
  if (!amb.clerk) return painel
  return (
    <ClerkProvider publishableKey={amb.clerk} localization={localizacaoGoust} appearance={aparenciaClerk()}>
      <Portao painel={painel} />
    </ClerkProvider>
  )
}

/**
 * Entrada sem piscadas: enquanto o Clerk descobre a sessão, a mesma tela de carregamento continua (nada de o login
 * aparecer por um instante); depois do login/cadastro, limpa o "#/sign-up/..." do endereço e segue direto.
 */
function Portao({ painel }: { painel: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    if (isSignedIn && /^#\/?(sign-|factor|verify|sso|continue)/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search)
    }
  }, [isSignedIn])
  if (!isLoaded) return <TelaCarregando texto="Abrindo a Goust…" />
  return isSignedIn ? <ComToken>{painel}</ComToken> : <TelaEntrar />
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
  return pronto ? <>{children}</> : <TelaCarregando texto="Abrindo a Goust…" />
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
  useEffect(() => instalarFadeDeRolagem(), [])

  const carregarContas = useCallback(() => api.contas().then(setContas).catch(() => {}), [])
  const carregarTarefas = useCallback(() => api.tarefas().then(setTarefas).catch(() => {}), [])
  const [tarefasIA, setTarefasIA] = useState<TarefaIA[]>([])
  const carregarIA = useCallback(() => ia.tarefas().then(setTarefasIA).catch(() => {}), [])
  const recarregar = useCallback(() => { carregarTarefas(); carregarIA() }, [carregarTarefas, carregarIA])
  const [eu, setEu] = useState<Eu | null>(null)
  const [contasCarregadas, setContasCarregadas] = useState(false)

  useEffect(() => {
    api.contas().then(setContas).catch(() => {}).finally(() => setContasCarregadas(true))
    inicio.eu().then(setEu).catch(() => setEmBoasVindas((v) => v ?? false))
    recarregar()
    // consulta só com a aba visível; mais rápido quando há algo rodando
    const t = setInterval(() => { if (!document.hidden) recarregar() }, nuvem ? 3000 : 1500)
    return () => clearInterval(t)
  }, [recarregar, nuvem])

  // a primeira configuração aparece para quem chega sem nada e só some quando a pessoa termina
  // null = ainda decidindo (mostra o carregamento, e não o painel que trocaria de tela logo em seguida).
  // Quem parou no meio (atualizou a página, fechou a aba) volta para o mesmo passo.
  const [emBoasVindas, setEmBoasVindas] = useState<boolean | null>(null)
  const decidido = useRef(false)
  useEffect(() => {
    if (decidido.current || !contasCarregadas || eu === null) return
    decidido.current = true
    setEmBoasVindas(!eu.onboarding && (contas.length === 0 || eu.onboarding_passo != null))
  }, [contasCarregadas, eu, contas.length])

  useSonsDosProcessos(tarefas, tarefasIA)
  const lista = useMemo(() => processos(tarefas, tarefasIA, carregarTarefas), [tarefas, tarefasIA, carregarTarefas])

  // quando um download termina, atualiza contadores e biblioteca
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
    { id: 'criar', nome: 'Criar', icone: <MagicWand /> },
  ]
  const [filtroBiblioteca, setFiltroBiblioteca] = useState<{ conta: string; n: number } | null>(null)
  const irPara = (a: Aba, filtro?: string) => {
    if (a === 'biblioteca' && filtro) setFiltroBiblioteca({ conta: filtro, n: Date.now() })
    if (a !== aba) tocar('navegar')
    setAba(a)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const aoBaixar = () => recarregar() // o progresso aparece na central de atividade

  const tela = {
    inicio: <TelaInicio contas={contas} setContas={setContas} irPara={irPara} />,
    meuperfil: <TelaMeuPerfil contas={contas} setContas={setContas} versaoBiblioteca={versaoBiblioteca} aoBaixar={aoBaixar}
      tarefasDownload={tarefas} recarregarTarefas={carregarTarefas} />,
    contas: <TelaContas contas={contas} setContas={setContas} aoBaixar={aoBaixar} />,
    inteligencia: <TelaInteligencia contas={contas} versaoBiblioteca={versaoBiblioteca} />,
    biblioteca: <TelaBiblioteca contas={contas} versao={versaoBiblioteca} filtroConta={filtroBiblioteca} />,
    criar: <TelaCriar contas={contas} versaoBiblioteca={versaoBiblioteca} />,
    downloads: <TelaDownloads tarefas={tarefas} aoMudar={carregarTarefas} />,
    admin: <TelaAdmin />,
  }[aba]

  const contexto = { downloads: tarefas, ia: tarefasIA, recarregar }
  if (emBoasVindas === null) return <TelaCarregando texto="Abrindo a Goust…" />
  if (emBoasVindas) {
    return (
      <AtividadeContexto.Provider value={contexto}>
        <Toast.Provider placement="top end" />
        <BoasVindas contas={contas} setContas={setContas} passoInicial={eu?.onboarding_passo ?? 0}
          aoTerminar={() => { setEmBoasVindas(false); irPara('inicio') }} />
      </AtividadeContexto.Provider>
    )
  }

  return (
    <AtividadeContexto.Provider value={contexto}>
    <div className="ambiente min-h-screen overflow-x-clip">
      <Toast.Provider placement="top end" />
      <CentralAtividade lista={lista} irPara={(d, f) => irPara(d, f)} />

      <header className="vidro sticky top-0 z-40 border-b linha-fina">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <button onClick={() => irPara('inicio')} className="flex shrink-0 items-center gap-2.5 outline-none" aria-label="Início">
            <LogoAnimado />
            <span className="titulo-display hidden text-lg font-semibold tracking-tight sm:inline">Goust</span>
          </button>
          <NavDeslizante itens={itens} aba={aba} irPara={irPara} className="mx-auto hidden md:flex" />
          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
            {eu?.admin && (
              <Button isIconOnly size="sm" variant={aba === 'admin' ? 'secondary' : 'ghost'} aria-label="Painel de super-admin"
                className={aba === 'admin' ? 'text-[var(--ambar)]' : ''} onPress={() => irPara('admin')}>
                <Shield />
              </Button>
            )}
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
        <div data-rolavel="x" className="overflow-x-auto px-2 pb-2 md:hidden">
          <NavDeslizante itens={itens} aba={aba} irPara={irPara} className="flex" />
        </div>
      </header>

      <main className="min-w-0">
        <div key={aba} className={`troca-pagina mx-auto w-full min-w-0 px-4 pt-8 pb-28 sm:px-8 ${aba === 'criar' || aba === 'admin' ? 'max-w-[1480px]' : 'max-w-6xl'}`}>{tela}</div>
      </main>
    </div>
    </AtividadeContexto.Provider>
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
