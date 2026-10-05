"""Quem executa as tarefas longas.

Local: threads no próprio processo (uma fila para cada plataforma e uma para a IA).
Nuvem: Vercel Queues. Cada mensagem processa por até ~4 minutos (o limite do plano Hobby é 5)
e, se ainda faltar trabalho, a tarefa se reenfileira e continua de onde parou.
"""
import queue
import threading
import time
import traceback

from .armazenamento import NUVEM

TOPICO = "referencias-trabalho"
PRAZO_NUVEM = 230  # segundos por mensagem
_handlers = {}
_filas = {}


class Continuar(Exception):
    """Levantada quando o prazo da mensagem está acabando e ainda há trabalho."""


def registrar(tipo, funcao):
    """funcao(id, prazo) -> True quando ainda falta trabalho (só acontece com prazo)."""
    _handlers[tipo] = funcao


def despachar(tipo, tarefa_id, faixa=None):
    if NUVEM:
        from vercel.queue.sync import QueueClient
        QueueClient().send(TOPICO, {"tipo": tipo, "id": tarefa_id})
        return
    nome = faixa or tipo
    if nome not in _filas:
        _filas[nome] = queue.Queue()
        threading.Thread(target=_trabalhador_local, args=(_filas[nome],), daemon=True).start()
    _filas[nome].put((tipo, tarefa_id))


def _trabalhador_local(fila):
    while True:
        tipo, tarefa_id = fila.get()
        try:
            _handlers[tipo](tarefa_id, None)
        except Exception:
            traceback.print_exc()


def processar_mensagem(payload):
    """Usado pelo consumidor da fila na nuvem. Devolve True se reenfileirou."""
    tipo, tarefa_id = payload["tipo"], payload["id"]
    falta = _handlers[tipo](tarefa_id, time.time() + PRAZO_NUVEM)
    if falta:
        despachar(tipo, tarefa_id)
    return bool(falta)
