/**
 * Ilustrações estáticas para estados vazios (no lugar de animações de "buscando"): cada uma representa o que vai
 * existir ali — um calendário, uma estratégia, um estilo, uma imagem. Duotom, cantos arredondados, sem movimento,
 * no espírito das ilustrações de produto do Google e do Nubank. Cores do tema (claro e escuro).
 */
export type TipoIlustracao = 'calendario' | 'estrategia' | 'estilo' | 'imagem' | 'atencao' | 'mercado' | 'ideias' | 'descobertas'

const F = {
  fundo: 'color-mix(in oklab, var(--accent) 12%, transparent)',
  papel: 'var(--surface-tertiary)',
  linha: 'color-mix(in oklab, var(--foreground) 22%, transparent)',
  linhaForte: 'color-mix(in oklab, var(--foreground) 45%, transparent)',
  azul: 'var(--accent)',
  azulClaro: 'var(--sinal-b)',
  rosa: 'var(--concorrente)',
  lilas: 'var(--referencia)',
  menta: 'var(--menta)',
  ambar: 'var(--ambar)',
}

function Brilho({ x, y, r = 4, cor = F.azulClaro }: { x: number; y: number; r?: number; cor?: string }) {
  return <path d={`M${x} ${y - r}C${x + r * 0.2} ${y - r * 0.2} ${x + r * 0.2} ${y - r * 0.2} ${x + r} ${y}C${x + r * 0.2} ${y + r * 0.2} ${x + r * 0.2} ${y + r * 0.2} ${x} ${y + r}C${x - r * 0.2} ${y + r * 0.2} ${x - r * 0.2} ${y + r * 0.2} ${x - r} ${y}C${x - r * 0.2} ${y - r * 0.2} ${x - r * 0.2} ${y - r * 0.2} ${x} ${y - r}Z`} fill={cor} />
}

