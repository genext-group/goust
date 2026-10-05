import { Button, Input, Spinner, Tabs, Toast } from '@heroui/react'
import { Moon, Sparkles, Sun } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Ambiente, type Conta, type Tarefa } from './api'
import { AmbienteContexto } from './ambiente'
import { StatusInstagram } from './components/StatusInstagram'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaContas } from './telas/Contas'
import { TelaDownloads, ativa } from './telas/Downloads'
import { TelaInteligencia } from './telas/Inteligencia'

type Aba = 'contas' | 'biblioteca' | 'inteligencia' | 'downloads'

/** Verifica o ambiente (local/online) e pede a senha quando o app está protegido. */
export default function App() {
  const [amb, setAmb] = useState<Ambiente | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => api.ambiente().then(setAmb).catch(() => setErro('Não foi possível falar com o servidor.')), [])
  useEffect(() => {
    carregar()
    const pedir = () => setAmb((a) => (a ? { ...a, logado: false } : a))
    window.addEventListener('precisa-login', pedir)
    return () => window.removeEventListener('precisa-login', pedir)
  }, [carregar])

  if (!amb) return <div className="grid min-h-screen place-items-center text-muted">{erro || <Spinner />}</div>
  if (amb.precisa_login && !amb.logado) return <Login aoEntrar={carregar} />
  return (
    <AmbienteContexto.Provider value={{ nuvem: amb.nuvem }}>
      <Painel nuvem={amb.nuvem} />
    </AmbienteContexto.Provider>
  )
}

function Login({ aoEntrar }: { aoEntrar: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const entrar = async () => {
    setOcupado(true)
    setErro('')
    try {
      await api.login(senha)
      aoEntrar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form className="cartao surgir w-full max-w-sm space-y-5 p-8 text-center" onSubmit={(e) => { e.preventDefault(); entrar() }}>
        <img src="/favicon.svg" alt="" className="mx-auto size-12" />
        <div>
          <h1 className="titulo-display text-2xl font-semibold">Referências</h1>
          <p className="mt-1 text-sm text-muted">Digite a senha de acesso.</p>
        </div>
        <Input aria-label="Senha" type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha" className="w-full" />
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <Button type="submit" fullWidth isPending={ocupado} isDisabled={!senha}>Entrar</Button>
      </form>
    </div>
  )
}

function Painel({ nuvem }: { nuvem: boolean }) {
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
