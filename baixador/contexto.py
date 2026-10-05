"""Usuário da requisição ou da tarefa em andamento (multi-tenant).

A API define o usuário a partir do login; o executor de tarefas define a partir da tarefa.
Threads de pool não herdam o contexto sozinhas: use `em_contexto(funcao)` ao mapear em pools.
"""
import contextvars

_usuario = contextvars.ContextVar("usuario", default=None)


def definir(usuario_id):
    return _usuario.set(usuario_id)


def usuario():
    u = _usuario.get()
    if not u:
        raise RuntimeError("Nenhum usuário no contexto.")
    return u


def em_contexto(funcao):
    """Embrulha a função para rodar com o contexto atual (útil em ThreadPoolExecutor.map)."""
    ctx = contextvars.copy_context()
    return lambda *a, **kw: ctx.copy().run(funcao, *a, **kw)
