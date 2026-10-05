"""Fila das análises de IA e monitoramento automático dos concorrentes."""
import itertools
import json
import queue
import threading
import time
import traceback

from .. import tarefas as downloads
from ..filtros import PASTA_DADOS
from . import mercado, perfil

_contador = itertools.count(1)
_fila = queue.Queue()
tarefas = {}
ARQ_CONFIG = PASTA_DADOS / "monitoramento.json"


class TarefaIA:
    def __init__(self, tipo, plataforma=None, conta=None):
        self.id = next(_contador)
        self.tipo = tipo  # "perfil" | "mercado"
        self.plataforma, self.conta = plataforma, conta
        self.status = "na fila"
        self.etapa, self.feito, self.total = "Aguardando", 0, 0
        self.erro = None
        self.criada, self.fim = time.time(), None

    def progresso(self, etapa, feito, total):
        self.etapa, self.feito, self.total = etapa, feito, total

    def como_dict(self):
        return dict(vars(self))


def enfileirar(tipo, plataforma=None, conta=None):
    for t in tarefas.values():  # evita duplicar a mesma análise na fila
        if t.tipo == tipo and t.plataforma == plataforma and t.conta == conta and t.status in ("na fila", "rodando"):
            return t
    t = TarefaIA(tipo, plataforma, conta)
    tarefas[t.id] = t
    _fila.put(t)
    return t


def _trabalhador():
    while True:
        t = _fila.get()
        t.status = "rodando"
        try:
            if t.tipo == "perfil":
                perfil.gerar(t.plataforma, t.conta, t.progresso)
            else:
                mercado.gerar(t.progresso)
            t.status = "concluído"
        except Exception as e:
            t.status, t.erro = "erro", str(e)
            if not isinstance(e, ValueError):
                traceback.print_exc()
        t.fim = time.time()


threading.Thread(target=_trabalhador, daemon=True).start()


# ---------------------------------------------------------------- monitoramento

def config():
    padrao = {"ativo": False, "intervalo_horas": 24, "reanalisar": True, "ultima_execucao": None, "proxima": None}
    if ARQ_CONFIG.exists():
        padrao.update(json.loads(ARQ_CONFIG.read_text(encoding="utf-8")))
    if padrao["ativo"] and padrao["ultima_execucao"]:
        padrao["proxima"] = padrao["ultima_execucao"] + padrao["intervalo_horas"] * 3600
    return padrao


def salvar_config(dados):
    c = config()
    c.update({k: dados[k] for k in ("ativo", "intervalo_horas", "reanalisar") if k in dados})
    c["intervalo_horas"] = max(1, int(c["intervalo_horas"]))
    ARQ_CONFIG.write_text(json.dumps(c, indent=1), encoding="utf-8")
    return config()


def executar_monitoramento(contas):
    """Baixa os vídeos novos de todas as contas e reanalisa as que mudaram."""
    c = config()
    c["ultima_execucao"] = time.time()
    ARQ_CONFIG.write_text(json.dumps({k: v for k, v in c.items() if k != "proxima"}, indent=1), encoding="utf-8")

    criadas = [downloads.enfileirar(x["plataforma"], x["conta"], {"modo": "novos", "somente_reels": True}) for x in contas]
    while any(t.status not in downloads.FINAIS for t in criadas):
        time.sleep(10)
    if not c["reanalisar"]:
        return
    analisadas = perfil.resumo_todos()
    mudou = False
    for t in criadas:
        chave = f"{t.plataforma}/{t.conta}"
        if t.baixados > 0 and chave in analisadas:
            enfileirar("perfil", t.plataforma, t.conta)
            mudou = True
    if mudou and len(analisadas) >= 2:
        enfileirar("mercado")


def iniciar_agendador(ler_contas):
    def laco():
        while True:
            c = config()
            if c["ativo"] and (not c["ultima_execucao"] or time.time() >= c["proxima"]):
                try:
                    executar_monitoramento(ler_contas())
                except Exception:
                    traceback.print_exc()
            time.sleep(600)
    threading.Thread(target=laco, daemon=True).start()
