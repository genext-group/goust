import { Button, Input, Label, TextArea, TextField, toast } from '@heroui/react'
import { Sparkles } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'
import { ia, type Marca } from '../../api'
import { Secao } from '../ia/Compartilhado'

const GRUPOS: { titulo: string; campos: { k: string; rotulo: string; dica: string; longo?: boolean }[] }[] = [
  {
    titulo: 'Negócio',
    campos: [
      { k: 'nome', rotulo: 'Nome da marca ou do criador', dica: 'Ex.: Meu app de finanças' },
      { k: 'produto', rotulo: 'O que você vende', dica: 'Oferta, preço, como funciona', longo: true },
      { k: 'diferenciais', rotulo: 'Seus diferenciais', dica: 'O que só você tem', longo: true },
      { k: 'site', rotulo: 'Site', dica: 'https://…' },
    ],
  },
  {
    titulo: 'Público',
    campos: [
      { k: 'publico', rotulo: 'Para quem', dica: 'Quem é o seu cliente ideal', longo: true },
      { k: 'dores_do_publico', rotulo: 'Dores e desejos do público', dica: 'O que tira o sono dele, o que ele quer conquistar', longo: true },
    ],
  },
  {
    titulo: 'Onde você quer chegar',
    campos: [
      { k: 'objetivos', rotulo: 'Objetivo principal com conteúdo', dica: 'Ex.: gerar leads, vender assinatura, virar autoridade', longo: true },
      { k: 'metas', rotulo: 'Metas em números e prazo', dica: 'Ex.: 10 mil seguidores e 300 leads/mês até março', longo: true },
      { k: 'onde_quer_chegar', rotulo: 'Visão de 6 a 12 meses', dica: 'Como você quer estar daqui a um ano', longo: true },
      { k: 'posicionamento_desejado', rotulo: 'Como quer ser percebido', dica: 'Ex.: o jeito mais simples de organizar o dinheiro', longo: true },
    ],
  },
  {
    titulo: 'Como você produz',
    campos: [
      { k: 'tom', rotulo: 'Tom de voz', dica: 'Ex.: próximo, bem-humorado, sem jargão' },
      { k: 'frequencia_possivel', rotulo: 'Frequência possível', dica: 'Ex.: 3 Reels e 1 carrossel por semana' },
      { k: 'recursos_producao', rotulo: 'Recursos de produção', dica: 'Quem aparece, quem edita, equipamento, tempo', longo: true },
      { k: 'restricoes', rotulo: 'O que você não faz', dica: 'Temas, formatos ou estilos fora de questão', longo: true },
      { k: 'observacoes', rotulo: 'Outras observações', dica: 'Qualquer contexto que ajude a IA', longo: true },
    ],
  },
]

export function BriefGuiado({ aoSalvar }: { aoSalvar?: () => void }) {
  const [brief, setBrief] = useState<Marca | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [rascunhando, setRascunhando] = useState(false)
  const [rascunho, setRascunho] = useState(false)

  useEffect(() => { ia.marca().then(setBrief) }, [])
  if (!brief) return null

  const preenchidos = Object.values(brief).filter((v) => v?.trim()).length
  const total = GRUPOS.reduce((s, g) => s + g.campos.length, 0)

  const rascunhar = async () => {
    setRascunhando(true)
    try {
      const r = await ia.rascunharBrief(brief.site || undefined)
      setBrief({ ...brief, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) })
      setRascunho(true)
      toast.success('Rascunho pronto', { description: 'Revise, ajuste e salve. Itens com "(sugestão — confirme)" são palpites da IA.' })
    } catch (e) {
      toast.danger('Não deu para rascunhar', { description: (e as Error).message })
    } finally {
      setRascunhando(false)
    }
  }

  const salvar = async () => {
    setSalvando(true)
    await ia.salvarMarca(brief)
    setSalvando(false)
    setRascunho(false)
    toast.success('Brief salvo', { description: 'Todas as análises e a estratégia passam a usar este contexto.' })
    aoSalvar?.()
  }

  return (
    <Secao titulo="Brief" icone={<Sparkles />}
      descricao="O contexto que a IA usa em tudo: diagnósticos, estratégia e roteiros. Quanto mais concreto, melhores os resultados.">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-secondary p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{preenchidos} de {total} campos preenchidos</p>
          <p className="text-xs text-muted">A IA lê seus perfis e o seu site e propõe um primeiro rascunho para você ajustar.</p>
        </div>
        <Button variant="tertiary" isPending={rascunhando} onPress={rascunhar}>
          <Sparkles /> {rascunhando ? 'Rascunhando…' : 'Rascunhar com IA'}
        </Button>
      </div>
      {rascunho && (
        <p className="mb-4 rounded-xl border-l-2 border-warning bg-surface-secondary px-3 py-2 text-sm">
          Rascunho da IA ainda <strong>não salvo</strong>. Revise os campos e clique em Salvar.
        </p>
      )}
      <div className="space-y-8">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">{g.titulo}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {g.campos.map((c) => (
                <TextField key={c.k} value={brief[c.k] ?? ''} onChange={(v) => setBrief({ ...brief, [c.k]: v })}
                  className={c.longo ? 'md:col-span-1' : ''}>
                  <Label>{c.rotulo}</Label>
                  {c.longo ? <TextArea placeholder={c.dica} className="min-h-24" /> : <Input placeholder={c.dica} />}
                </TextField>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <Button isPending={salvando} onPress={salvar}>Salvar brief</Button>
      </div>
    </Secao>
  )
}
