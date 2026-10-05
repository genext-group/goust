"""Consumidor da Vercel Queues (só na nuvem).

Declarado em pyproject.toml ([[tool.vercel.subscribers]]): no deploy a Vercel transforma este
módulo numa função acionada pela fila. Cada mensagem trabalha alguns minutos e, se a tarefa
não terminou, ela mesma se reenfileira (ver baixador/execucao.py).
"""
import asyncio

from vercel.queue import Message, subscribe

from baixador import execucao, tarefas  # noqa: F401  (registram os tipos de trabalho)
from baixador.ia import memoria, tarefas_ia  # noqa: F401


@subscribe(topic=execucao.TOPICO, max_attempts=3, retry_after=60)
async def trabalhar(message: Message[dict[str, object]]) -> None:
    await asyncio.to_thread(execucao.processar_mensagem, message.payload)
