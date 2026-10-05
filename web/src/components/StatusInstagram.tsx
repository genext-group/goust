import { Button, Popover } from '@heroui/react'
import { useEffect, useState } from 'react'
import { api, type StatusInstagram as Status } from '../api'
import { IconePlataforma } from './Plataforma'

/** Indicador do modo do Instagram: sem login (padrão, 12 Reels) ou conectado (histórico completo). */
export function StatusInstagram() {
  const [s, setS] = useState<Status | null>(null)

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined
    const carregar = () => api.instagram().then((r) => { setS(r); if (r.nuvem && t) clearInterval(t) }).catch(() => {})
    carregar()
    t = setInterval(carregar, 3000)
    return () => clearInterval(t)
  }, [])

  const conectado = !!s?.usuario
  return (
    <Popover>
      <Button size="sm" variant="tertiary" className="gap-2 rounded-full">
        <IconePlataforma plataforma="instagram" className="size-3.5" />
        <span className="hidden sm:inline">{conectado ? 'Histórico completo' : s?.nuvem ? 'Busca ampliada' : 'Sem login'}</span>
        <span className={`size-1.5 rounded-full ${conectado ? 'bg-success' : 'bg-muted'}`} />
      </Button>
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog className="space-y-3 p-1">
          <Popover.Heading className="font-semibold">Instagram</Popover.Heading>
          {s?.nuvem ? (
            <p className="text-sm text-muted">
              Na versão online o Instagram não mostra perfis para servidores, então os Reels são encontrados pela
              <span className="text-foreground"> busca ampliada</span> (buscadores + validação de cada Reel). Posts muito
              recentes podem levar alguns dias para aparecer. O login opcional só existe no app local.
            </p>
          ) : conectado ? (
            <p className="text-sm text-muted">
              Conectado. O app lista o perfil inteiro, inclusive Reels antigos e vídeos do feed.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Funciona <span className="text-foreground">sem login</span>: baixa os 12 Reels mais recentes de cada perfil,
              que é o limite que o Instagram mostra para visitantes. Para o histórico completo, conecte uma conta
              (de preferência secundária).
            </p>
          )}
          {s?.rodando && <p className="text-sm text-accent">{s.status}</p>}
          {!s?.rodando && s?.status && <p className="text-sm text-danger">{s.status}</p>}
          {!s?.nuvem && <div className="flex justify-end gap-2">
            {conectado ? (
              <Button size="sm" variant="tertiary" onPress={() => api.desconectarInstagram().then(() => api.instagram().then(setS))}>
                Desconectar
              </Button>
            ) : (
              <Button size="sm" isDisabled={s?.rodando} onPress={() => api.conectarInstagram().then(() => api.instagram().then(setS))}>
                Conectar conta
              </Button>
            )}
          </div>}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
