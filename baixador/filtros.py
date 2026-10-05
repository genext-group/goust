"""Filtros de seleção de vídeos e utilitários comuns."""
import csv
import re
import threading
from datetime import datetime, timezone

from . import armazenamento
from .armazenamento import NUVEM, PASTA_TEMP, RAIZ

PASTA_DOWNLOADS = RAIZ / "downloads"
PASTA_DADOS = RAIZ / "dados"

# Itens fixados no topo do perfil (máx. 3 no TikTok e no Instagram) quebram a ordem cronológica.
MAX_FIXADOS = 3


class Cancelado(Exception):
    pass


def normalizar_conta(texto, plataforma=None):
    """Aceita @conta, conta ou URL do perfil. Retorna (plataforma, conta)."""
    t = texto.strip()
    m = re.search(r"tiktok\.com/@([\w.\-]+)", t)
    if m:
        return "tiktok", m.group(1)
    m = re.search(r"instagram\.com/([\w.\-]+)", t)
    if m and m.group(1) not in ("p", "reel", "reels", "stories"):
        return "instagram", m.group(1)
    conta = t.lstrip("@").strip("/ ")
    if not plataforma:
        raise ValueError(f"Informe a plataforma para '{texto}'")
    return plataforma, conta


def quantos_listar(opcoes):
    """Quantos itens precisam ser listados (None = perfil inteiro)."""
    if opcoes.get("modo") == "recentes":
        return int(opcoes.get("quantidade") or 10) + MAX_FIXADOS
    return None


def data_inicio_ts(opcoes):
    if opcoes.get("modo") == "periodo" and opcoes.get("data_inicio"):
        return datetime.strptime(opcoes["data_inicio"], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()
    return None


def aplicar_filtro(itens, opcoes):
    """Ordena e seleciona os itens conforme o modo escolhido no painel."""
    modo = opcoes.get("modo", "todos")
    n = int(opcoes.get("quantidade") or 10)
    min_views = int(opcoes.get("min_views") or 0)

    itens = [i for i in itens if (i.get("views") or 0) >= min_views]
    por_data = sorted(itens, key=lambda i: i.get("timestamp") or 0, reverse=True)

    if modo == "recentes":
        return por_data[:n]
    if modo == "antigos":
        return list(reversed(por_data))[:n]
    if modo == "mais_vistos":
        return sorted(itens, key=lambda i: i.get("views") or 0, reverse=True)[:n]
    if modo == "novos":
        return por_data  # a listagem já parou nos vídeos conhecidos; os baixados são pulados
    if modo == "periodo":
        ini = data_inicio_ts(opcoes) or 0
        fim = opcoes.get("data_fim")
        fim_ts = (datetime.strptime(fim, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() + 86400) if fim else float("inf")
        return [i for i in por_data if ini <= (i.get("timestamp") or 0) < fim_ts]
    return por_data


def nome_arquivo(item):
    data = datetime.fromtimestamp(item["timestamp"], timezone.utc).strftime("%Y-%m-%d") if item.get("timestamp") else "sem-data"
    return f"{data}_{item['id']}.mp4"


def pasta_conta(plataforma, conta):
    """Pasta dos vídeos da conta. Na nuvem os vídeos não são guardados: só um diretório temporário."""
    p = (PASTA_TEMP / "videos" if NUVEM else PASTA_DOWNLOADS) / plataforma / conta
    p.mkdir(parents=True, exist_ok=True)
    return p


CAMPOS_CSV = ["data", "id", "url", "views", "likes", "comentarios", "duracao_s", "arquivo", "legenda"]
_trava_csv = threading.Lock()


def _linha(i):
    return {
        "data": datetime.fromtimestamp(i["timestamp"], timezone.utc).strftime("%Y-%m-%d %H:%M") if i.get("timestamp") else "",
        "id": str(i["id"]),
        "url": i["url"],
        "views": i.get("views") if i.get("views") is not None else "",
        "likes": i.get("likes") if i.get("likes") is not None else "",
        "comentarios": i.get("comentarios") if i.get("comentarios") is not None else "",
        "duracao_s": round(i["duracao"]) if i.get("duracao") else "",
        "arquivo": "" if NUVEM else nome_arquivo(i),
        "legenda": " ".join((i.get("legenda") or "").split()),
    }


def ler_metadados(plataforma, conta):
    """{id: linha} dos vídeos já catalogados da conta."""
    if NUVEM:
        return armazenamento.dic_ler(f"meta:{plataforma}/{conta}")
    arq = PASTA_DOWNLOADS / plataforma / conta / "_videos.csv"
    if not arq.exists():
        return {}
    with open(arq, encoding="utf-8-sig", newline="") as f:
        return {r["id"]: r for r in csv.DictReader(f, delimiter=";")}


def salvar_metadados(plataforma, conta, itens):
    """Local: mescla em _videos.csv (abre no Excel). Nuvem: um campo por vídeo no Redis."""
    if NUVEM:
        for i in itens:
            armazenamento.dic_gravar(f"meta:{plataforma}/{conta}", str(i["id"]), _linha(i))
        return
    with _trava_csv:
        linhas = ler_metadados(plataforma, conta)
        for i in itens:
            linhas[str(i["id"])] = _linha(i)
        arq = pasta_conta(plataforma, conta) / "_videos.csv"
        with open(arq, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=CAMPOS_CSV, delimiter=";")
            w.writeheader()
            w.writerows(sorted(linhas.values(), key=lambda r: r["data"], reverse=True))


def contas_com_metadados():
    """[(plataforma, conta)] que têm vídeos catalogados."""
    if NUVEM:
        return [tuple(k.split(":", 1)[1].split("/", 1)) for k in armazenamento.listar("meta:")]
    saida = []
    if PASTA_DOWNLOADS.exists():
        for plat in PASTA_DOWNLOADS.iterdir():
            if plat.is_dir():
                saida += [(plat.name, c.name) for c in plat.iterdir() if c.is_dir()]
    return saida
