import { Button, Input, Label, NumberField, Switch, TextArea, TextField, toast } from '@heroui/react'
import { ArrowsRotateRight, CirclePlus, Clock, Sparkles, TrashBin } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { ia, type Marca, type Regra, type StatusIA } from '../../api'
import { fmtNum } from '../../formato'
import { Secao } from './Compartilhado'
import { useNuvem } from '../../ambiente'

const CAMPOS: { k: keyof Marca; rotulo: string; dica: string; longo?: boolean }[] = [
  { k: 'nome', rotulo: 'Nome da sua marca', dica: 'Ex.: Meu app de finanças' },
  { k: 'produto', rotulo: 'O que você vende', dica: 'Produto/serviço, preço, como funciona', longo: true },
  { k: 'publico', rotulo: 'Para quem', dica: 'Quem é o seu cliente ideal', longo: true },
  { k: 'objetivos', rotulo: 'Objetivos com conteúdo', dica: 'Ex.: gerar leads, crescer seguidores, vender assinatura', longo: true },
  { k: 'tom', rotulo: 'Seu tom de voz', dica: 'Ex.: próximo, bem-humorado, sem jargão' },
  { k: 'diferenciais', rotulo: 'Seus diferenciais', dica: 'O que só você tem', longo: true },
  { k: 'observacoes', rotulo: 'Outras observações', dica: 'Restrições, o que não quer fazer, recursos de produção…', longo: true },
]

