"""Busca de perfis para adicionar (concorrente ou referência), com prévia: foto, nome, seguidores.

Ordem das fontes (a interface não sabe de onde vem):
1. API de dados (ScrapeCreators) — busca de verdade no Instagram e no TikTok, quando há crédito;
2. sem crédito: checagem do @ exato (TikTok de graça; Instagram fora da nuvem) + busca na web por perfis
   com aquele nome (só o @, sem prévia).
Resultados ficam em cache por 6 h para não gastar crédito com a mesma digitação.
"""
import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from curl_cffi import requests

from . import instagram, tiktok
from .armazenamento import NUVEM
from .fontes import scrapecreators

_cache = {}
VALIDADE = 6 * 3600
HANDLE = re.compile(r"^[a-z0-9._]{2,30}$")
RESERVADAS = {"p", "reel", "reels", "explore", "stories", "accounts", "tv", "about", "legal", "developer", "tag", "music", "discover"}


def _foto(u):
    """As fotos das CDNs expiram e bloqueiam outros sites: passam pelo nosso proxy."""
    return f"/api/foto-externa?u={urllib.parse.quote(u, safe='')}" if u else None


def _exato(plataforma, conta):
    try:
        p = (tiktok if plataforma == "tiktok" else instagram).perfil_publico(conta)
    except Exception:
        return None
    if not p or not (p.get("nome") or p.get("foto") or p.get("seguidores")):
        return None
    return {"plataforma": plataforma, "conta": conta, "nome": p.get("nome"), "foto": p.get("foto"),
            "seguidores": p.get("seguidores"), "verificado": False, "exato": True}


def _na_web(termo):
    """Perfis com esse nome em buscadores (só o @, sem métricas)."""
    achados = []
    padroes = [("instagram", re.compile(r"instagram\.com/([A-Za-z0-9._]{2,30})/?(?=[\"'?&<\s]|$)")),
               ("tiktok", re.compile(r"tiktok\.com/@([A-Za-z0-9._]{2,30})"))]
    try:
        html = requests.post("https://html.duckduckgo.com/html/",
                             data={"q": f"{termo} (site:instagram.com OR site:tiktok.com)"}, impersonate="chrome", timeout=12).text
        html = urllib.parse.unquote(html)
        for plataforma, rx in padroes:
            for conta in rx.findall(html):
                conta = conta.lower().rstrip(".")
                if conta not in RESERVADAS and (plataforma, conta) not in {(a["plataforma"], a["conta"]) for a in achados}:
                    achados.append({"plataforma": plataforma, "conta": conta, "nome": None, "foto": None,
                                    "seguidores": None, "verificado": False, "web": True})
    except Exception:
        pass
    return achados[:6]


def buscar(termo, plataforma=None):
    termo = (termo or "").strip()
    if len(termo) < 2:
        return {"resultados": [], "limitada": False}
    chave = f"{plataforma}:{termo.lower()}"
    if chave in _cache and time.time() - _cache[chave][0] < VALIDADE:
        return _cache[chave][1]
    handle = termo.lstrip("@").lower().replace(" ", "")
    plataformas = [plataforma] if plataforma else ["instagram", "tiktok"]
    resultados, limitada = [], False

    with ThreadPoolExecutor(max_workers=4) as pool:
        if scrapecreators.com_credito():
            buscas = {p: pool.submit(scrapecreators.buscar_perfis, p, termo) for p in plataformas}
            for p, f in buscas.items():
                try:
                    resultados += f.result(timeout=25)
                except Exception:
                    limitada = True
        else:
            limitada = True
        if limitada or not resultados:
            exatos = [pool.submit(_exato, p, handle) for p in plataformas
                      if HANDLE.match(handle) and not (p == "instagram" and NUVEM and not scrapecreators.com_credito())]
            web = pool.submit(_na_web, termo)
            for f in exatos:
                try:
                    r = f.result(timeout=20)
                    if r:
                        resultados.insert(0, r)
                except Exception:
                    pass
            try:
                resultados += [w for w in web.result(timeout=15) if not plataforma or w["plataforma"] == plataforma]
            except Exception:
                pass

    # o @ exato primeiro; sem duplicados
    vistos, unicos = set(), []
    for r in sorted(resultados, key=lambda r: (r["conta"] != handle, r.get("web", False), -(r.get("seguidores") or 0))):
        k = (r["plataforma"], r["conta"])
        if k not in vistos:
            vistos.add(k)
            unicos.append({**r, "foto": _foto(r.get("foto"))})
    saida = {"resultados": unicos[:10], "limitada": limitada}
    _cache[chave] = (time.time(), saida)
    return saida


HOSTS_FOTO = ("cdninstagram.com", "fbcdn.net", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "muscdn.com", "ibyteimg.com")


def baixar_foto(url):
    """Proxy restrito às CDNs de foto de perfil (não é um proxy aberto)."""
    host = urllib.parse.urlparse(url).hostname or ""
    if not any(host == h or host.endswith("." + h) for h in HOSTS_FOTO):
        raise ValueError("Origem não permitida.")
    r = requests.get(url, impersonate="chrome", timeout=15)
    if r.status_code != 200:
        raise ValueError("Foto indisponível.")
    return r.content, r.headers.get("content-type", "image/jpeg")
