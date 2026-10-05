import { Button, Spinner, Tabs, Toast } from '@heroui/react'
import { Moon, Sparkles, Sun } from '@gravity-ui/icons'
import { ClerkProvider, Show, SignIn, UserButton, useAuth } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, definirObtencaoToken, type Ambiente, type Conta, type Tarefa } from './api'
import { AmbienteContexto } from './ambiente'
import { StatusInstagram } from './components/StatusInstagram'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaContas } from './telas/Contas'
import { TelaDownloads, ativa } from './telas/Downloads'
import { TelaInteligencia } from './telas/Inteligencia'
import { TelaMeuPerfil } from './telas/MeuPerfil'

type Aba = 'contas' | 'meuperfil' | 'biblioteca' | 'inteligencia' | 'downloads'

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
  const [aba, setAba] = useState<Aba>('contas')
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

  return (
    <div className="min-h-screen overflow-x-clip">
      <Toast.Provider placement="top" />
      <Tabs className="block w-full min-w-0" selectedKey={aba} onSelectionChange={(k) => setAba(k as Aba)}>
        <header className="vidro sticky top-0 z-40 border-b linha-fina">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0 sm:px-6">
            <div className="flex items-center gap-2 font-semibold">
              <img src="/favicon.svg" alt="" className="size-6" />
              <span>Referências</span>
            </div>
            <Tabs.ListContainer className="order-last w-full sm:order-none sm:mx-auto sm:w-auto">
              <Tabs.List aria-label="Seções">
                <Tabs.Tab id="contas">
                  Contas
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="meuperfil">
                  Meu perfil
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="biblioteca">
                  Biblioteca
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="inteligencia">
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-3.5 text-accent" />
                    Inteligência
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="downloads">
                  <span className="flex items-center gap-1.5">
                    Downloads
                    {emAndamento > 0 && (
                      <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                        {emAndamento}
                      </span>
                    )}
                  </span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <div className="ml-auto flex items-center gap-1 sm:ml-0">
              <StatusInstagram />
              {clerk && <div className="ml-1 grid place-items-center"><UserButton /></div>}
              <Button isIconOnly size="sm" variant="ghost" aria-label="Alternar tema" onPress={() => setEscuro((e) => !e)}>
                {escuro ? <Sun /> : <Moon />}
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 pt-8 sm:px-6">
          <Tabs.Panel id="contas">
            <TelaContas contas={contas} setContas={setContas} aoBaixar={() => (carregarTarefas(), setAba('downloads'))} />
          </Tabs.Panel>
          <Tabs.Panel id="meuperfil">
            <TelaMeuPerfil contas={contas} setContas={setContas} versaoBiblioteca={versaoBiblioteca}
              aoBaixar={() => (carregarTarefas(), setAba('downloads'))} />
          </Tabs.Panel>
          <Tabs.Panel id="biblioteca">
            <TelaBiblioteca contas={contas} versao={versaoBiblioteca} />
          </Tabs.Panel>
          <Tabs.Panel id="inteligencia">
            <TelaInteligencia contas={contas} versaoBiblioteca={versaoBiblioteca} />
          </Tabs.Panel>
          <Tabs.Panel id="downloads">
            <TelaDownloads tarefas={tarefas} aoMudar={carregarTarefas} />
          </Tabs.Panel>
        </main>
      </Tabs>
    </div>
  )
}
