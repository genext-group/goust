import { SignIn } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { ChartLine, Bulb, Eye, Flame, Sparkles, TargetDart } from '@gravity-ui/icons'
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

function Beneficio({ icone, titulo, texto }: { icone: ReactNode; titulo: string; texto: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border text-foreground/80 linha-fina [&_svg]:size-4">{icone}</span>
      <span><span className="block text-sm font-medium">{titulo}</span><span className="block text-sm leading-relaxed text-muted">{texto}</span></span>
    </li>
  )
}

/** Login: o Goust se forma e voa entre os sinais do mercado; à direita, o acesso. */
export function TelaEntrar() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* atmosfera: brilhos azuis difusos e uma grade quase invisível */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 size-[620px] rounded-full bg-[radial-gradient(circle,rgba(47,116,255,0.28),transparent_65%)]" />
        <div className="absolute -right-40 -bottom-56 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(143,208,255,0.16),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-8">
        <div className="surgir">
          <LogoGoust tamanho={30} />

          {/* o Goust e os sinais que ele traz */}
          <div className="relative mx-auto mt-6 h-[260px] w-full max-w-[460px] sm:h-[300px] lg:mx-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 -z-10 m-auto size-40 rounded-full bg-[radial-gradient(circle,rgba(59,130,255,0.35),transparent_70%)] blur-2xl" />
              <Mascote tamanho={170} animado voar formar />
            </div>
            <Sinal icone={<ChartLine />} titulo="@concorrente acelerou" texto="+83% de alcance este mês" className="top-4 left-0 sm:left-2" atraso="1.4s" />
            <Sinal icone={<Flame />} titulo="Post em alta no mercado" texto="15,5× a média da conta" className="top-24 right-0" atraso="1.9s" />
            <Sinal icone={<Bulb />} titulo="3 ideias para hoje" texto="com roteiro pronto para gravar" className="bottom-2 left-6 sm:left-10" atraso="2.4s" />
          </div>

          <h1 className="titulo-display mt-4 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
            Veja o que o seu mercado faz.<br /><span className="text-[var(--sinal-b)]">Sem ser visto.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted">
            A Goust acompanha todos os dias os perfis que importam para você no Instagram e no TikTok, entende o que
            está funcionando e transforma isso em ideias, roteiros e calendário.
          </p>
          <ul className="mt-7 hidden max-w-xl gap-4 sm:grid">
            <Beneficio icone={<Eye />} titulo="Concorrentes e referências no radar" texto="Posts novos, quem acelerou, o que está em alta e o que mudou desde a sua última visita." />
            <Beneficio icone={<Sparkles />} titulo="IA que explica o porquê" texto="Gancho, formato e mensagem de cada post, e a diferença entre o TikTok e o Instagram de cada marca." />
            <Beneficio icone={<TargetDart />} titulo="Do insight ao post" texto="Estratégia, caderno de ideias, calendário e roteiros pensados para o seu negócio." />
          </ul>
        </div>

        <div className="surgir flex flex-col items-center lg:items-end" style={{ animationDelay: '120ms' }}>
          <SignIn routing="hash" />
          <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-muted lg:text-right">
            Grátis para começar. Seus dados ficam só com você: a Goust observa perfis públicos e nunca publica nada em seu nome.
          </p>
        </div>
      </div>
    </div>
  )
}
