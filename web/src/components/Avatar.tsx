import { Avatar } from '@heroui/react'
import type { Conta } from '../api'
import { iniciais } from '../formato'
import { IconePlataforma } from './Plataforma'

export function AvatarConta({ conta, tamanho = 'md' }: { conta: Conta; tamanho?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="relative shrink-0">
      <Avatar size={tamanho}>
        {conta.perfil?.foto && <Avatar.Image alt={conta.nome} src={conta.perfil.foto} />}
        <Avatar.Fallback>{iniciais(conta.nome)}</Avatar.Fallback>
      </Avatar>
      <span
        className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2"
        style={{ background: 'var(--surface)', borderColor: 'var(--surface)', color: `var(--${conta.plataforma})` }}
      >
        <IconePlataforma plataforma={conta.plataforma} className="size-3" />
      </span>
    </div>
  )
}
