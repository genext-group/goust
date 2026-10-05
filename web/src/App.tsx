import { Button, Spinner, Toast } from '@heroui/react'
import { House, Moon, Person, Persons, Picture, Sparkles, Sun, Thunderbolt } from '@gravity-ui/icons'
import { ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, definirObtencaoToken, type Ambiente, type Conta, type Tarefa } from './api'
import { AmbienteContexto } from './ambiente'
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

  if (!amb) return <div className="grid min-h-screen place-items-center text-muted">{erro || <Spinner />}</div>
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
          <img src="/favicon.svg" alt="" className="mx-auto size-12" />
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

  const itens: { id: Aba; nome: string; icone: ReactNode; extra?: ReactNode }[] = [
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
  const irPara = (a: Aba) => { setAba(a); window.scrollTo({ top: 0 }) }
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

  const navegacao = (compacta: boolean) => (
    <nav aria-label="Seções" className={compacta ? 'flex gap-1 overflow-x-auto' : 'space-y-0.5'}>
      {itens.map((it) => {
        const ativo = aba === it.id
        return (
          <button key={it.id} onClick={() => irPara(it.id)} aria-current={ativo ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-xl text-sm font-medium transition-colors outline-none ${compacta ? 'shrink-0 px-3 py-2' : 'w-full px-3 py-2.5'} ${
              ativo ? 'bg-surface-secondary text-foreground shadow-sm' : 'text-muted hover:bg-surface-secondary/60 hover:text-foreground'}`}>
            <span className={`[&_svg]:size-4 ${ativo ? 'text-accent' : ''}`}>{it.icone}</span>
            <span className="flex-1 text-left whitespace-nowrap">{it.nome}</span>
            {it.extra}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="ambiente min-h-screen overflow-x-clip">
      <Toast.Provider placement="top end" />

      {/* barra lateral (desktop) */}
      <aside className="vidro fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r linha-fina lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-8">
          <span className="grid size-8 place-items-center rounded-xl botao-sinal"><Sparkles className="size-4" /></span>
          <span className="titulo-display text-lg font-semibold">Referências</span>
        </div>
        <div className="flex-1 px-3">{navegacao(false)}</div>
        <div className="flex items-center gap-2 border-t px-4 py-4 linha-fina">
          {clerk ? <UserButton showName appearance={{ elements: { userButtonBox: { flexDirection: 'row-reverse', color: 'var(--foreground)' } } }} /> : <span className="text-sm text-muted">Modo local</span>}
          <Button isIconOnly size="sm" variant="ghost" className="ml-auto" aria-label="Alternar tema" onPress={() => setEscuro((e) => !e)}>
            {escuro ? <Sun /> : <Moon />}
          </Button>
        </div>
      </aside>

      {/* topo (celular e tablet) */}
      <header className="vidro sticky top-0 z-40 border-b linha-fina lg:hidden">
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="grid size-7 place-items-center rounded-lg botao-sinal"><Sparkles className="size-3.5" /></span>
          <span className="titulo-display font-semibold">Referências</span>
          <div className="ml-auto flex items-center gap-1">
            {clerk && <UserButton />}
            <Button isIconOnly size="sm" variant="ghost" aria-label="Alternar tema" onPress={() => setEscuro((e) => !e)}>
              {escuro ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
        <div className="px-2 py-2">{navegacao(true)}</div>
      </header>

      <main className="min-w-0 lg:pl-64">
        <div key={aba} className="surgir mx-auto w-full min-w-0 max-w-6xl px-4 pt-8 pb-16 sm:px-8">{tela}</div>
      </main>
    </div>
  )
}
