"""Instagram: listagem de Reels sem login (padrão) ou com sessão (opcional, histórico completo).

Sem login: a página pública /<conta>/reels/ traz embutidos os 12 Reels mais recentes
(código, views, likes e comentários). A paginação deslogada é bloqueada pelo próprio
Instagram (a consulta de continuação devolve node=null), então 12 é o teto sem login.
O download de cada Reel é feito pelo yt-dlp, que funciona sem login.

Com login (opcional): usa a API web com os cookies salvos em dados/ e pagina o perfil
inteiro, inclusive vídeos comuns do feed.
"""
import json
import re
import time

from curl_cffi import requests
from yt_dlp import YoutubeDL

from . import instagram_descoberta as descoberta
from .filtros import (MAX_FIXADOS, PASTA_DADOS, Cancelado, data_inicio_ts,
                      nome_arquivo, quantos_listar)

ARQ_COOKIES = PASTA_DADOS / "instagram_cookies.json"
PERFIL_NAVEGADOR = PASTA_DADOS / "navegador_instagram"
APP_ID = "936619743392459"
EPOCA_IG_MS = 1314220021721  # os ids de mídia do Instagram guardam o horário de criação


class SessaoInvalida(Exception):
    pass


def timestamp_do_pk(pk):
    return ((int(pk) >> 23) + EPOCA_IG_MS) / 1000


# ---------------------------------------------------------------- sessão (opcional)

def sessao_ativa():
    if not ARQ_COOKIES.exists():
        return None
    cookies = json.loads(ARQ_COOKIES.read_text(encoding="utf-8"))
    if not any(c["name"] == "sessionid" for c in cookies):
        return None
    return next((c["value"] for c in cookies if c["name"] == "ds_user"), None) or "conectado"


def desconectar():
    ARQ_COOKIES.unlink(missing_ok=True)


def conectar(log, tempo_max=600):
    """Abre uma janela do navegador para o usuário fazer login e salva os cookies."""
    from playwright.sync_api import sync_playwright

    PASTA_DADOS.mkdir(exist_ok=True)
    with sync_playwright() as p:
        args = dict(user_data_dir=str(PERFIL_NAVEGADOR), headless=False, viewport=None, locale="pt-BR")
        try:
            ctx = p.chromium.launch_persistent_context(channel="chrome", **args)
        except Exception:
            ctx = p.chromium.launch_persistent_context(**args)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.instagram.com/accounts/login/")
        log("Faça login na janela do navegador. Ela fecha sozinha depois.")

        limite, ok = time.time() + tempo_max, False
        while time.time() < limite:
            try:
                cookies = ctx.cookies("https://www.instagram.com")
            except Exception:
                break  # janela fechada pelo usuário
            if any(c["name"] == "sessionid" for c in cookies):
                time.sleep(3)  # deixa o Instagram terminar de gravar os demais cookies
                ARQ_COOKIES.write_text(json.dumps(ctx.cookies("https://www.instagram.com"), indent=1), encoding="utf-8")
                ok = True
                break
            time.sleep(2)
        try:
            ctx.close()
        except Exception:
            pass
    if not ok:
        raise SessaoInvalida("Login não concluído.")
    log("Instagram conectado.")


# ---------------------------------------------------------------- modo sem login

def _json_embutido(html, chave):
    """Extrai o objeto JSON embutido no HTML que contém `chave`."""
    i = html.find(f'"{chave}"')
    if i < 0:
        return None
    inicio = html.rfind('{"data"', 0, i)
    obj, _ = json.JSONDecoder().raw_decode(html[inicio:])
    pilha = [obj]
    while pilha:
        o = pilha.pop()
        if isinstance(o, dict):
            if chave in o:
                return o[chave]
            pilha.extend(o.values())
        elif isinstance(o, list):
            pilha.extend(o)
    return None


def _pagina_publica(conta, sub=""):
    r = requests.get(f"https://www.instagram.com/{conta}/{sub}", impersonate="chrome", timeout=30)
    if r.status_code == 404:
        raise ValueError("Perfil não encontrado.")
    return r.text


