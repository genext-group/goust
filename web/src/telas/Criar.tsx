import { useState } from 'react'
import type { Conta } from '../api'
import { Caderno } from '../components/criar/Caderno'
import { Calendario } from '../components/criar/Calendario'
import { Estilos } from '../components/criar/Estilos'
import { Imagens } from '../components/criar/Imagens'

type Visao = 'calendario' | 'caderno' | 'imagens' | 'estilos'
export interface PedidoImagem { pedido: string; conteudo_id?: number | null; estilo_id?: number | null; formato?: string }

const VISOES: { id: Visao; nome: string; texto: string }[] = [
  { id: 'calendario', nome: 'Calendário', texto: 'O que publicar e quando, com roteiro pronto para gravar.' },
  { id: 'caderno', nome: 'Caderno de ideias', texto: 'Anote o que aparecer no dia a dia. A IA organiza e transforma em conteúdo.' },
  { id: 'imagens', nome: 'Imagens', texto: 'Capas, posts e carrosséis gerados com GPT Image no seu estilo.' },
  { id: 'estilos', nome: 'Estilos visuais', texto: 'As referências que ensinam a IA a desenhar do seu jeito.' },
]

export function TelaCriar({ contas, versaoBiblioteca }: { contas: Conta[]; versaoBiblioteca: number }) {
  const [visao, setVisao] = useState<Visao>('calendario')
  const [pedido, setPedido] = useState<PedidoImagem | null>(null)
  const atual = VISOES.find((v) => v.id === visao)!

  const gerarImagem = (p: PedidoImagem) => { setPedido(p); setVisao('imagens') }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-display text-4xl font-semibold">Criar</h1>
          <p className="mt-1 text-muted">{atual.texto}</p>
        </div>
        <div className="flex rounded-full bg-surface-secondary/70 p-1" role="tablist">
          {VISOES.map((v) => (
            <button key={v.id} role="tab" aria-selected={visao === v.id} onClick={() => setVisao(v.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${visao === v.id ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>
              {v.nome}
            </button>
          ))}
        </div>
      </div>
      <div key={visao} className="troca-pagina">
        {visao === 'calendario' && <Calendario aoGerarImagem={gerarImagem} />}
        {visao === 'caderno' && <Caderno aoIrCalendario={() => setVisao('calendario')} />}
        {visao === 'imagens' && <Imagens pedidoInicial={pedido} aoConsumirPedido={() => setPedido(null)} irParaEstilos={() => setVisao('estilos')} />}
        {visao === 'estilos' && <Estilos contas={contas} versaoBiblioteca={versaoBiblioteca} aoGerar={(estilo_id) => gerarImagem({ pedido: '', estilo_id })} />}
      </div>
    </div>
  )
}
