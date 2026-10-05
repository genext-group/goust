"""Cliente OpenAI, modelos configuráveis no .env e contabilidade de tokens."""
import json
import os
import threading
import time

from dotenv import load_dotenv

from ..filtros import PASTA_DADOS, RAIZ

load_dotenv(RAIZ / ".env")

PASTA_IA = PASTA_DADOS / "ia"
PASTA_IA.mkdir(parents=True, exist_ok=True)
ARQ_USO = PASTA_IA / "uso.json"

MODELOS = {
    # raciocínio pesado: relatórios, panorama, chat, destilação de aprendizados
    "relatorio": os.getenv("IA_MODELO_RELATORIO", "gpt-5.5"),
    # análise de cada vídeo (texto + quadros), muitas chamadas, então um modelo menor
    "video": os.getenv("IA_MODELO_VIDEO", "gpt-5.4-mini"),
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


def registrar_uso(modelo, entrada=0, saida=0, segundos_audio=0):
    with _trava:
        uso = json.loads(ARQ_USO.read_text(encoding="utf-8")) if ARQ_USO.exists() else {}
        m = uso.setdefault(modelo, {"chamadas": 0, "entrada": 0, "saida": 0, "segundos_audio": 0})
        m["chamadas"] += 1
        m["entrada"] += entrada
        m["saida"] += saida
        m["segundos_audio"] += round(segundos_audio)
        uso["_atualizado"] = time.time()
        ARQ_USO.write_text(json.dumps(uso, indent=1), encoding="utf-8")


def uso():
    return json.loads(ARQ_USO.read_text(encoding="utf-8")) if ARQ_USO.exists() else {}


def estruturado(tipo, instrucoes, conteudo, formato, esforco="medium"):
    """Chamada com saída em JSON validado por um modelo pydantic."""
    modelo = MODELOS[tipo]
    args = dict(model=modelo, instructions=instrucoes, input=conteudo, text_format=formato)
    if modelo.startswith(("gpt-5", "o")):
        args["reasoning"] = {"effort": esforco}
    r = cliente().responses.parse(**args)
    registrar_uso(modelo, r.usage.input_tokens, r.usage.output_tokens)
    if r.output_parsed is None:
        raise RuntimeError("A IA não devolveu uma resposta válida.")
    return r.output_parsed


def texto(tipo, instrucoes, conteudo, esforco="medium"):
    modelo = MODELOS[tipo]
    args = dict(model=modelo, instructions=instrucoes, input=conteudo)
    if modelo.startswith(("gpt-5", "o")):
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
