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
from . import mercado, perfil

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


def enfileirar(tipo, plataforma=None, conta=None):
    for t in listar():  # evita duplicar a mesma análise na fila
        if t["tipo"] == tipo and t["plataforma"] == plataforma and t["conta"] == conta and t["status"] in ATIVOS:
            return t
    dados = {"tipo": tipo, "plataforma": plataforma, "conta": conta, "status": "na fila", "etapa": "Aguardando",
             "feito": 0, "total": 0, "erro": None, "criada": time.time(), "fim": None}
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
    return False


execucao.registrar("ia", executar)


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
    """Cron diário (nuvem): roda o monitoramento de cada usuário que ligou a opção."""
    for r in db.todos("select id from usuarios where (config->'monitoramento'->>'ativo')::boolean is true"):
        ctx.definir(r["id"])
        try:
            executar_monitoramento(contas_do_usuario())
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
