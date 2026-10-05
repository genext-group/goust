import { Button, Input, Label, Modal, NumberField, Radio, RadioGroup, Switch, TextField } from '@heroui/react'
import { ArrowDownToLine } from '@gravity-ui/icons'
import { useState } from 'react'
import type { Conta, Modo, Opcoes } from '../api'

const MODOS: { id: Modo; titulo: string; desc: string }[] = [
  { id: 'recentes', titulo: 'Mais recentes', desc: 'Os últimos N vídeos' },
  { id: 'mais_vistos', titulo: 'Mais vistos', desc: 'Top N por visualizações' },
  { id: 'novos', titulo: 'Só os novos', desc: 'Desde o último download' },
  { id: 'antigos', titulo: 'Mais antigos', desc: 'Os primeiros N vídeos' },
  { id: 'periodo', titulo: 'Por período', desc: 'Entre duas datas' },
  { id: 'todos', titulo: 'Tudo', desc: 'O perfil inteiro' },
]

interface Props {
  contas: Conta[]
  isOpen: boolean
  onOpenChange: (v: boolean) => void
  onConfirmar: (opcoes: Opcoes) => void
}

export function ModalDownload({ contas, isOpen, onOpenChange, onConfirmar }: Props) {
  const [modo, setModo] = useState<Modo>('recentes')
  const [quantidade, setQuantidade] = useState(10)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [minViews, setMinViews] = useState(0)
  const [soReels, setSoReels] = useState(true)

  const temInstagram = contas.some((c) => c.plataforma === 'instagram')
  const usaQuantidade = ['recentes', 'antigos', 'mais_vistos'].includes(modo)
  const valido = modo !== 'periodo' || !!dataInicio

  const confirmar = () => {
    onConfirmar({
      modo,
      quantidade,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      min_views: minViews,
      somente_reels: soReels,
    })
    onOpenChange(false)
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="titulo-display text-xl font-semibold">
              Baixar de {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
            </Modal.Heading>
            <p className="text-sm text-muted">
              {contas.slice(0, 4).map((c) => `@${c.conta}`).join(', ')}
              {contas.length > 4 && ` e mais ${contas.length - 4}`}
            </p>
          </Modal.Header>

          <Modal.Body className="space-y-5">
            <RadioGroup value={modo} onChange={(v) => setModo(v as Modo)} aria-label="O que baixar">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MODOS.map((m) => (
                  <Radio
                    key={m.id}
                    value={m.id}
                    className="rounded-xl border p-3 transition-colors linha-fina data-[selected=true]:border-accent data-[selected=true]:bg-accent/5"
                  >
                    <Radio.Content className="flex-col items-start gap-0.5">
                      <span className="text-sm font-medium">{m.titulo}</span>
                      <span className="text-xs text-muted">{m.desc}</span>
                    </Radio.Content>
                  </Radio>
                ))}
              </div>
            </RadioGroup>

            {usaQuantidade && (
              <NumberField value={quantidade} onChange={setQuantidade} minValue={1} maxValue={5000}>
                <Label>Vídeos por conta</Label>
                <NumberField.Group>
                  <NumberField.DecrementButton />
                  <NumberField.Input />
                  <NumberField.IncrementButton />
                </NumberField.Group>
              </NumberField>
            )}

            {modo === 'periodo' && (
              <div className="grid grid-cols-2 gap-3">
                <TextField value={dataInicio} onChange={setDataInicio} isRequired>
                  <Label>De</Label>
                  <Input type="date" />
                </TextField>
                <TextField value={dataFim} onChange={setDataFim}>
                  <Label>Até</Label>
                  <Input type="date" />
                </TextField>
              </div>
            )}

            <NumberField value={minViews} onChange={setMinViews} minValue={0} step={1000}>
              <Label>Mínimo de visualizações</Label>
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>

            {temInstagram && (
              <Switch isSelected={soReels} onChange={setSoReels}>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <Label>Instagram: só Reels</Label>
                </Switch.Content>
              </Switch>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="tertiary" slot="close">
              Cancelar
            </Button>
            <Button isDisabled={!valido} onPress={confirmar}>
              <ArrowDownToLine />
              Baixar
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
