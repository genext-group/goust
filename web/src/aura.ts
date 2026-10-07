import type { CSSProperties } from 'react'

/** Gera as 3 cores da aura de um perfil a partir do nome (sempre as mesmas para o mesmo perfil). */
export function aura(semente: string, intensidade = 1): CSSProperties {
  let h = 2166136261
  for (const ch of semente) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const r = (n: number) => ((h >>> (n * 5)) & 1023) / 1023
  // matizes ancoradas na família da marca (azuis, gelo e índigo) com variação por perfil
  const base = [218, 200, 232, 190, 245]
  const h1 = base[Math.floor(r(0) * base.length)] + (r(1) - 0.5) * 40
  const h2 = h1 + 70 + r(2) * 80
  const h3 = h1 - 60 - r(3) * 60
  const a = (x: number) => (0.55 + 0.35 * intensidade) * x
  return {
    '--a1': `hsl(${h1} 85% 62% / ${a(1)})`,
    '--a2': `hsl(${h2} 90% 60% / ${a(0.9)})`,
    '--a3': `hsl(${h3} 80% 55% / ${a(0.8)})`,
  } as CSSProperties
}

/** Aura da própria marca (azul → gelo → índigo), para áreas que não são de um perfil. */
export const auraMarca = {
  '--a1': 'hsl(220 95% 58% / 0.95)',
  '--a2': 'hsl(205 95% 72% / 0.85)',
  '--a3': 'hsl(220 90% 55% / 0.7)',
} as CSSProperties
