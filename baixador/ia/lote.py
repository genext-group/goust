"""Batch API da OpenAI: metade do preço para o que não precisa de resposta na hora (a rotina diária).

Fluxo: a rotina do cron chama `pedir()` em vez de chamar a IA → no fim, `enviar()` manda um lote com os pedidos
do usuário → `coletar()` (crons ao longo do dia e a visita do usuário à Início) baixa os resultados prontos e
aplica cada um com a função registrada para o tipo. Pedido que falha ou expira não é aplicado: como nada foi
registrado, a rotina seguinte pede de novo (é a nova tentativa natural).
"""
import json
import traceback

from openai.lib._parsing._responses import type_to_text_format_param

from .. import contexto as ctx
from .. import db
from . import cliente

_TIPOS = {}   # tipo -> (formato pydantic, aplicar(resultado, dados))
PRAZO_HORAS = 26  # a OpenAI garante 24h; passou disso, desiste e deixa a rotina pedir de novo


def tipo(nome, formato):
    """Decorador: registra como aplicar o resultado de um tipo de pedido."""
    def registrar(aplicar):
        _TIPOS[nome] = (formato, aplicar)
        return aplicar
    return registrar


def ativo():
    import os
    return os.getenv("IA_LOTE", "1") != "0" and cliente.configurada()


def pendente(nome):
    """Já existe um pedido desse tipo esperando (não pede duas vezes)?"""
    return bool(db.um("""select 1 from lote_pedidos where usuario_id = %s and tipo = %s
                         and estado in ('pendente', 'enviado', 'aplicando')""", ctx.usuario(), nome))


def pedir(nome, tipo_modelo, instrucoes, conteudo, dados=None, esforco="low"):
    formato, _ = _TIPOS[nome]
    modelo = cliente.MODELOS[tipo_modelo]
    corpo = {"model": modelo, "instructions": instrucoes + cliente.LINGUAGEM, "input": conteudo,
             "text": {"format": type_to_text_format_param(formato)}}
    if cliente._raciocina(modelo):
        corpo["reasoning"] = {"effort": esforco}
    db.executar("""insert into lote_pedidos (usuario_id, tipo, operacao, modelo, corpo, dados)
                   values (%s, %s, %s, %s, %s, %s)""", ctx.usuario(), nome, ctx.operacao(), modelo, corpo, dados or {})


def enviar(usuario_id=None):
    """Manda num lote só os pedidos pendentes (do usuário, ou de todos). Devolve o id do lote."""
    linhas = db.todos("""select id, corpo from lote_pedidos where estado = 'pendente'
                         and (%s::text is null or usuario_id = %s) order by id""", usuario_id, usuario_id)
    if not linhas:
        return None
    jsonl = "\n".join(json.dumps({"custom_id": str(l["id"]), "method": "POST", "url": "/v1/responses", "body": l["corpo"]},
                                 ensure_ascii=False) for l in linhas)
    c = cliente.cliente()
    arquivo = c.files.create(file=("rotina.jsonl", jsonl.encode("utf-8")), purpose="batch")
    lote = c.batches.create(input_file_id=arquivo.id, endpoint="/v1/responses", completion_window="24h")
    db.executar("update lote_pedidos set estado = 'enviado', lote_id = %s, enviado_em = now() where id = any(%s)",
                lote.id, db.Lista([l["id"] for l in linhas]))
    return lote.id


def _texto_da_resposta(corpo):
    for item in corpo.get("output") or []:
        if item.get("type") == "message":
            for parte in item.get("content") or []:
                if parte.get("type") == "output_text":
                    return parte.get("text")
    return None


def _aplicar_linha(pedido, linha):
    resposta = linha.get("response") or {}
    if linha.get("error") or resposta.get("status_code") != 200:
        raise RuntimeError(json.dumps(linha.get("error") or resposta.get("body"), ensure_ascii=False)[:400])
    corpo = resposta["body"]
    formato, aplicar = _TIPOS[pedido["tipo"]]
    uso = corpo.get("usage") or {}
    ctx.definir(pedido["usuario_id"])
    with ctx.em_operacao(pedido["operacao"]):
        cliente.registrar_uso(f"{pedido['modelo']}:lote", uso.get("input_tokens", 0), uso.get("output_tokens", 0))
        texto = _texto_da_resposta(corpo)
        if not texto:
            raise RuntimeError("resposta sem texto")
        aplicar(formato.model_validate_json(texto), pedido["dados"])


def coletar(usuario_id=None):
    """Aplica os lotes que já terminaram. Seguro para rodar em paralelo: cada lote é "reservado" antes."""
    db.executar(f"""update lote_pedidos set estado = 'erro', erro = 'prazo esgotado'
                    where estado = 'enviado' and enviado_em < now() - interval '{PRAZO_HORAS} hours'""")
    lotes = [l["lote_id"] for l in db.todos("""select distinct lote_id from lote_pedidos where estado = 'enviado'
                                               and (%s::text is null or usuario_id = %s)""", usuario_id, usuario_id)]
    c, aplicados = cliente.cliente(), 0
    for lote_id in lotes:
        try:
            lote = c.batches.retrieve(lote_id)
        except Exception:
            traceback.print_exc()
            continue
        if lote.status in ("failed", "expired", "cancelled"):
            db.executar("update lote_pedidos set estado = 'erro', erro = %s where lote_id = %s and estado = 'enviado'",
                        f"lote {lote.status}", lote_id)
            continue
        if lote.status != "completed":
            continue
        pedidos = {p["id"]: p for p in db.todos("""update lote_pedidos set estado = 'aplicando'
                                                   where lote_id = %s and estado = 'enviado'
                                                   returning id, usuario_id, tipo, operacao, modelo, dados""", lote_id)}
        if not pedidos:
            continue  # outro processo já pegou
        linhas = []
        for fid in filter(None, (lote.output_file_id, lote.error_file_id)):
            linhas += [json.loads(t) for t in c.files.content(fid).text.splitlines() if t.strip()]
        vistos = set()
        for linha in linhas:
            pid = int(linha.get("custom_id", 0))
            pedido = pedidos.get(pid)
            if not pedido:
                continue
            vistos.add(pid)
            try:
                _aplicar_linha(pedido, linha)
                db.executar("update lote_pedidos set estado = 'feito', feito_em = now() where id = %s", pid)
                aplicados += 1
            except Exception as e:
                traceback.print_exc()
                db.executar("update lote_pedidos set estado = 'erro', erro = %s where id = %s", str(e)[:500], pid)
        sem_resposta = [pid for pid in pedidos if pid not in vistos]
        if sem_resposta:
            db.executar("update lote_pedidos set estado = 'erro', erro = 'sem resposta no lote' where id = any(%s)",
                        db.Lista(sem_resposta))
    return aplicados


def esperando(usuario_id):
    return bool(db.um("select 1 from lote_pedidos where usuario_id = %s and estado = 'enviado'", usuario_id))
