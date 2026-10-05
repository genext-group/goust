import { Button, Modal } from '@heroui/react'
import { Check } from '@gravity-ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { api, pastas as apiPastas, type Conta, type Pasta, type Video } from '../../api'

/** Escolher posts da biblioteca (filtra por pasta e por perfil). Usado para montar estilos visuais. */
export function SeletorPosts({ aberto, contas, versao, limite, aoFechar, aoEscolher }: {
  aberto: boolean; contas: Conta[]; versao: number; limite: number
  aoFechar: () => void; aoEscolher: (posts: Video[]) => void
}) {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [mapa, setMapa] = useState<Record<string, number[]>>({})
  const [pasta, setPasta] = useState<number | null>(null)
  const [conta, setConta] = useState<string>('')
  const [marcados, setMarcados] = useState<string[]>([])

  useEffect(() => {
    if (!aberto) return
    setMarcados([])
    api.biblioteca().then(setVideos).catch(() => setVideos([]))
    apiPastas.listar().then((r) => { setPastas(r.pastas); setMapa(r.mapa) }).catch(() => {})
  }, [aberto, versao])

  const lista = useMemo(() => (videos ?? []).filter((v) =>
    (!conta || `${v.plataforma}/${v.conta}` === conta) && (pasta === null || mapa[`${v.plataforma}/${v.id}`]?.includes(pasta))
  ).slice(0, 240), [videos, conta, pasta, mapa])
  const chave = (v: Video) => `${v.plataforma}/${v.id}`
  const alternar = (v: Video) => setMarcados((m) => m.includes(chave(v)) ? m.filter((x) => x !== chave(v)) : m.length >= limite ? m : [...m, chave(v)])

  return (
    <Modal.Backdrop isOpen={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="flex max-h-[88vh] w-full max-w-[920px] flex-col sm:max-w-[920px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading className="titulo-display text-lg font-semibold">Escolher da biblioteca</Modal.Heading></Modal.Header>
          <Modal.Body className="flex-1 space-y-3 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              <Chip ativo={pasta === null} onPress={() => setPasta(null)}>Tudo</Chip>
              {pastas.map((p) => <Chip key={p.id} ativo={pasta === p.id} onPress={() => setPasta(p.id)}>{p.sistema ? '♥ ' : ''}{p.nome} <span className="num text-muted">{p.posts}</span></Chip>)}
              <select value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Perfil"
                className="ml-auto rounded-full bg-surface-secondary px-3 py-1 text-sm outline-none">
                <option value="">Todos os perfis</option>
                {contas.map((c) => <option key={`${c.plataforma}/${c.conta}`} value={`${c.plataforma}/${c.conta}`}>@{c.conta}</option>)}
              </select>
            </div>
            {videos === null ? <div className="carregando h-64" /> : lista.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">Nenhum post aqui.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {lista.map((v) => {
                  const i = marcados.indexOf(chave(v))
                  return (
                    <button key={chave(v)} onClick={() => alternar(v)} className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-secondary transition-all ${i >= 0 ? 'ring-3 ring-accent' : 'hover:opacity-85'}`}>
                      <img src={v.url_thumb} alt="" loading="lazy" className="size-full object-cover" />
                      {i >= 0 && <span className="botao-sinal num absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full text-xs font-semibold">{i + 1}</span>}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white">@{v.conta}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="flex items-center justify-between">
            <span className="text-sm text-muted">{marcados.length} de até {limite}</span>
            <Button className="botao-sinal" isDisabled={!marcados.length} onPress={() => aoEscolher((videos ?? []).filter((v) => marcados.includes(chave(v))))}>
              <Check /> Usar como referência
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function Chip({ ativo, onPress, children }: { ativo: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onPress} className={`rounded-full px-3 py-1 text-sm transition-colors ${ativo ? 'bg-surface font-medium shadow-sm ring-1 ring-[var(--hairline)]' : 'text-muted hover:text-foreground'}`}>{children}</button>
  )
}
