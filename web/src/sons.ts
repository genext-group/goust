/**
 * Efeitos sonoros da interface, sintetizados na hora com Web Audio (nenhum arquivo de áudio).
 * Volume baixo; o usuário liga/desliga no topo e a escolha fica salva no navegador.
 */
type Som = 'clique' | 'navegar' | 'sucesso' | 'erro' | 'aviso' | 'inicio'

let ctx: AudioContext | null = null
let ultimo = 0

function lerPreferencia() {
  try {
    const v = localStorage.getItem('sons')
    if (v !== null) return v === '1'
  } catch { /* sem armazenamento */ }
  return !matchMedia('(prefers-reduced-motion: reduce)').matches
}

let ligado = lerPreferencia()
const ouvintes = new Set<(v: boolean) => void>()

export const sonsLigados = () => ligado
export function definirSons(v: boolean) {
  ligado = v
  try { localStorage.setItem('sons', v ? '1' : '0') } catch { /* ignora */ }
  ouvintes.forEach((f) => f(v))
  if (v) tocar('clique')
}
export function aoMudarSons(f: (v: boolean) => void) {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

function audio() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Uma nota: frequência inicial→final, envelope curto. */
function nota(ac: AudioContext, inicio: number, f1: number, f2: number, dur: number, vol: number, tipo: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  const ganho = ac.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(f1, inicio)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), inicio + dur)
  ganho.gain.setValueAtTime(0.0001, inicio)
  ganho.gain.exponentialRampToValueAtTime(vol, inicio + 0.008)
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + dur)
  osc.connect(ganho).connect(ac.destination)
  osc.start(inicio)
  osc.stop(inicio + dur + 0.02)
}

export function tocar(som: Som) {
  if (!ligado) return
  const agora = performance.now()
  if (som === 'clique' && agora - ultimo < 40) return // evita "metralhadora" de cliques
  ultimo = agora
  try {
    const ac = audio()
    const t = ac.currentTime
    switch (som) {
      case 'clique':
        nota(ac, t, 1800, 1200, 0.045, 0.035, 'triangle')
        break
      case 'navegar':
        nota(ac, t, 420, 760, 0.12, 0.04, 'sine')
        break
      case 'sucesso':
        nota(ac, t, 660, 660, 0.18, 0.05, 'sine')
        nota(ac, t + 0.09, 990, 990, 0.26, 0.05, 'sine')
        break
      case 'aviso':
        nota(ac, t, 1320, 1320, 0.35, 0.04, 'sine')
        nota(ac, t + 0.12, 1760, 1760, 0.45, 0.03, 'sine')
        break
      case 'erro':
        nota(ac, t, 220, 140, 0.22, 0.06, 'triangle')
        break
      case 'inicio':
        nota(ac, t, 523, 523, 0.2, 0.035, 'sine')
        nota(ac, t + 0.08, 784, 784, 0.25, 0.035, 'sine')
        nota(ac, t + 0.16, 1046, 1046, 0.4, 0.03, 'sine')
        break
    }
  } catch { /* navegador sem áudio */ }
}

/** Clique sutil em qualquer botão, aba ou link da página. */
export function instalarSonsDeClique() {
  const h = (e: PointerEvent) => {
    const alvo = (e.target as HTMLElement | null)?.closest('button, [role="tab"], [role="radio"], [role="checkbox"], a, [role="switch"]')
    if (alvo && !alvo.hasAttribute('data-sem-som')) tocar('clique')
  }
  document.addEventListener('pointerdown', h, { capture: true })
  return () => document.removeEventListener('pointerdown', h, { capture: true })
}