const DESENHOS: Record<TipoIlustracao, React.ReactNode> = {
  calendario: (
    <>
      <rect x="26" y="22" width="68" height="62" rx="12" fill={F.papel} />
      <path d="M26 34a12 12 0 0 1 12-12h44a12 12 0 0 1 12 12v4H26z" fill={F.azul} />
      <rect x="40" y="16" width="5" height="12" rx="2.5" fill={F.linhaForte} /><rect x="75" y="16" width="5" height="12" rx="2.5" fill={F.linhaForte} />
      {[0, 1, 2, 3].map((c) => [0, 1, 2].map((l) => (
        <rect key={`${c}${l}`} x={34 + c * 14} y={46 + l * 12} width="9" height="7" rx="2" fill={c === 2 && l === 1 ? F.rosa : c === 0 && l === 2 ? F.lilas : F.linha} />
      )))}
      <circle cx="90" cy="78" r="11" fill={F.menta} />
      <path d="M85 78l3.5 3.5L95 75" stroke="#0b0d14" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Brilho x={18} y={30} /><Brilho x={104} y={24} r={3} cor={F.lilas} />
    </>
  ),
  estrategia: (
    <>
      <circle cx="56" cy="54" r="30" fill={F.papel} />
      <circle cx="56" cy="54" r="20" fill="none" stroke={F.linha} strokeWidth="5" />
      <circle cx="56" cy="54" r="9" fill={F.azul} />
      <path d="M58 52L88 22" stroke={F.linhaForte} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M84 16l10 2-2 10-6-1-1-6z" fill={F.rosa} />
      <rect x="82" y="66" width="26" height="18" rx="6" fill={F.papel} />
      <path d="M87 79l5-5 4 3 7-7" stroke={F.menta} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Brilho x={22} y={24} /><Brilho x={20} y={80} r={3} cor={F.lilas} />
    </>
  ),
  estilo: (
    <>
      <rect x="22" y="30" width="40" height="50" rx="10" fill={F.lilas} transform="rotate(-10 42 55)" />
      <rect x="44" y="24" width="40" height="50" rx="10" fill={F.rosa} transform="rotate(6 64 49)" />
      <rect x="58" y="34" width="40" height="50" rx="10" fill={F.papel} />
      <circle cx="70" cy="48" r="5" fill={F.ambar} />
      <path d="M62 78l10-12 8 8 6-6 8 10z" fill={F.azul} />
      <path d="M96 20l-14 22" stroke={F.linhaForte} strokeWidth="4" strokeLinecap="round" />
      <path d="M80 44c-4 1-6 4-5 8 3 0 6-2 7-6z" fill={F.azulClaro} />
      <Brilho x={20} y={22} />
    </>
  ),
  imagem: (
    <>
      <clipPath id="ilustracao-quadro"><rect x="22" y="22" width="76" height="60" rx="12" /></clipPath>
      <rect x="22" y="22" width="76" height="60" rx="12" fill={F.papel} />
      <circle cx="44" cy="40" r="7" fill={F.ambar} />
      <path d="M14 72L44 50l16 14 12-10 34 28v20H14z" fill={F.azul} clipPath="url(#ilustracao-quadro)" />
      <circle cx="94" cy="26" r="11" fill={F.rosa} />
      <path d="M94 21v10M89 26h10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <Brilho x={16} y={86} r={3} cor={F.lilas} /><Brilho x={108} y={50} r={3} />
    </>
  ),
  atencao: (
    <>
      <path d="M60 18c-14 0-24 10-24 26v14l-6 10h60l-6-10V44c0-16-10-26-24-26z" fill={F.azulClaro} />
      <path d="M52 72a8 8 0 0 0 16 0" fill={F.linhaForte} />
      <circle cx="80" cy="26" r="8" fill={F.rosa} />
      <path d="M22 40c-4 6-4 14 0 20M98 40c4 6 4 14 0 20" stroke={F.azulClaro} strokeWidth="3" strokeLinecap="round" fill="none" />
      <Brilho x={30} y={20} r={3} cor={F.lilas} />
    </>
  ),
  mercado: (
    <>
      <rect x="20" y="24" width="80" height="58" rx="12" fill={F.papel} />
      <rect x="32" y="58" width="9" height="14" rx="3" fill={F.linha} />
      <rect x="47" y="50" width="9" height="22" rx="3" fill={F.lilas} />
      <rect x="62" y="42" width="9" height="30" rx="3" fill={F.azul} />
      <rect x="77" y="34" width="9" height="38" rx="3" fill={F.rosa} />
      <path d="M30 50l17-10 15 6 22-16" stroke={F.menta} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M80 28l5 2-1 5" stroke={F.menta} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Brilho x={106} y={20} r={3} /><Brilho x={14} y={84} r={3} cor={F.lilas} />
    </>
  ),
  ideias: (
    <>
      <path d="M60 16c-15 0-26 11-26 25 0 9 4 15 10 20 3 3 4 6 4 10h24c0-4 1-7 4-10 6-5 10-11 10-20 0-14-11-25-26-25z" fill={F.ambar} />
      <rect x="48" y="74" width="24" height="7" rx="3.5" fill={F.papel} /><rect x="51" y="83" width="18" height="6" rx="3" fill={F.papel} />
      <path d="M54 52l6-10 6 10" stroke="#0b0d14" strokeOpacity=".55" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 40h-8M106 40h-8M28 16l-6-6M92 16l6-6" stroke={F.azulClaro} strokeWidth="3" strokeLinecap="round" />
      <Brilho x={98} y={72} r={4} cor={F.rosa} />
    </>
  ),
  descobertas: (
    <>
      <circle cx="40" cy="40" r="13" fill={F.rosa} /><circle cx="40" cy="36" r="5" fill="#fff" fillOpacity=".85" /><path d="M31 49a10 8 0 0 1 18 0" fill="#fff" fillOpacity=".85" />
      <circle cx="78" cy="34" r="11" fill={F.lilas} /><circle cx="78" cy="31" r="4" fill="#fff" fillOpacity=".85" /><path d="M71 41a8 6 0 0 1 14 0" fill="#fff" fillOpacity=".85" />
      <circle cx="62" cy="64" r="17" fill={F.papel} stroke={F.azul} strokeWidth="5" />
      <path d="M74 76l14 14" stroke={F.azul} strokeWidth="7" strokeLinecap="round" />
      <Brilho x={22} y={74} r={3} /><Brilho x={100} y={60} r={4} cor={F.menta} />
    </>
  ),
}

export function Ilustracao({ tipo, tamanho = 120, className = '' }: { tipo: TipoIlustracao; tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho * (100 / 120)} viewBox="0 0 120 100" aria-hidden className={`shrink-0 ${className}`}>
      <ellipse cx="60" cy="54" rx="54" ry="44" fill={F.fundo} />
      {DESENHOS[tipo]}
    </svg>
  )
}