def perfil_publico(conta):
    """Nome, foto e seguidores, para os cards do painel (melhor esforço)."""
    html = _pagina_publica(conta)

    def campo(padrao):
        m = re.search(padrao, html)
        return json.loads(f'"{m.group(1)}"') if m else None

    seguidores = campo(r'"follower_count":(\d+)')
    return {
        "nome": campo(r'"full_name":"((?:[^"\\]|\\.)*)"'),
        "foto": campo(rf'"username":"{re.escape(conta)}","profile_pic_url":"((?:[^"\\]|\\.)*)"')
                or campo(r'"profile_pic_url":"((?:[^"\\]|\\.)*)"'),
        "seguidores": int(seguidores) if seguidores else None,
    }


def _listar_sem_login(conta, opcoes, log, cancelado=lambda: False):
    html = _pagina_publica(conta, "reels/")
    conexao = _json_embutido(html, "polaris_clips_connection")
    if conexao is None:
        if '"is_private":true' in html:
            raise ValueError("Perfil privado.")
        raise RuntimeError("O Instagram não devolveu os Reels agora (limite temporário). Tente de novo em alguns minutos.")
    itens = []
    for e in conexao.get("edges") or []:
        n = e["node"]
        itens.append({
            "id": n["code"],
            "url": f"https://www.instagram.com/reel/{n['code']}/",
            "timestamp": timestamp_do_pk(n["pk"]),
            "views": n.get("play_count"),
            "likes": n.get("like_count"),
            "comentarios": n.get("comment_count"),
            "duracao": None,
            "legenda": None,
        })
    if not conexao.get("page_info", {}).get("has_next_page") or not _precisa_de_mais(opcoes, len(itens)):
        return itens

    candidatos = descoberta.descobrir(conta, {i["id"] for i in itens}, log, cancelado)
    candidatos = _prefiltrar_por_data(candidatos, opcoes, len(itens))
    if candidatos:
        log(f"Validando {len(candidatos)} Reels encontrados (dono e métricas)...")
        extras = descoberta.validar(conta, candidatos, log, cancelado)
        log(f"Descoberta ampliada: +{len(extras)} Reels além dos 12 do perfil.")
        itens += extras
    return itens


def _precisa_de_mais(opcoes, tem):
    modo = opcoes.get("modo", "todos")
    if modo == "recentes":
        return int(opcoes.get("quantidade") or 10) > tem
    return modo in ("todos", "antigos", "mais_vistos", "periodo")


def _prefiltrar_por_data(codigos, opcoes, tem):
    """Usa a data embutida no código para validar só os candidatos que podem entrar no filtro."""
    datados = sorted(codigos, key=descoberta.timestamp_do_codigo, reverse=True)
    modo, n = opcoes.get("modo"), int(opcoes.get("quantidade") or 10)
    if modo == "recentes":
        return datados[: max(0, n - tem) * 2]  # folga para os que não forem da conta
    if modo == "antigos":
        return datados[::-1][: n * 2]
    if modo == "periodo":
        ini = data_inicio_ts(opcoes) or 0
        return [c for c in datados if descoberta.timestamp_do_codigo(c) >= ini]
    return datados


# ---------------------------------------------------------------- modo com login

def _cliente(conta):
    s = requests.Session(impersonate="chrome")
    for c in json.loads(ARQ_COOKIES.read_text(encoding="utf-8")):
        s.cookies.set(c["name"], c["value"], domain=c["domain"])
    s.headers.update({
        "x-ig-app-id": APP_ID,
        "x-requested-with": "XMLHttpRequest",
        "x-csrftoken": s.cookies.get("csrftoken", domain=".instagram.com") or "",
        "referer": f"https://www.instagram.com/{conta}/",
    })
    return s


def _get_json(s, url, log, cancelado):
    for tentativa in range(4):
        r = s.get(url, allow_redirects=False, timeout=30)
        if r.status_code == 200:
            try:
                return r.json()
            except ValueError:
                raise SessaoInvalida("Resposta inesperada do Instagram; reconecte a conta.")
        if r.status_code == 404:
            raise ValueError("Perfil não encontrado.")
        if r.status_code in (301, 302, 401, 403) and "wait" not in r.text.lower():
            raise SessaoInvalida("Sessão do Instagram expirou. Reconecte ou use o modo sem login.")
        espera = 60 * (tentativa + 1)
        log(f"Instagram limitou as requisições (HTTP {r.status_code}); aguardando {espera}s...")
        for _ in range(espera):
            if cancelado():
                raise Cancelado()
            time.sleep(1)
    raise RuntimeError("Instagram continua bloqueando as requisições; tente mais tarde.")


