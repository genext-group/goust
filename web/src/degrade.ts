import type { CSSProperties } from 'react'

/** Barra segmentada com UM degradê contínuo (azul → azul-gelo) atravessando todos os segmentos:
 *  cada segmento mostra só o seu pedaço, em vez de repetir o degradê inteiro em cada etapa. */
export function pedacoDoDegrade(i: number, total: number): CSSProperties {
  return {
    backgroundImage: 'linear-gradient(90deg, var(--sinal-a), var(--sinal-b))',
    backgroundSize: `${total * 100}% 100%`,
    backgroundPosition: `${total > 1 ? (i / (total - 1)) * 100 : 0}% 0`,
  }
}
