"""Fila das análises de IA e monitoramento automático dos concorrentes (por usuário).

O estado fica na tabela tarefas (tipo 'ia'): na nuvem uma análise pode atravessar várias
mensagens da fila. A configuração do monitoramento fica em usuarios.config.
"""
import threading
import time
import traceback

from .. import contexto as ctx
from .. import db, execucao
from .. import tarefas as downloads
from ..armazenamento import NUVEM
from ..execucao import Continuar
from . import conteudo, estrategia, imagens, mercado, perfil

ATIVOS = ("na fila", "rodando")


def _ler(tid):
    r = db.um("select id, usuario_id, dados from tarefas where id = %s and tipo = 'ia'", tid)
    return {**r["dados"], "id": r["id"], "usuario_id": r["usuario_id"]} if r else None


def _gravar(t):
    db.executar("update tarefas set status = %s, dados = %s, fim = to_timestamp(%s) where id = %s",
                t["status"], {k: v for k, v in t.items() if k not in ("id", "usuario_id")}, t.get("fim"), t["id"])


def listar():
    linhas = db.todos("select id, dados from tarefas where usuario_id = %s and tipo = 'ia' order by id desc limit 60",
                      ctx.usuario())
    return [{**r["dados"], "id": r["id"]} for r in linhas]


UNICAS = ("perfil", "mercado", "estrategia", "calendario", "estilo", "roteiro", "inteligencia")  # não duplicam na fila


def enfileirar(tipo, plataforma=None, conta=None, params=None):
    params = params or {}
    if tipo in UNICAS:
        for t in listar():  # evita duplicar a mesma tarefa na fila
            if (t["tipo"] == tipo and t["plataforma"] == plataforma and t["conta"] == conta
                    and t.get("params", {}).get("alvo") == params.get("alvo") and t["status"] in ATIVOS):
                return t
    dados = {"tipo": tipo, "plataforma": plataforma, "conta": conta, "params": params, "resultado": None,
             "status": "na fila", "etapa": "Aguardando", "feito": 0, "total": 0, "erro": None,
             "criada": time.time(), "fim": None}
    r = db.um("insert into tarefas (usuario_id, tipo, status, dados) values (%s, 'ia', 'na fila', %s) returning id",
              ctx.usuario(), dados)
    execucao.despachar("ia", r["id"], faixa="ia")
    return {**dados, "id": r["id"]}


def executar(tid, prazo=None):
    t = _ler(tid)
    if not t or t["status"] not in ATIVOS:
        return False
    ctx.definir(t["usuario_id"])
    t["status"] = "rodando"
    _gravar(t)
    ultimo = [0.0]

    def progresso(etapa, feito, total):
        t.update(etapa=etapa, feito=feito, total=total)
        if time.time() - ultimo[0] > 2 or feito == total:  # poupa escritas
            ultimo[0] = time.time()
            _gravar(t)

    try:
        if t["tipo"] == "perfil":
            perfil.gerar(t["plataforma"], t["conta"], progresso, prazo)
        elif t["tipo"] == "estrategia":
            estrategia.gerar(progresso)
        elif t["tipo"] == "imagem":
            p = t["params"]
            t["resultado"] = {"imagem": imagens.gerar(p.get("pedido"), p.get("estilo_id"), p.get("formato", "post"),
                                                      p.get("qualidade", "padrao"), p.get("conteudo_id"), progresso)}
        elif t["tipo"] == "estilo":
            imagens.analisar_estilo(t["params"]["alvo"], progresso)
        elif t["tipo"] == "calendario":
            t["resultado"] = conteudo.gerar_calendario(t["params"].get("semanas", 2), t["params"].get("inicio"), progresso)
        elif t["tipo"] == "inteligencia":
            from ..inteligencia import rotina
            t["resultado"] = rotina.rotina(progresso)
        elif t["tipo"] == "roteiro":
            conteudo.gerar_roteiro(t["params"]["alvo"], t["params"].get("pedido", ""), progresso)
        else:
            mercado.gerar(progresso)
        t["status"] = "concluído"
    except Continuar:
        t["etapa"] = "Continuando…"
        _gravar(t)
        return True
    except Exception as e:
        t["status"], t["erro"] = "erro", str(e)
        if not isinstance(e, ValueError):
            traceback.print_exc()
    t["fim"] = time.time()
    _gravar(t)
    if t["status"] == "concluído":
        try:
            encadear()
        except Exception:
            traceback.print_exc()
    return False


execucao.registrar("ia", executar)


# ---------------------------------------------------------------- piloto automático (primeira configuração)

def _config_geral(usuario_id):
    r = db.um("select config from usuarios where id = %s", usuario_id)
    return r["config"] if r else {}


