"""TikTok: listagem do perfil e download via yt-dlp (com impersonate do Chrome, sem login)."""
import json
import re
import time

from curl_cffi import requests
from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget

from .filtros import MAX_FIXADOS, Cancelado, data_inicio_ts, nome_arquivo, quantos_listar

OPCOES_BASE = {
    "quiet": True,
    "no_warnings": True,
    "noprogress": True,
    "impersonate": ImpersonateTarget.from_str("chrome"),
}


def perfil_publico(conta):
    """Nome, foto e seguidores, para os cards do painel (melhor esforço)."""
    html = requests.get(f"https://www.tiktok.com/@{conta}", impersonate="chrome", timeout=30).text
    m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html, re.S)
    try:
        info = json.loads(m.group(1))["__DEFAULT_SCOPE__"]["webapp.user-detail"]["userInfo"]
        u = info["user"]
        return {"nome": u.get("nickname"), "foto": u.get("avatarMedium"), "seguidores": info["stats"].get("followerCount")}
    except (AttributeError, KeyError, TypeError, ValueError):
        pass  # formato mudou: cai no regex abaixo

    def campo(chave):
        m = re.search(rf'"{chave}":("(?:[^"\\]|\\.)*"|\d+)', html)
        return json.loads(m.group(1)) if m else None

    return {"nome": campo("nickname"), "foto": campo("avatarMedium"), "seguidores": campo("followerCount")}


def listar(conta, opcoes, log, cancelado, conhecido=lambda _id: False):
    limite = quantos_listar(opcoes)
    inicio = data_inicio_ts(opcoes)
    itens, seguidos_parar = [], 0

    with YoutubeDL({**OPCOES_BASE, "extract_flat": "in_playlist"}) as ydl:
        info = ydl.extract_info(f"https://www.tiktok.com/@{conta}", download=False, process=False)
        for e in info.get("entries") or []:
            if cancelado():
                raise Cancelado()
            itens.append({
                "id": e["id"],
                "url": e.get("url") or f"https://www.tiktok.com/@{conta}/video/{e['id']}",
                "timestamp": e.get("timestamp"),
                "views": e.get("view_count"),
                "likes": e.get("like_count"),
                "comentarios": e.get("comment_count"),
                "duracao": e.get("duration"),
                "legenda": e.get("description") or e.get("title"),
            })
            if len(itens) % 30 == 0:
                log(f"{len(itens)} vídeos encontrados...")
            if limite and len(itens) >= limite:
                break
            # para cedo quando passa da data inicial ou chega em vídeos já baixados (modo "novos")
            antigo = inicio and (e.get("timestamp") or 0) < inicio
            seguidos_parar = seguidos_parar + 1 if (antigo or conhecido(e["id"])) else 0
            if seguidos_parar > MAX_FIXADOS:
                break
    return itens


def baixar(item, pasta, cancelado):
    destino = pasta / nome_arquivo(item)
    if destino.exists():
        return "pulado"

    def checar_cancelamento(_):
        if cancelado():
            raise Cancelado()

    opts = {
        **OPCOES_BASE,
        "outtmpl": str(destino.with_suffix("")) + ".%(ext)s",
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "progress_hooks": [checar_cancelamento],
        "retries": 5,
    }
    with YoutubeDL(opts) as ydl:
        ydl.download([item["url"]])
    time.sleep(0.5)
    return "baixado"
