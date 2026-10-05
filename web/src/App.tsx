import { Button, Tabs, Toast } from '@heroui/react'
import { Moon, Sparkles, Sun } from '@gravity-ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Conta, type Tarefa } from './api'
import { StatusInstagram } from './components/StatusInstagram'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaContas } from './telas/Contas'
import { TelaDownloads, ativa } from './telas/Downloads'
import { TelaInteligencia } from './telas/Inteligencia'

type Aba = 'contas' | 'biblioteca' | 'inteligencia' | 'downloads'

export default function App() {
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
    const t = setInterval(carregarTarefas, 1500)
    return () => clearInterval(t)
  }, [carregarContas, carregarTarefas])

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
