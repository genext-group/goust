import { SignIn } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { ChartLine, Bulb, Eye, Flame, Sparkles } from '@gravity-ui/icons'
import type { ReactNode } from 'react'
import { LogoGoust, Mascote } from '../components/Goust'

const escuro = () => {
  try { return (localStorage.getItem('tema') || 'dark') === 'dark' } catch { return true }
}

/** Tema do Clerk com a identidade da Goust (login e menu da conta). Acompanha o tema claro/escuro do app. */
export function aparenciaClerk() {
  const e = escuro()
  return {
    variables: {
      colorPrimary: e ? '#3b82ff' : '#1f63ff', colorPrimaryForeground: '#ffffff',
      colorBackground: e ? '#121214' : '#ffffff', colorForeground: e ? '#f5f5f7' : '#14141c',
      colorMutedForeground: e ? '#98989f' : '#6b6b7b', colorMuted: e ? '#1c1c1f' : '#f0f0f5',
      colorInput: e ? '#1c1c1f' : '#ffffff', colorInputForeground: e ? '#f5f5f7' : '#14141c',
      colorBorder: e ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,40,0.1)', colorNeutral: e ? '#ffffff' : '#14141c',
      colorRing: '#3b82ff', colorDanger: '#ff5a5f', borderRadius: '0.875rem',
      fontFamily: '"Geist", -apple-system, "Segoe UI", system-ui, sans-serif',
    },
    elements: {
      cardBox: 'shadow-none border border-[var(--border)] rounded-3xl',
      card: 'shadow-none',
      headerTitle: 'titulo-display tracking-tight',
      footer: 'bg-transparent',
    },
  }
}

/** Textos do login e do cadastro com a voz da Goust (o resto vem da tradução pt-BR do Clerk). */
export const localizacaoGoust = {
  ...ptBR,
  signIn: {
    ...ptBR.signIn,
    start: { ...ptBR.signIn?.start, title: 'Entre na Goust', subtitle: 'Seu mercado não parou enquanto você esteve fora.' },
  },
  signUp: {
    ...ptBR.signUp,
    start: { ...ptBR.signUp?.start, title: 'Crie sua conta na Goust', subtitle: 'Leva um minuto. Depois é só dizer quem você quer acompanhar.' },
  },
}

/** Sinal flutuando ao redor do Goust: o tipo de coisa que ele descobre por você. */
function Sinal({ icone, titulo, texto, className, atraso }: { icone: ReactNode; titulo: string; texto: string; className: string; atraso: string }) {
  return (
    <div className={`entrar-sinal absolute flex items-center gap-2.5 rounded-2xl border bg-[var(--glass)] px-3 py-2 shadow-xl backdrop-blur-xl linha-fina ${className}`}
      style={{ animationDelay: atraso }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent [&_svg]:size-4">{icone}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium whitespace-nowrap">{titulo}</span>
        <span className="block text-[11px] whitespace-nowrap text-muted">{texto}</span>
      </span>
    </div>
  )
}

function Etiqueta({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] text-foreground/80 linha-fina [&_svg]:size-3.5 [&_svg]:text-[var(--sinal-b)]">
      {icone}{children}
    </li>
  )
}

/** Login em uma tela só (sem rolagem no computador): o Goust e o que ele faz à esquerda, o acesso à direita. */
export function TelaEntrar() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[var(--background)] lg:h-dvh lg:overflow-hidden">
      {/* fundo minimalista: preto, um único brilho azul difuso e uma linha de luz no topo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-px w-[min(900px,80vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--sinal-b)]/50 to-transparent" />
        <div className="absolute top-[-30%] left-1/2 h-[70%] w-[min(1100px,120vw)] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(47,116,255,0.16),transparent)]" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center px-6 pt-6 lg:absolute lg:inset-x-0 lg:top-0">
        <LogoGoust tamanho={28} />
      </header>

      <main className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-8 lg:h-full lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-0">
        <section className="surgir">
          {/* cena compacta: sinais acima, o Goust no centro */}
          <div className="relative h-[210px] w-full max-w-[480px]">
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 -z-10 m-auto size-32 rounded-full bg-[radial-gradient(circle,rgba(59,130,255,0.35),transparent_70%)] blur-2xl" />
              <Mascote tamanho={118} animado voar formar />
            </div>
            <Sinal icone={<ChartLine />} titulo="@concorrente acelerou" texto="+83% de alcance este mês" className="top-0 left-0" atraso="1.4s" />
            <Sinal icone={<Flame />} titulo="Post em alta" texto="15,5× a média da conta" className="top-10 right-0 max-sm:hidden" atraso="1.9s" />
          </div>

          <h1 className="titulo-display mt-6 text-[36px] leading-[1.05] font-semibold tracking-tight sm:text-[44px]">
            <span className="block [text-wrap:balance]">Veja o que o seu mercado faz.</span>
            <span className="block text-[var(--sinal-b)]">Sem ser visto.</span>
          </h1>
          <p className="mt-4 max-w-[30rem] text-base leading-relaxed text-muted">
            A Goust acompanha os perfis que importam para você no Instagram e no TikTok e transforma o que funciona em ideias e roteiros.
          </p>
          <ul className="mt-6 flex max-w-[34rem] flex-wrap gap-2">
            <Etiqueta icone={<Eye />}>Concorrentes no radar todo dia</Etiqueta>
            <Etiqueta icone={<Sparkles />}>IA que explica o porquê</Etiqueta>
            <Etiqueta icone={<Bulb />}>Ideias e roteiros prontos</Etiqueta>
          </ul>
        </section>

        <section className="surgir flex flex-col items-center lg:items-end" style={{ animationDelay: '120ms' }}>
          <SignIn routing="hash" />
          <p className="mt-3 max-w-[22rem] text-center text-xs leading-relaxed text-muted lg:text-right">
            Grátis para começar. A Goust só observa perfis públicos e nunca publica nada em seu nome.
          </p>
        </section>
      </main>
    </div>
  )
}
