"""Onde os dados ficam: arquivos no computador (modo local) ou Redis (modo nuvem, na Vercel).

O resto do app só usa estas funções, com chaves no formato de caminho relativo
("contas.json", "dados/ia/marca.json"...). No modo local a chave É o caminho do arquivo,
então nada muda para quem roda pelo iniciar.bat.
"""
import base64
import json
import os
import threading
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NUVEM = bool(os.getenv("VERCEL")) or os.getenv("ARMAZENAMENTO") == "nuvem"
PASTA_TEMP = Path("/tmp") if NUVEM else RAIZ / "dados" / "tmp"

_trava = threading.RLock()
_redis = None


def redis():
    global _redis
    if _redis is None:
        from upstash_redis import Redis
        url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
        token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")
        if not url or not token:
            raise RuntimeError("Redis não configurado (UPSTASH_REDIS_REST_URL/TOKEN).")
        _redis = Redis(url=url, token=token)
    return _redis


def _arquivo(chave):
    return RAIZ / chave


# ---------------------------------------------------------------- JSON simples

def ler_json(chave, padrao=None):
    if NUVEM:
        v = redis().get(chave)
        return json.loads(v) if v is not None else padrao
    p = _arquivo(chave)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else padrao


def gravar_json(chave, valor):
    texto = json.dumps(valor, ensure_ascii=False, indent=None if NUVEM else 1)
    if NUVEM:
        redis().set(chave, texto)
        return
    p = _arquivo(chave)
    p.parent.mkdir(parents=True, exist_ok=True)
    with _trava:
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(texto, encoding="utf-8")
        tmp.replace(p)


def apagar(chave):
    if NUVEM:
        redis().delete(chave)
    else:
        _arquivo(chave).unlink(missing_ok=True)


def listar(prefixo):
    """Chaves que começam com o prefixo (ex.: 'dados/ia/relatorios/tiktok_x/')."""
    if NUVEM:
        chaves, cursor = [], 0
        while True:
            cursor, lote = redis().scan(cursor, match=prefixo + "*", count=500)
            chaves += lote
            if int(cursor) == 0:
                return sorted(set(chaves))
    base = _arquivo(prefixo)
    pasta = base if prefixo.endswith("/") else base.parent
    if not pasta.exists():
        return []
    return sorted(str(p.relative_to(RAIZ)).replace("\\", "/") for p in pasta.rglob("*")
                  if p.is_file() and str(p.relative_to(RAIZ)).replace("\\", "/").startswith(prefixo))


# ---------------------------------------------------------------- dicionários (um campo por item)

def dic_ler(chave):
    """Lê um dicionário {campo: valor-JSON}. Na nuvem é um hash do Redis (1 comando)."""
    if NUVEM:
        bruto = redis().hgetall(chave) or {}
        return {k: json.loads(v) for k, v in bruto.items()}
    return ler_json(chave + ".json", {}) or {}


def dic_ler_campo(chave, campo):
    if NUVEM:
        v = redis().hget(chave, campo)
        return json.loads(v) if v is not None else None
    return dic_ler(chave).get(campo)


def dic_gravar(chave, campo, valor):
    """Grava um campo sem reescrever os outros (seguro com vários trabalhadores ao mesmo tempo)."""
    if NUVEM:
        redis().hset(chave, campo, json.dumps(valor, ensure_ascii=False))
        return
    with _trava:
        d = dic_ler(chave)
        d[campo] = valor
        gravar_json(chave + ".json", d)


def dic_apagar(chave, campo):
    if NUVEM:
        redis().hdel(chave, campo)
        return
    with _trava:
        d = dic_ler(chave)
        d.pop(campo, None)
        gravar_json(chave + ".json", d)


def contador(chave):
    """Inteiro sempre crescente (ids das tarefas)."""
    if NUVEM:
        return int(redis().incr(chave))
    with _trava:
        n = (ler_json(chave + ".json", 0) or 0) + 1
        gravar_json(chave + ".json", n)
        return n


# ---------------------------------------------------------------- lista (feedbacks)

def lista_adicionar(chave, valor):
    if NUVEM:
        redis().rpush(chave, json.dumps(valor, ensure_ascii=False))
        return
    p = _arquivo(chave)
    p.parent.mkdir(parents=True, exist_ok=True)
    with _trava, open(p, "a", encoding="utf-8") as f:
        f.write(json.dumps(valor, ensure_ascii=False) + "\n")


def lista_ler(chave):
    if NUVEM:
        return [json.loads(x) for x in redis().lrange(chave, 0, -1)]
    p = _arquivo(chave)
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


# ---------------------------------------------------------------- imagens pequenas (miniaturas, fotos de perfil)

def imagem_gravar(chave, dados: bytes):
    if NUVEM:
        redis().set(chave, base64.b64encode(dados).decode())
        return
    p = _arquivo(chave)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(dados)


def imagem_ler(chave):
    if NUVEM:
        v = redis().get(chave)
        return base64.b64decode(v) if v else None
    p = _arquivo(chave)
    return p.read_bytes() if p.exists() else None


def imagem_existe(chave):
    if NUVEM:
        return bool(redis().exists(chave))
    return _arquivo(chave).exists()
