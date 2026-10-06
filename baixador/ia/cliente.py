"""Cliente OpenAI, modelos configuráveis no .env e contabilidade de tokens."""
import os
import threading
import time

from dotenv import load_dotenv

from .. import contexto, db
from ..armazenamento import RAIZ

load_dotenv(RAIZ / ".env")

MODELOS = {
    # Escolha validada em teste A/B (out/2026) contra gpt-5.5 / gpt-5.4-mini, nas mesmas entradas.
    # Relatórios estratégicos (perfil, panorama, estratégia, busca de referências): qualidade igual, 2,8× mais barato.
    "relatorio": os.getenv("IA_MODELO_RELATORIO", "gpt-6.1-sol"),
    # Criação e rotina (roteiro, calendário, ideias, chat, brief, redação de sinais, guia de estilo): qualidade igual
    # ou melhor no teste, 20 a 50× mais barato.
    "criacao": os.getenv("IA_MODELO_CRIACAO", "gpt-6-luna"),
    # Análise de cada vídeo/carrossel (texto + quadros): qualidade igual, 7,5× mais barato.
    "video": os.getenv("IA_MODELO_VIDEO", "gpt-6-luna"),
    "transcricao": os.getenv("IA_MODELO_TRANSCRICAO", "gpt-4o-mini-transcribe"),
}

_cliente = None
_trava = threading.Lock()


def configurada():
    return bool(os.getenv("OPENAI_API_KEY"))


def cliente():
    global _cliente
    if _cliente is None:
        from openai import OpenAI
        _cliente = OpenAI(max_retries=4, timeout=600)
    return _cliente


def registrar_uso(modelo, entrada=0, saida=0, segundos_audio=0, buscas=0):
    """Soma o consumo no mês do usuário atual e o custo em US$ por operação (tabela custos)."""
    from .. import custos
    custos.registrar(modelo, entrada, saida, segundos_audio, buscas)
    try:
        usuario = contexto.usuario()
    except RuntimeError:
        return
    db.executar("""insert into uso (usuario_id, mes, modelo, chamadas, entrada, saida, segundos_audio)
                   values (%s, %s, %s, 1, %s, %s, %s)
                   on conflict (usuario_id, mes, modelo) do update set chamadas = uso.chamadas + 1,
                     entrada = uso.entrada + excluded.entrada, saida = uso.saida + excluded.saida,
                     segundos_audio = uso.segundos_audio + excluded.segundos_audio""",
                usuario, time.strftime("%Y-%m"), modelo, entrada, saida, round(segundos_audio))


def uso():
    """Consumo do usuário atual no mês corrente, por modelo."""
    linhas = db.todos("select * from uso where usuario_id = %s and mes = %s", contexto.usuario(), time.strftime("%Y-%m"))
    return {r["modelo"]: {k: int(r[k]) for k in ("chamadas", "entrada", "saida", "segundos_audio")} for r in linhas}


def _raciocina(modelo):
    return modelo.startswith(("gpt-5", "gpt-6", "o"))


def com_busca_na_web(tipo, instrucoes, conteudo, formato, esforco="low"):
    """Resposta estruturada usando a ferramenta de busca na web (cobrada por chamada + tokens)."""
    modelo = MODELOS[tipo]
    args = dict(model=modelo, instructions=instrucoes, input=conteudo, text_format=formato, tools=[{"type": "web_search"}])
    if _raciocina(modelo):
        args["reasoning"] = {"effort": esforco}
    r = cliente().responses.parse(**args)
    buscas = sum(1 for o in (r.output or []) if getattr(o, "type", "") == "web_search_call")
    registrar_uso(modelo, r.usage.input_tokens, r.usage.output_tokens, buscas=buscas)
    return r.output_parsed


def estruturado(tipo, instrucoes, conteudo, formato, esforco="medium"):
    """Chamada com saída em JSON validado por um modelo pydantic."""
    modelo = MODELOS[tipo]
    args = dict(model=modelo, instructions=instrucoes, input=conteudo, text_format=formato)
    if _raciocina(modelo):
        args["reasoning"] = {"effort": esforco}
    r = cliente().responses.parse(**args)
    registrar_uso(modelo, r.usage.input_tokens, r.usage.output_tokens)
    if r.output_parsed is None:
        raise RuntimeError("A IA não devolveu uma resposta válida.")
    return r.output_parsed


def texto(tipo, instrucoes, conteudo, esforco="medium"):
    modelo = MODELOS[tipo]
    args = dict(model=modelo, instructions=instrucoes, input=conteudo)
    if _raciocina(modelo):
        args["reasoning"] = {"effort": esforco}
    r = cliente().responses.create(**args)
    registrar_uso(modelo, r.usage.input_tokens, r.usage.output_tokens)
    return r.output_text


def transcrever(caminho_audio, segundos):
    modelo = MODELOS["transcricao"]
    with open(caminho_audio, "rb") as f:
        r = cliente().audio.transcriptions.create(model=modelo, file=f, language="pt")
    registrar_uso(modelo, segundos_audio=segundos)
    return r.text
