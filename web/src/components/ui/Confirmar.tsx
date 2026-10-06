import { Button, Modal } from '@heroui/react'
import { TrashBin } from '@gravity-ui/icons'
import { useCallback, useRef, useState, type ReactNode } from 'react'

interface Pedido { titulo: string; texto?: ReactNode; confirmar?: string; perigo?: boolean }

/**
 * Confirmação com o modal do Design System (substitui window.confirm). Toda ação destrutiva passa por aqui.
 * Uso: const { confirmacao, confirmar } = useConfirmar(); ... if (await confirmar({ titulo: 'Remover @x?' })) ...; {confirmacao}
 */
export function useConfirmar() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const confirmar = useCallback((p: Pedido) => new Promise<boolean>((res) => { resolver.current = res; setPedido(p) }), [])
  const fechar = (ok: boolean) => { resolver.current?.(ok); resolver.current = null; setPedido(null) }
  const perigo = pedido?.perigo ?? true

  const confirmacao = (
    <Modal.Backdrop isOpen={!!pedido} onOpenChange={(v) => !v && fechar(false)}>
      <Modal.Container size="sm">
        <Modal.Dialog className="w-full max-w-[420px] sm:max-w-[420px]">
          <Modal.Header className="flex items-start gap-3">
            {perigo && <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger/12 text-danger"><TrashBin className="size-4" /></span>}
            <div>
              <Modal.Heading className="titulo-display text-lg font-semibold">{pedido?.titulo}</Modal.Heading>
              {pedido?.texto && <p className="mt-1 text-sm text-muted">{pedido.texto}</p>}
            </div>
          </Modal.Header>
          <Modal.Footer className="flex justify-end gap-2">
            <Button variant="ghost" onPress={() => fechar(false)} autoFocus>Cancelar</Button>
            <Button variant={perigo ? 'danger' : 'primary'} onPress={() => fechar(true)}>{pedido?.confirmar ?? 'Confirmar'}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
  return { confirmacao, confirmar }
}
