/**
 * Efeitos sonoros da interface, sintetizados na hora com Web Audio (nenhum arquivo de áudio).
 * Cada processo tem sua assinatura: coleta (sopro + "pops" a cada post), comentários (bolhas),
 * análise da IA (brilho + "neurônios" a cada vídeo + carrilhão mágico no fim) e geração (subida + faíscas).
 * O usuário liga/desliga no topo; a escolha fica salva no navegador.
 */
export type Som =
  | 'clique' | 'navegar' | 'sucesso' | 'erro' | 'aviso' | 'inicio'
  | 'coleta' | 'post' | 'bolha' | 'coletaFim'
  | 'analise' | 'neuronio' | 'analiseFim'
  | 'geracao' | 'geracaoFim'
  | 'favorito' | 'pasta'
  | 'apagar' | 'cancelar'

let ctx: AudioContext | null = null
let mestre: GainNode | null = null
let eco: GainNode | null = null
let ultimoClique = 0
let ultimoProcesso = 0
let ultimoPost = 0

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

/** Contexto + barramento: mestre (volume geral) e um eco curto que dá o ar "mágico". */
function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    mestre = ctx.createGain()
    mestre.gain.value = 0.9
    const comp = ctx.createDynamicsCompressor()
    mestre.connect(comp).connect(ctx.destination)
    const atraso = ctx.createDelay(1)
    atraso.delayTime.value = 0.19
    const retorno = ctx.createGain()
    retorno.gain.value = 0.32
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 3800
    eco = ctx.createGain()
    eco.gain.value = 0.5
    eco.connect(atraso)
    atraso.connect(filtro).connect(retorno).connect(atraso)
    filtro.connect(mestre)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Nota { f1: number; f2?: number; dur: number; vol: number; tipo?: OscillatorType; ataque?: number; comEco?: boolean; detune?: number }

function nota(ac: AudioContext, t: number, n: Nota) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = n.tipo ?? 'sine'
  osc.detune.value = n.detune ?? 0
  osc.frequency.setValueAtTime(n.f1, t)
  if (n.f2 && n.f2 !== n.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, n.f2), t + n.dur)
  const ataque = n.ataque ?? 0.006
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(n.vol, t + ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
  osc.connect(g).connect(mestre!)
  if (n.comEco) g.connect(eco!)
  osc.start(t)
  osc.stop(t + n.dur + 0.05)
}

/** Ruído filtrado com varredura (sopro de "coleta"). */
function sopro(ac: AudioContext, t: number, de: number, ate: number, dur: number, vol: number) {
  const tam = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, tam, ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < tam; i++) d[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(de, t)
  bp.frequency.exponentialRampToValueAtTime(ate, t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g).connect(mestre!)
  src.start(t)
}

