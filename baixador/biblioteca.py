"""Biblioteca de vídeos baixados, miniaturas e cache dos perfis (foto, nome, seguidores)."""
import json
import re
import subprocess
import threading
import time

from curl_cffi import requests

from . import instagram, tiktok
from .filtros import PASTA_DADOS, PASTA_DOWNLOADS, ler_planilha

ARQ_PERFIS = PASTA_DADOS / "perfis.json"
PASTA_AVATARES = PASTA_DADOS / "avatares"
VALIDADE_PERFIL = 24 * 3600
_trava_perfis = threading.Lock()
RE_ARQUIVO = re.compile(r"^(\d{4}-\d{2}-\d{2}|sem-data)_(.+)\.mp4$")


def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def videos():
    """Todos os vídeos em downloads/, com os metadados do _videos.csv quando houver."""
    saida = []
    if not PASTA_DOWNLOADS.exists():
        return saida
    for pasta_plat in PASTA_DOWNLOADS.iterdir():
        if not pasta_plat.is_dir():
            continue
        for pasta in pasta_plat.iterdir():
            if not pasta.is_dir():
                continue
            meta = ler_planilha(pasta)
            for arq in pasta.glob("*.mp4"):
                m = RE_ARQUIVO.match(arq.name)
                if not m:
                    continue
                vid = m.group(2)
                r = meta.get(vid, {})
                views, likes, coments = _num(r.get("views")), _num(r.get("likes")), _num(r.get("comentarios"))
                saida.append({
                    "plataforma": pasta_plat.name,
                    "conta": pasta.name,
                    "id": vid,
                    "arquivo": arq.name,
                    "data": r.get("data") or (m.group(1) if m.group(1) != "sem-data" else ""),
                    "url": r.get("url") or "",
                    "views": views,
                    "likes": likes,
                    "comentarios": coments,
                    "engajamento": round(((likes or 0) + (coments or 0)) / views * 100, 2) if views else None,
                    "duracao": _num(r.get("duracao_s")),
                    "legenda": r.get("legenda") or "",
                    "tamanho": arq.stat().st_size,
                })
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


def miniatura(plataforma, conta, arquivo):
    """Gera (uma vez) e devolve o caminho do JPG de capa do vídeo."""
    pasta = PASTA_DOWNLOADS / plataforma / conta
    video = pasta / arquivo
    if not video.exists() or video.suffix != ".mp4":
        return None
    thumb = pasta / ".thumbs" / (video.stem + ".jpg")
    if not thumb.exists():
        thumb.parent.mkdir(exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.8", "-i", str(video),
             "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(thumb)],
            check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    return thumb if thumb.exists() else None


# ---------------------------------------------------------------- perfis

def _ler_perfis():
    if ARQ_PERFIS.exists():
        return json.loads(ARQ_PERFIS.read_text(encoding="utf-8"))
    return {}


def perfis():
    return _ler_perfis()


def atualizar_perfil(plataforma, conta, forcar=False):
    """Busca nome, foto e seguidores. A foto é salva localmente porque o link da CDN expira."""
    chave = f"{plataforma}/{conta}"
    with _trava_perfis:
        atual = _ler_perfis().get(chave)
    if atual and not forcar and time.time() - atual.get("atualizado", 0) < VALIDADE_PERFIL:
        return atual
    mod = tiktok if plataforma == "tiktok" else instagram
    try:
        p = mod.perfil_publico(conta)
    except Exception:
        return atual
    dados = {"nome": p.get("nome"), "seguidores": p.get("seguidores"), "foto": None, "atualizado": time.time()}
    if p.get("foto"):
        try:
            PASTA_AVATARES.mkdir(parents=True, exist_ok=True)
            img = requests.get(p["foto"], impersonate="chrome", timeout=30)
            if img.status_code == 200:
                (PASTA_AVATARES / f"{plataforma}_{conta}.jpg").write_bytes(img.content)
                dados["foto"] = f"/avatar/{plataforma}/{conta}.jpg?v={int(dados['atualizado'])}"
        except Exception:
            pass
    with _trava_perfis:
        todos = _ler_perfis()
        todos[chave] = dados
        ARQ_PERFIS.write_text(json.dumps(todos, ensure_ascii=False, indent=1), encoding="utf-8")
    return dados


def atualizar_perfis_em_segundo_plano(contas):
    def rodar():
        for c in contas:
            atualizar_perfil(c["plataforma"], c["conta"])
    threading.Thread(target=rodar, daemon=True).start()
