"""Linha do tempo e atividade por usuário (base do painel de super-admin).

- `registrar(tipo, dados)`: um evento (cadastro, sessão, perfil adicionado, tarefa de IA, erro, ação do admin).
- `atividade(usuario)`: conta requisições por dia; grava no máximo 1x por minuto por usuário e processo.
- `controles(usuario)`: o que o admin definiu (plano, teto de gasto, suspensão), com cache curto.
Nada aqui pode derrubar a requisição: falhas são engolidas.
"""
import threading
import time
import traceback

from . import contexto, db

_trava = threading.Lock()
_pendente = {}       # usuario -> (requisições acumuladas, último envio)
_cache_ctl = {}      # usuario -> (controles, quando)


def registrar(tipo, dados=None, usuario_id=None):
    try:
        usuario_id = usuario_id or contexto.usuario()
    except RuntimeError:
        return
    try:
        db.executar("insert into eventos (usuario_id, tipo, dados) values (%s, %s, %s)", usuario_id, tipo, dados or {})
    except Exception:
        traceback.print_exc()


def atividade(usuario_id, sessao_nova=False):
    agora = time.time()
    with _trava:
        n, ultimo = _pendente.get(usuario_id, (0, 0))
        n += 1
        if not sessao_nova and agora - ultimo < 60:
            _pendente[usuario_id] = (n, ultimo)
            return
        _pendente[usuario_id] = (0, agora)
    try:
        db.executar("""insert into atividade_diaria (usuario_id, dia, requisicoes, sessoes, primeira, ultima)
                       values (%s, current_date, %s, %s, now(), now())
                       on conflict (usuario_id, dia) do update set requisicoes = atividade_diaria.requisicoes + excluded.requisicoes,
                         sessoes = atividade_diaria.sessoes + excluded.sessoes, ultima = now()""",
                    usuario_id, n, 1 if sessao_nova else 0)
    except Exception:
        traceback.print_exc()


def controles(usuario_id, cache_s=60):
    c = _cache_ctl.get(usuario_id)
    if c and time.time() - c[1] < cache_s:
        return c[0]
    r = db.um("select config->'admin' as a from usuarios where id = %s", usuario_id)
    ctl = (r or {}).get("a") or {}
    _cache_ctl[usuario_id] = (ctl, time.time())
    return ctl


def esquecer_cache(usuario_id):
    _cache_ctl.pop(usuario_id, None)


class LimiteAtingido(ValueError):
    pass


def verificar_limite():
    """Chamado antes de cada chamada de IA: respeita o teto mensal definido pelo admin para o usuário."""
    try:
        usuario_id = contexto.usuario()
    except RuntimeError:
        return
    teto = controles(usuario_id).get("limite_usd_mes")
    if not teto:
        return
    r = db.um("""select coalesce(sum(usd), 0) as usd from custos
                 where usuario_id = %s and dia >= date_trunc('month', current_date)""", usuario_id)
    if float(r["usd"]) >= float(teto):
        raise LimiteAtingido("Você atingiu o limite de uso de IA do seu plano neste mês. Fale com o suporte para ampliar.")