export function MarcaAprendizados({ status, aoMudar }: { status: StatusIA | null; aoMudar: () => void }) {
  const nuvem = useNuvem()
  const [marca, setMarca] = useState<Marca | null>(null)
  const [regras, setRegras] = useState<Regra[]>([])
  const [novaRegra, setNovaRegra] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [destilando, setDestilando] = useState(false)

  useEffect(() => { ia.marca().then(setMarca) }, [])
  useEffect(() => { if (status) setRegras(status.aprendizados.regras) }, [status?.aprendizados.versao]) // eslint-disable-line react-hooks/exhaustive-deps

  const salvarMarca = async () => {
    if (!marca) return
    setSalvando(true)
    await ia.salvarMarca(marca)
    setSalvando(false)
    toast.success('Marca salva', { description: 'As próximas análises vão trazer insights para o seu caso.' })
  }
  const salvarRegras = async (lista: Regra[]) => {
    setRegras(lista)
    await ia.salvarRegras(lista)
    aoMudar()
  }
  const destilar = async () => {
    setDestilando(true)
    try {
      const a = await ia.destilar()
      setRegras(a.regras)
      aoMudar()
      toast.success('Aprendizados atualizados', { description: a.ultima_mudanca })
    } finally {
      setDestilando(false)
    }
  }

  const a = status?.aprendizados
  const pendentes = (status?.feedbacks ?? 0) - (a?.feedbacks_processados ?? 0)
  const mon = status?.monitoramento
  const uso = Object.entries(status?.uso ?? {}).filter(([k]) => !k.startsWith('_')) as [string, { chamadas: number; entrada: number; saida: number; segundos_audio: number }][]

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Secao titulo="Minha marca" descricao="A IA usa isso para transformar a análise dos concorrentes em recomendações para VOCÊ.">
        {marca && (
          <div className="mt-2 space-y-4">
            {CAMPOS.map((c) => (
              <TextField key={c.k} value={marca[c.k]} onChange={(v) => setMarca({ ...marca, [c.k]: v })}>
                <Label>{c.rotulo}</Label>
                {c.longo ? <TextArea placeholder={c.dica} className="min-h-20" /> : <Input placeholder={c.dica} />}
              </TextField>
            ))}
            <div className="flex justify-end"><Button isPending={salvando} onPress={salvarMarca}>Salvar</Button></div>
          </div>
        )}
      </Secao>

      <div className="space-y-4">
        <Secao titulo="O que a IA aprendeu" icone={<Sparkles />}
          descricao="Regras tiradas dos seus 👍/👎. Elas entram em todas as análises. Edite, apague ou escreva as suas.">
          <div className="num mb-3 flex flex-wrap gap-x-4 text-xs text-muted">
            <span>{status?.feedbacks ?? 0} feedbacks</span>
            <span>versão {a?.versao ?? 0}</span>
            {pendentes > 0 && <span className="text-accent">{pendentes} ainda não aprendidos</span>}
          </div>
          {a?.ultima_mudanca && <p className="mb-3 rounded-xl bg-surface-secondary p-3 text-sm leading-relaxed text-muted">{a.ultima_mudanca}</p>}
          <ul className="space-y-2">
            {regras.map((r, i) => (
              <li key={r.id ?? i} className="group flex items-start gap-2 rounded-xl bg-surface-secondary p-3">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${r.origem === 'manual' ? 'bg-accent' : 'bg-success'}`}
                  title={r.origem === 'manual' ? 'Escrita por você' : 'Aprendida dos feedbacks'} />
                <p className="flex-1 text-sm leading-relaxed">{r.texto}</p>
                <Button isIconOnly size="sm" variant="ghost" aria-label="Apagar regra" className="opacity-0 group-hover:opacity-100"
                  onPress={() => salvarRegras(regras.filter((_, k) => k !== i))}>
                  <TrashBin className="size-3.5" />
                </Button>
              </li>
            ))}
            {!regras.length && <p className="text-sm text-muted">Ainda nada. Avalie insights nas análises e a IA aprende sozinha a cada 5 feedbacks.</p>}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={(e) => {
            e.preventDefault()
            if (novaRegra.trim()) salvarRegras([...regras, { texto: novaRegra.trim(), origem: 'manual' }])
            setNovaRegra('')
          }}>
            <Input aria-label="Nova regra" value={novaRegra} onChange={(e) => setNovaRegra(e.target.value)}
              placeholder="Ex.: sempre traga exemplos de roteiro" className="flex-1" />
            <Button type="submit" isIconOnly variant="tertiary" aria-label="Adicionar regra"><CirclePlus /></Button>
          </form>
          <Button className="mt-3 w-full" variant="tertiary" isPending={destilando} isDisabled={!status?.feedbacks} onPress={destilar}>
            <ArrowsRotateRight /> Aprender com os feedbacks agora
          </Button>
        </Secao>

        <Secao titulo="Monitoramento automático" icone={<Clock />}
          descricao="Baixa os vídeos novos de todas as contas e reanalisa as que publicaram algo.">
          {mon && (
            <div className="space-y-4">
              <Switch isSelected={mon.ativo} onChange={(v) => ia.salvarMonitoramento({ ativo: v }).then(aoMudar)}>
                <Switch.Control><Switch.Thumb /></Switch.Control>
                <Switch.Content><Label>Ativado</Label></Switch.Content>
              </Switch>
              {nuvem ? <p className="text-sm text-muted">Na versão online roda uma vez por dia (10h UTC).</p> : <NumberField value={mon.intervalo_horas} minValue={1} maxValue={168}
                onChange={(v) => ia.salvarMonitoramento({ intervalo_horas: v }).then(aoMudar)}>
                <Label>A cada quantas horas</Label>
                <NumberField.Group><NumberField.DecrementButton /><NumberField.Input /><NumberField.IncrementButton /></NumberField.Group>
              </NumberField>}
              <Switch isSelected={mon.reanalisar} onChange={(v) => ia.salvarMonitoramento({ reanalisar: v }).then(aoMudar)}>
                <Switch.Control><Switch.Thumb /></Switch.Control>
                <Switch.Content><Label>Reanalisar com IA quando houver vídeo novo</Label></Switch.Content>
              </Switch>
              <p className="text-xs text-muted">
                {mon.ultima_execucao ? `Última: ${new Date(mon.ultima_execucao * 1000).toLocaleString('pt-BR')}` : 'Nunca rodou.'}
                {mon.ativo && mon.proxima && ` · Próxima: ${new Date(mon.proxima * 1000).toLocaleString('pt-BR')}`}
              </p>
              <Button variant="tertiary" className="w-full" onPress={() => ia.monitorarAgora().then(() => toast.success('Monitoramento iniciado', { description: 'Acompanhe em Downloads.' }))}>
                Rodar agora
              </Button>
            </div>
          )}
        </Secao>

        <Secao titulo="Uso da IA">
          <ul className="num space-y-1 text-sm">
            {uso.map(([modelo, u]) => (
              <li key={modelo} className="flex justify-between gap-2">
                <span className="truncate text-muted">{modelo}</span>
                <span>{u.segundos_audio ? `${fmtNum(u.segundos_audio / 60)} min de áudio` : `${fmtNum(u.entrada + u.saida)} tokens`} · {u.chamadas}×</span>
              </li>
            ))}
            {!uso.length && <li className="text-muted">Nenhuma chamada ainda.</li>}
          </ul>
        </Secao>
      </div>
    </div>
  )
}
