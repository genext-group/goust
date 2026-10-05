const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const inteiro = new Intl.NumberFormat('pt-BR')

export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : compacto.format(n))
export const fmtInteiro = (n: number | null | undefined) => (n == null ? '—' : inteiro.format(n))

export function fmtData(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T') + (iso.length > 10 ? 'Z' : 'T00:00:00Z'))
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function fmtRelativo(iso: string) {
  if (!iso) return 'nunca'
  const dias = Math.floor((Date.now() - new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  if (dias < 365) return `há ${Math.floor(dias / 30)} ${dias < 60 ? 'mês' : 'meses'}`
  return `há ${Math.floor(dias / 365)} ${dias < 730 ? 'ano' : 'anos'}`
}

export const fmtDuracao = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

export const iniciais = (nome: string) =>
  nome.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
