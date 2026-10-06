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


_operacao = contextvars.ContextVar("operacao", default="outros")


def definir_operacao(nome):
    """Nome da operação em andamento (para o registro de custos)."""
    return _operacao.set(nome)


def operacao():
    return _operacao.get()


class em_operacao:
    """with contexto.em_operacao("rotina:ideias"): ...  — marca os custos de um trecho."""
    def __init__(self, nome):
        self.nome, self.token = nome, None

    def __enter__(self):
        self.token = _operacao.set(self.nome)

    def __exit__(self, *a):
        _operacao.reset(self.token)


def em_contexto(funcao):
    """Embrulha a função para rodar com o contexto atual (útil em ThreadPoolExecutor.map)."""
    ctx = contextvars.copy_context()
    return lambda *a, **kw: ctx.copy().run(funcao, *a, **kw)
