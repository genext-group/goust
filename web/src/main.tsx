import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { toast } from '@heroui/react'
import { tocar } from './sons'

// cada notificação toca o som do seu tipo
const sons = { success: 'sucesso', danger: 'erro', warning: 'aviso', info: 'aviso' } as const
for (const tipo of Object.keys(sons) as (keyof typeof sons)[]) {
  const original = toast[tipo].bind(toast)
  toast[tipo] = ((mensagem, opcoes) => { tocar(sons[tipo]); return original(mensagem, opcoes) }) as typeof original
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