def _listar_com_login(conta, opcoes, log, cancelado, conhecido):
    s = _cliente(conta)
    perfil = _get_json(s, f"https://www.instagram.com/api/v1/users/web_profile_info/?username={conta}", log, cancelado)
    user = (perfil.get("data") or {}).get("user")
    if not user:
        raise ValueError("Perfil não encontrado.")
    if user.get("is_private") and not user.get("followed_by_viewer"):
        raise ValueError("Perfil privado.")

    limite = quantos_listar(opcoes)
    inicio = data_inicio_ts(opcoes)
    somente_reels = opcoes.get("somente_reels", True)
    itens, max_id, seguidos_parar = [], None, 0

    while True:
        if cancelado():
            raise Cancelado()
        url = f"https://www.instagram.com/api/v1/feed/user/{user['id']}/?count=33"
        if max_id:
            url += f"&max_id={max_id}"
        dados = _get_json(s, url, log, cancelado)

        for m in dados.get("items") or []:
            if m.get("media_type") != 2:  # só vídeos (1 = foto, 8 = carrossel)
                continue
            if somente_reels and m.get("product_type") != "clips":
                continue
            versoes = sorted(m.get("video_versions") or [], key=lambda v: v.get("width") or 0, reverse=True)
            item = {
                "id": m["code"],
                "url": f"https://www.instagram.com/reel/{m['code']}/",
                "video_url": versoes[0]["url"] if versoes else None,
                "timestamp": m.get("taken_at"),
                "views": m.get("play_count") or m.get("ig_play_count") or m.get("view_count"),
                "likes": m.get("like_count"),
                "comentarios": m.get("comment_count"),
                "duracao": m.get("video_duration"),
                "legenda": (m.get("caption") or {}).get("text"),
            }
            itens.append(item)
            antigo = inicio and (item["timestamp"] or 0) < inicio
            seguidos_parar = seguidos_parar + 1 if (antigo or conhecido(item["id"])) else 0

        log(f"{len(itens)} vídeos encontrados...")
        if (limite and len(itens) >= limite) or seguidos_parar > MAX_FIXADOS:
            break
        if not dados.get("more_available") or not dados.get("next_max_id"):
            break
        max_id = dados["next_max_id"]
        time.sleep(2)  # ritmo humano para não levar bloqueio
    return itens


def listar(conta, opcoes, log, cancelado, conhecido=lambda _id: False):
    if sessao_ativa():
        try:
            return _listar_com_login(conta, opcoes, log, cancelado, conhecido)
        except SessaoInvalida as e:
            log(f"{e} Usando o modo sem login.")
    return _listar_sem_login(conta, opcoes, log, cancelado)


# ---------------------------------------------------------------- download

def baixar(item, pasta, cancelado):
    destino = pasta / nome_arquivo(item)
    if destino.exists():
        return "pulado"
    if item.get("video_url"):
        _baixar_direto(item["video_url"], destino, cancelado)
    else:
        _baixar_ytdlp(item, destino, cancelado)
    time.sleep(1)
    return "baixado"


def _baixar_direto(url, destino, cancelado):
    parcial = destino.with_suffix(".part")
    r = requests.get(url, impersonate="chrome", stream=True, timeout=120)
    r.raise_for_status()
    try:
        with open(parcial, "wb") as f:
            for bloco in r.iter_content():
                if cancelado():
                    raise Cancelado()
                f.write(bloco)
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    parcial.replace(destino)


def _baixar_ytdlp(item, destino, cancelado):
    def checar(_):
        if cancelado():
            raise Cancelado()

    opts = {
        "quiet": True, "no_warnings": True, "noprogress": True,
        "outtmpl": str(destino.with_suffix("")) + ".%(ext)s",
        "format": "bv*+ba/b", "merge_output_format": "mp4",
        "progress_hooks": [checar], "retries": 5,
    }
    with YoutubeDL(opts) as ydl:
        if item.get("_info"):  # já lido na validação da descoberta ampliada
            info = ydl.process_ie_result(item.pop("_info"), download=True)
        else:
            info = ydl.extract_info(item["url"], download=True)
    # o modo sem login não traz legenda nem duração; completa com o que o yt-dlp obteve
    item["legenda"] = item.get("legenda") or info.get("description")
    item["duracao"] = item.get("duracao") or info.get("duration")
