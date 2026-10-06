import { Button, Input, Label, Modal, TextField } from '@heroui/react'
import { useCallback, useRef, useState } from 'react'

interface Pedido { titulo: string; rotulo?: string; valor?: string; confirmar?: string; placeholder?: string }

/**
 * Pede um texto com o modal do Design System (substitui window.prompt).
 * Uso: const { dialogo, pedir } = useDialogoTexto(); ... const nome = await pedir({ titulo: 'Nova pasta' }); ... {dialogo}
 */
export function useDialogoTexto() {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [texto, setTexto] = useState('')
  const resolver = useRef<((v: string | null) => void) | null>(null)

  const pedir = useCallback((p: Pedido) => new Promise<string | null>((res) => {
    resolver.current = res
    setTexto(p.valor ?? '')
    setPedido(p)
  }), [])
  const fechar = (v: string | null) => {
    resolver.current?.(v && v.trim() ? v.trim() : null)
    resolver.current = null
    setPedido(null)
  }

  const dialogo = (
    <Modal.Backdrop isOpen={!!pedido} onOpenChange={(v) => !v && fechar(null)}>
      <Modal.Container size="sm">
        <Modal.Dialog className="w-full max-w-[420px] sm:max-w-[420px]">
          <Modal.CloseTrigger />
          <form onSubmit={(e) => { e.preventDefault(); fechar(texto) }}>
            <Modal.Header><Modal.Heading className="titulo-display text-lg font-semibold">{pedido?.titulo}</Modal.Heading></Modal.Header>
            <Modal.Body>
              <TextField value={texto} onChange={setTexto} autoFocus>
                <Label className={pedido?.rotulo ? '' : 'sr-only'}>{pedido?.rotulo ?? pedido?.titulo}</Label>
                <Input placeholder={pedido?.placeholder} />
              </TextField>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button variant="ghost" onPress={() => fechar(null)}>Cancelar</Button>
              <Button type="submit" className="botao-sinal" isDisabled={!texto.trim()}>{pedido?.confirmar ?? 'Salvar'}</Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
  return { dialogo, pedir }
}
