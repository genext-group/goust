"""Biblioteca de vídeos, miniaturas e cache dos perfis (foto, nome, seguidores).

Local: os vídeos ficam em downloads/ e a miniatura é gerada do próprio arquivo.
Nuvem: só o catálogo (metadados) e a capa ficam guardados; o vídeo toca pelo player oficial.
"""
import re
import threading
import time
from urllib.parse import quote

from curl_cffi import requests

from . import armazenamento, instagram, tiktok
from .armazenamento import NUVEM
from .filtros import PASTA_DOWNLOADS, contas_com_metadados, ler_metadados
from .midia import chave_thumb, rodar_ffmpeg

CHAVE_PERFIS = "dados/perfis.json"
VALIDADE_PERFIL = 24 * 3600
_trava_perfis = threading.Lock()
RE_ARQUIVO = re.compile(r"^(\d{4}-\d{2}-\d{2}|sem-data)_(.+)\.mp4$")


def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _video(plataforma, conta, vid, r, arquivo=None, tamanho=0, data_arquivo=""):
    views, likes, coments = _num(r.get("views")), _num(r.get("likes")), _num(r.get("comentarios"))
    base = f"{plataforma}/{quote(conta)}"
    return {
        "plataforma": plataforma,
        "conta": conta,
        "id": vid,
        "arquivo": arquivo or "",
        "data": r.get("data") or data_arquivo,
        "url": r.get("url") or "",
        "views": views,
        "likes": likes,
        "comentarios": coments,
        "engajamento": round(((likes or 0) + (coments or 0)) / views * 100, 2) if views else None,
        "duracao": _num(r.get("duracao_s")),
        "legenda": r.get("legenda") or "",
        "tamanho": tamanho,
        "url_thumb": f"/thumb/{base}/{quote(vid)}",
        "url_video": f"/media/{base}/{quote(arquivo)}" if arquivo else None,
    }


def videos():
    """Todos os vídeos catalogados (local: os arquivos em downloads/; nuvem: o catálogo)."""
    saida = []
    if NUVEM:
        for plataforma, conta in contas_com_metadados():
            for vid, r in ler_metadados(plataforma, conta).items():
                saida.append(_video(plataforma, conta, vid, r))
    elif PASTA_DOWNLOADS.exists():
        for pasta_plat in PASTA_DOWNLOADS.iterdir():
            if not pasta_plat.is_dir():
                continue
            for pasta in pasta_plat.iterdir():
                if not pasta.is_dir():
                    continue
                meta = ler_metadados(pasta_plat.name, pasta.name)
                for arq in pasta.glob("*.mp4"):
                    m = RE_ARQUIVO.match(arq.name)
                    if m:
                        data = m.group(1) if m.group(1) != "sem-data" else ""
                        saida.append(_video(pasta_plat.name, pasta.name, m.group(2), meta.get(m.group(2), {}),
                                            arq.name, arq.stat().st_size, data))
    saida.sort(key=lambda v: v["data"], reverse=True)
    return saida


def resumo_por_conta():
    resumo = {}
    for v in videos():
        k = f"{v['plataforma']}/{v['conta']}"
        r = resumo.setdefault(k, {"videos": 0, "views": 0, "ultimo": ""})
        r["videos"] += 1
        r["views"] += v["views"] or 0
        r["ultimo"] = max(r["ultimo"], v["data"])
    return resumo


def miniatura(plataforma, conta, vid):
    """Bytes do JPG de capa. Local: gerado uma vez a partir do vídeo. Nuvem: a capa guardada."""
    if NUVEM:
        return armazenamento.imagem_ler(chave_thumb(plataforma, vid))
    pasta = PASTA_DOWNLOADS / plataforma / conta
    video = next(pasta.glob(f"*_{vid}.mp4"), None) if pasta.exists() else None
    if not video:
        return None
    thumb = pasta / ".thumbs" / (video.stem + ".jpg")
    if not thumb.exists():
        thumb.parent.mkdir(exist_ok=True)
        rodar_ffmpeg("-ss", "0.8", "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", thumb)
    return thumb.read_bytes() if thumb.exists() else None


# ---------------------------------------------------------------- perfis

def perfis():
    return armazenamento.ler_json(CHAVE_PERFIS, {}) or {}


def chave_avatar(plataforma, conta):
    return f"dados/avatares/{plataforma}_{conta}.jpg"


def atualizar_perfil(plataforma, conta, forcar=False):
    """Busca nome, foto e seguidores. A foto é guardada porque o link da CDN expira."""
    chave = f"{plataforma}/{conta}"
    atual = perfis().get(chave)
    if atual and not forcar and time.time() - atual.get("atualizado", 0) < VALIDADE_PERFIL:
        return atual
    mod = tiktok if plataforma == "tiktok" else instagram
    try:
        p = mod.perfil_publico(conta)
    except Exception:
        return atual
    if not p.get("nome") and not p.get("foto"):
        return atual  # a plataforma bloqueou o servidor: mantém o que já tinha
    dados = {"nome": p.get("nome"), "seguidores": p.get("seguidores"), "foto": None, "atualizado": time.time()}
    if p.get("foto"):
        try:
            img = requests.get(p["foto"], impersonate="chrome", timeout=30)
            if img.status_code == 200:
                armazenamento.imagem_gravar(chave_avatar(plataforma, conta), img.content)
                dados["foto"] = f"/avatar/{plataforma}/{conta}.jpg?v={int(dados['atualizado'])}"
        except Exception:
            pass
    with _trava_perfis:
        todos = perfis()
        todos[chave] = dados
        armazenamento.gravar_json(CHAVE_PERFIS, todos)
    return dados


def atualizar_perfis_em_segundo_plano(contas):
    def rodar():
        for c in contas:
            atualizar_perfil(c["plataforma"], c["conta"])
    threading.Thread(target=rodar, daemon=True).start()