def ligar_piloto(estrategia_=True, calendario=True):
    """Ao terminar a configuração inicial: quando as análises acabarem, gera a estratégia e depois o calendário."""
    db.executar("update usuarios set config = jsonb_set(config, '{piloto}', %s) where id = %s",
                {"estrategia": estrategia_, "calendario": calendario}, ctx.usuario())
    encadear()


def _desligar(chave):
    db.executar("update usuarios set config = config #- %s where id = %s", ["piloto", chave], ctx.usuario())


def encadear():
    """Dá o próximo passo do piloto automático, se não houver coleta ou análise em andamento."""
    piloto = _config_geral(ctx.usuario()).get("piloto") or {}
    if not piloto.get("estrategia") and not piloto.get("calendario"):
        return
    ocupado = db.um("""select 1 from tarefas where usuario_id = %s and status in ('na fila', 'rodando', 'listando',
                       'baixando', 'comentários') and (tipo = 'download' or dados->>'tipo' in ('perfil', 'estrategia'))
                       limit 1""", ctx.usuario())
    if ocupado:
        return
    if piloto.get("estrategia"):
        _desligar("estrategia")
        if estrategia.versoes() or any(perfil.versoes(c["plataforma"], c["conta"]) for c in estrategia.contas_por_papel()[1]):
            enfileirar("estrategia")
        return
    if piloto.get("calendario"):
        _desligar("calendario")
        if estrategia.versoes():
            enfileirar("calendario", params={"semanas": 2})


# ---------------------------------------------------------------- monitoramento (por usuário)

def _config_usuario(usuario_id):
    r = db.um("select config from usuarios where id = %s", usuario_id)
    return (r["config"] if r else {}).get("monitoramento") or {}


def config():
    padrao = {"ativo": False, "intervalo_horas": 24, "reanalisar": True, "ultima_execucao": None, "proxima": None}
    padrao.update(_config_usuario(ctx.usuario()))
    if NUVEM:
        padrao["intervalo_horas"] = 24  # na nuvem roda pelo cron diário da Vercel
    if padrao["ativo"] and padrao["ultima_execucao"]:
        padrao["proxima"] = padrao["ultima_execucao"] + padrao["intervalo_horas"] * 3600
    return padrao


def _gravar_config(c):
    db.executar("update usuarios set config = jsonb_set(config, '{monitoramento}', %s) where id = %s",
                {k: v for k, v in c.items() if k != "proxima"}, ctx.usuario())


def salvar_config(dados):
    c = config()
    c.update({k: dados[k] for k in ("ativo", "intervalo_horas", "reanalisar") if k in dados})
    c["intervalo_horas"] = max(1, int(c["intervalo_horas"]))
    _gravar_config(c)
    return config()


def executar_monitoramento(contas):
    """Baixa os vídeos novos das contas do usuário atual; quem tiver novidade é reanalisado (se ligado)."""
    c = config()
    c["ultima_execucao"] = time.time()
    _gravar_config(c)
    opcoes = {"modo": "novos", "somente_reels": True, "analisar_depois": bool(c["reanalisar"])}
    for x in contas:
        downloads.enfileirar(x["plataforma"], x["conta"], opcoes)


def monitorar_todos(contas_do_usuario):
    """Cron diário (nuvem): coleta diária da central para quem usa a plataforma (seu perfil + contas mais
    desatualizadas, com limite) e o monitoramento completo de quem ligou a opção."""
    from ..inteligencia import rotina
    ativos = set(rotina.usuarios_ativos())
    monitorando = {r["id"] for r in db.todos("select id from usuarios where (config->'monitoramento'->>'ativo')::boolean is true")}
    for uid in ativos | monitorando:
        ctx.definir(uid)
        try:
            if uid in monitorando:
                executar_monitoramento(contas_do_usuario())
            else:
                rotina.coleta_diaria()
        except Exception:
            traceback.print_exc()


def inteligencia_todos():
    """Cron diário (nuvem), depois da coleta: a rotina da central para cada usuário ativo."""
    from ..inteligencia import rotina
    for uid in rotina.usuarios_ativos():
        ctx.definir(uid)
        try:
            enfileirar("inteligencia", params={"silencioso": True})
        except Exception:
            traceback.print_exc()


def iniciar_agendador(usuario_local, contas_do_usuario):
    """Só no modo local; na nuvem quem dispara é o cron da Vercel (/api/cron/monitorar)."""
    def laco():
        ctx.definir(usuario_local)
        while True:
            c = config()
            if c["ativo"] and (not c["ultima_execucao"] or time.time() >= c["proxima"]):
                try:
                    executar_monitoramento(contas_do_usuario())
                except Exception:
                    traceback.print_exc()
            time.sleep(600)
    threading.Thread(target=laco, daemon=True).start()