const PENTA = [659.25, 739.99, 880, 987.77, 1108.73, 1318.51, 1479.98, 1760, 1975.53]
const sorteio = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** progresso (0..1) muda o tom dos "pops" da coleta: o som sobe conforme a coleta avança. */
export function tocar(som: Som, progresso = 0) {
  if (!ligado) return
  const agora = performance.now()
  if (som === 'clique' && agora - ultimoClique < 40) return
  if (som === 'clique') ultimoClique = agora
  if (som === 'post' || som === 'neuronio' || som === 'bolha') {
    if (agora - ultimoPost < 110) return // muitos eventos juntos viram um só
    ultimoPost = agora
  }
  const processo = !['clique', 'navegar', 'sucesso', 'erro', 'aviso'].includes(som)
  if (processo) ultimoProcesso = agora
  // a notificação logo depois do som do processo não toca outro som por cima
  if ((som === 'sucesso' || som === 'aviso') && agora - ultimoProcesso < 900) return
  try {
    const ac = audio()
    const t = ac.currentTime + 0.01
    switch (som) {
      case 'clique':
        nota(ac, t, { f1: 1800, f2: 1200, dur: 0.045, vol: 0.03, tipo: 'triangle' })
        break
      case 'navegar':
        nota(ac, t, { f1: 420, f2: 760, dur: 0.12, vol: 0.035 })
        break
      case 'sucesso':
        nota(ac, t, { f1: 660, dur: 0.18, vol: 0.045 })
        nota(ac, t + 0.09, { f1: 990, dur: 0.28, vol: 0.045, comEco: true })
        break
      case 'aviso':
        nota(ac, t, { f1: 1320, dur: 0.35, vol: 0.035 })
        nota(ac, t + 0.12, { f1: 1760, dur: 0.45, vol: 0.025 })
        break
      case 'apagar': // algo sai de cena: um "puf" curto que desce e some
        nota(ac, t, { f1: 900, f2: 180, dur: 0.18, vol: 0.045, tipo: 'triangle' })
        nota(ac, t + 0.05, { f1: 420, f2: 90, dur: 0.22, vol: 0.03 })
        break
      case 'cancelar': // processo interrompido: duas notas que descem, sem o peso do erro
        nota(ac, t, { f1: 660, dur: 0.1, vol: 0.035 })
        nota(ac, t + 0.09, { f1: 440, dur: 0.16, vol: 0.03 })
        break
      case 'erro':
        nota(ac, t, { f1: 220, f2: 140, dur: 0.22, vol: 0.06, tipo: 'triangle' })
        nota(ac, t + 0.11, { f1: 180, f2: 110, dur: 0.26, vol: 0.05, tipo: 'triangle' })
        break
      case 'inicio':
        ;[523.25, 783.99, 1046.5].forEach((f, i) => nota(ac, t + i * 0.08, { f1: f, dur: 0.35, vol: 0.03, comEco: true }))
        break

      // ---------------- coleta de posts
      case 'coleta':
        sopro(ac, t, 300, 2400, 0.45, 0.05)
        nota(ac, t, { f1: 140, f2: 70, dur: 0.18, vol: 0.06 })
        nota(ac, t + 0.25, { f1: 880, f2: 1320, dur: 0.12, vol: 0.02, comEco: true })
        break
      case 'post': {
        const base = 520 + Math.min(1, progresso) * 520
        nota(ac, t, { f1: base * 1.6, f2: base, dur: 0.07, vol: 0.028, detune: Math.random() * 30 - 15 })
        break
      }
      case 'bolha':
        nota(ac, t, { f1: 320 + Math.random() * 120, f2: 980 + Math.random() * 200, dur: 0.09, vol: 0.022 })
        break
      case 'coletaFim':
        ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          nota(ac, t + i * 0.045, { f1: f, dur: 0.4, vol: 0.03, tipo: 'triangle', comEco: i === 3 }))
        break

      // ---------------- análise da IA
      case 'analise':
        ;[440, 659.25, 880].forEach((f, i) => {
          nota(ac, t + i * 0.06, { f1: f, dur: 1.1, vol: 0.018, ataque: 0.25, detune: -6, comEco: true })
          nota(ac, t + i * 0.06, { f1: f, dur: 1.1, vol: 0.018, ataque: 0.25, detune: 6 })
        })
        sopro(ac, t, 4000, 9000, 0.9, 0.012)
        break
      case 'neuronio':
        nota(ac, t, { f1: sorteio(PENTA) * 2, dur: 0.16, vol: 0.016, comEco: true })
        break
      case 'analiseFim':
        ;[659.25, 880, 987.77, 1318.51, 1760, 1975.53].forEach((f, i) => {
          nota(ac, t + i * 0.07, { f1: f, dur: 1.3, vol: 0.032, comEco: true })
          nota(ac, t + i * 0.07, { f1: f * 2.01, dur: 0.6, vol: 0.008 })
        })
        break

      // ---------------- geração (estratégia, calendário, roteiro, imagem)
      case 'geracao': {
        const osc = ac.createOscillator()
        const lp = ac.createBiquadFilter()
        const g = ac.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(110, t)
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.9)
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(300, t)
        lp.frequency.exponentialRampToValueAtTime(3200, t + 0.9)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.022, t + 0.6)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0)
        osc.connect(lp).connect(g).connect(mestre!)
        g.connect(eco!)
        osc.start(t)
        osc.stop(t + 1.05)
        nota(ac, t + 0.85, { f1: 1760, dur: 0.5, vol: 0.02, comEco: true })
        break
      }
      case 'geracaoFim':
        nota(ac, t, { f1: 1567.98, dur: 1.4, vol: 0.035, comEco: true })
        nota(ac, t, { f1: 1567.98 * 2.76, dur: 0.7, vol: 0.01 })
        nota(ac, t + 0.02, { f1: 783.99, dur: 1.2, vol: 0.025 })
        for (let i = 0; i < 7; i++) {
          nota(ac, t + 0.12 + i * 0.055 + Math.random() * 0.03, { f1: sorteio(PENTA) * 2, dur: 0.12, vol: 0.012, comEco: true })
        }
        break

      // ---------------- biblioteca
      case 'favorito':
        nota(ac, t, { f1: 880, f2: 990, dur: 0.1, vol: 0.035 })
        nota(ac, t + 0.07, { f1: 1318.51, dur: 0.35, vol: 0.03, comEco: true })
        break
      case 'pasta':
        nota(ac, t, { f1: 300, f2: 180, dur: 0.12, vol: 0.05, tipo: 'triangle' })
        nota(ac, t + 0.05, { f1: 990, dur: 0.12, vol: 0.015 })
        break
    }
  } catch { /* navegador sem áudio */ }
}

/** Clique sutil em qualquer botão, aba ou link da página. */
export function instalarSonsDeClique() {
  const h = (e: PointerEvent) => {
    const alvo = (e.target as HTMLElement | null)?.closest('button, [role="tab"], [role="radio"], [role="checkbox"], a, [role="switch"]')
    if (alvo && !alvo.closest('[data-sem-som]')) tocar('clique')
  }
  document.addEventListener('pointerdown', h, { capture: true })
  return () => document.removeEventListener('pointerdown', h, { capture: true })
}
