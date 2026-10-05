"""Descoberta ampliada de Reels sem login.

Sem sessão, o Instagram mostra só os 12 Reels mais recentes do perfil. Para ir além:
1. Buscadores (Yahoo e DuckDuckGo) indexam URLs no formato instagram.com/<conta>/reel/<código>.
2. A página pública de cada Reel traz alguns outros posts do mesmo perfil.
Cada código encontrado é datado sem nenhuma requisição (o código é o id da mídia em base64,
e o id guarda o horário de criação). Depois validamos o dono e pegamos as métricas com o
yt-dlp, que lê um Reel avulso sem login.
"""
import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from curl_cffi import requests
from yt_dlp import YoutubeDL

ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
EPOCA_IG_MS = 1314220021721


def timestamp_do_codigo(codigo):
    pk = 0
    for ch in codigo[:11]:
        pk = pk * 64 + ALFABETO.index(ch)
    return ((pk >> 23) + EPOCA_IG_MS) / 1000


def _consultas(conta):
    return [
        f'site:instagram.com/{conta}/reel',
        f'site:instagram.com "{conta}" reel',
        f'site:instagram.com/reel "{conta}"',
        f'"{conta}" instagram reel',
        f'"@{conta}" reels',
    ]


def _buscar(conta, log, cancelado, paginas=5):
    padrao = re.compile(r"instagram\.com/(?:" + re.escape(conta) + r"/)?(?:reel|reels|p)/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")
    achados = set()
    s = requests.Session(impersonate="chrome")
    for q in _consultas(conta):
        for b in range(paginas):
            if cancelado():
                return achados
            try:
                r = s.get(f"https://search.yahoo.com/search?p={urllib.parse.quote(q)}&b={b * 10 + 1}", timeout=30)
                novos = set(padrao.findall(urllib.parse.unquote(r.text))) - achados
                achados |= novos
                if not novos and b > 0:
                    break
            except Exception:
                break
            time.sleep(1)
        try:
            r = s.post("https://html.duckduckgo.com/html/", data={"q": q}, timeout=30)
            achados |= set(padrao.findall(urllib.parse.unquote(r.text)))
        except Exception:
            pass
        time.sleep(1.2)
        log(f"Busca ampliada: {len(achados)} Reels candidatos...")
    return achados


def _rastrear(conta, sementes, cancelado, limite=20):
    """Visita páginas públicas de Reels e coleta outros posts do mesmo dono."""
    achados, visitados = set(sementes), set()
    s = requests.Session(impersonate="chrome")
    fila = list(sementes)
    while fila and len(visitados) < limite and not cancelado():
        c = fila.pop(0)
        if c in visitados:
            continue
        visitados.add(c)
        try:
            t = s.get(f"https://www.instagram.com/{conta}/reel/{c}/", timeout=30).text
        except Exception:
            continue
        for m in re.finditer(r'"code":"([A-Za-z0-9_-]{11})"', t):
            dono = re.search(r'"username":"([^"]+)"', t[m.start():m.start() + 4000])
            if dono and dono.group(1) == conta and m.group(1) not in achados:
                achados.add(m.group(1))
                fila.append(m.group(1))
        time.sleep(0.8)
    return achados - set(sementes)


def descobrir(conta, conhecidos, log, cancelado):
    """Códigos de Reels além dos que a página do perfil mostra."""
    log("Sem login o perfil mostra só 12 Reels; buscando mais em buscadores e páginas públicas...")
    codigos = _buscar(conta, log, cancelado)
    codigos |= _rastrear(conta, list(conhecidos)[:6], cancelado)
    return codigos - set(conhecidos)


class _Silencio:
    def debug(self, _): pass
    def info(self, _): pass
    def warning(self, _): pass
    def error(self, _): pass


def _ler_reel(codigo):
    with YoutubeDL({"quiet": True, "no_warnings": True, "logger": _Silencio()}) as ydl:
        return ydl.extract_info(f"https://www.instagram.com/reel/{codigo}/", download=False)


def validar(conta, codigos, log, cancelado, paralelo=3):
    """Confirma que cada Reel é da conta e traz curtidas, comentários, legenda e duração."""
    itens, feitos = [], [0]

    def um(c):
        if cancelado():
            return None
        try:
            info = _ler_reel(c)
        except Exception:
            return None
        finally:
            feitos[0] += 1
            if feitos[0] % 10 == 0:
                log(f"Validando Reels encontrados: {feitos[0]}/{len(codigos)}...")
        if (info.get("channel") or info.get("uploader") or "").lower() != conta.lower():
            return None  # é de outra conta que só citou o @
        if not any(f.get("vcodec") not in (None, "none") for f in info.get("formats") or []):
            return None  # foto ou carrossel sem vídeo
        return {
            "id": c,
            "url": f"https://www.instagram.com/reel/{c}/",
            "timestamp": info.get("timestamp") or timestamp_do_codigo(c),
            "views": info.get("view_count"),
            "likes": info.get("like_count"),
            "comentarios": info.get("comment_count"),
            "duracao": info.get("duration"),
            "legenda": info.get("description"),
            "_info": info,
        }

    with ThreadPoolExecutor(paralelo) as ex:
        for r in ex.map(um, codigos):
            if r:
                itens.append(r)
    return itens
