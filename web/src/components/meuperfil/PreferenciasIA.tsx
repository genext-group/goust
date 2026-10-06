import { Button, Input } from '@heroui/react'
import { CirclePlus, Sparkles, TrashBin } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { ia, type Regra, type StatusIA } from '../../api'
import { tocar } from '../../sons'
import { useConfirmar } from '../ui/Confirmar'

const SUGESTOES = ['Sempre traga exemplos de roteiro', 'Fale sem jargão de marketing', 'Priorize ideias fáceis de gravar com celular', 'Foque em vender, não em seguidores']

/**
 * Como a IA trabalha para você: orientações que entram em todas as análises e criações.
 * Algumas você escreve; outras a IA aprende sozinha com os seus 👍/👎 (sem botão, sem jargão).
 */
export function PreferenciasIA() {
  const { confirmacao, confirmar } = useConfirmar()
  const [status, setStatus] = useState<StatusIA | null>(null)
  const [regras, setRegras] = useState<Regra[]>([])
  const [nova, setNova] = useState('')
  useEffect(() => { ia.status().then((s) => { setStatus(s); setRegras(s.aprendizados.regras) }).catch(() => {}) }, [])

  const salvar = async (lista: Regra[]) => { setRegras(lista); await ia.salvarRegras(lista) }
  const adicionar = (texto: string) => {
    const t = texto.trim()
    if (!t || regras.some((r) => r.texto.toLowerCase() === t.toLowerCase())) return
    tocar('bolha'); salvar([...regras, { texto: t, origem: 'manual' }]); setNova('')
  }
  const aprendidas = regras.filter((r) => r.origem !== 'manual').length
  const sugestoes = SUGESTOES.filter((s) => !regras.some((r) => r.texto.toLowerCase() === s.toLowerCase())).slice(0, 3)

  return (
    <section className="cartao p-5 sm:p-6">
      {confirmacao}
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <h2 className="titulo-display text-lg font-semibold">Preferências da IA</h2>
      </div>
      <p className="mb-4 text-sm text-muted">
        Orientações que a IA segue em todas as análises e criações.
        {status && (aprendidas
          ? ` ${aprendidas} ${aprendidas === 1 ? 'veio' : 'vieram'} dos seus 👍/👎.`
          : ' Ela também aprende sozinha com os 👍/👎 que você dá nos insights.')}
      </p>
      <ul className="space-y-2">
        {regras.map((r, i) => (
          <li key={r.id ?? i} className="group flex items-start gap-3 rounded-2xl bg-surface-secondary/60 px-3.5 py-2.5">
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.origem === 'manual' ? 'bg-accent/15 text-accent' : 'bg-[var(--menta)]/15 text-[var(--menta)]'}`}>
              {r.origem === 'manual' ? 'você' : 'aprendida'}
            </span>
            <p className="flex-1 text-sm leading-relaxed">{r.texto}</p>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Apagar orientação" className="opacity-0 group-hover:opacity-100 max-sm:opacity-100"
              onPress={async () => { if (await confirmar({ titulo: 'Apagar esta orientação?', texto: 'A IA deixa de seguir isso nas próximas análises e criações.', confirmar: 'Apagar' })) salvar(regras.filter((_, k) => k !== i)) }}>
              <TrashBin className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionar(nova) }}>
        <Input aria-label="Nova orientação" value={nova} onChange={(e) => setNova(e.target.value)} className="flex-1"
          placeholder="Escreva uma orientação. Ex.: nada de dancinha" />
        <Button type="submit" isIconOnly variant="tertiary" aria-label="Adicionar orientação" isDisabled={!nova.trim()}><CirclePlus /></Button>
      </form>
      {sugestoes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button key={s} onClick={() => adicionar(s)} className="rounded-full px-2.5 py-1 text-xs text-muted ring-1 ring-[var(--border)] transition-colors hover:text-foreground">+ {s}</button>
          ))}
        </div>
      )}
    </section>
  )
}
