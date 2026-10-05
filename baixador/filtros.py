"""Filtros de seleção de vídeos e utilitários comuns."""
import re
from datetime import datetime, timezone

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


def ler_metadados(plataforma, conta):
    """Códigos dos posts já catalogados da conta (catálogo compartilhado no banco)."""
    from . import catalogo
    return {c: {} for c in catalogo.codigos_conhecidos(plataforma, conta)}


def salvar_metadados(plataforma, conta, itens):
    from . import catalogo
    catalogo.salvar_posts(plataforma, conta, itens)
