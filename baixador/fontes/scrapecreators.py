"""ScrapeCreators: perfil completo do Instagram (todos os posts, com views), comentários (IG e TikTok).

Cobrança por chamada (1 crédito na maioria). Posts do Instagram vêm de 12 em 12 com paginação.
Sem a chave SCRAPECREATORS_API_KEY o app continua com as fontes gratuitas (yt-dlp e busca ampliada).
"""
import os
import time

from curl_cffi import requests

from ..filtros import MAX_FIXADOS, Cancelado

BASE = "https://api.scrapecreators.com"


class ErroFonte(RuntimeError):
    pass


def ativo():
    return bool(os.getenv("SCRAPECREATORS_API_KEY"))


def _get(caminho, **params):
    for tentativa in range(3):
        r = requests.get(BASE + caminho, params={k: v for k, v in params.items() if v is not None},
                         headers={"x-api-key": os.getenv("SCRAPECREATORS_API_KEY", "")}, timeout=90)
        if r.status_code == 200:
            from .. import custos
            custos.registrar("scrapecreators", creditos=1)
            return r.json()
        if r.status_code == 402:
            marcar_sem_credito()
            raise ErroFonte("A API de dados (ScrapeCreators) está sem créditos. Recarregue em app.scrapecreators.com.")
        if r.status_code in (401, 403):
            raise ErroFonte(f"ScrapeCreators recusou a chamada ({r.status_code}): verifique a chave.")
        if r.status_code == 404:
            raise ValueError("Perfil ou post não encontrado.")
        time.sleep(3 * (tentativa + 1))
    raise ErroFonte(f"ScrapeCreators indisponível agora ({r.status_code}).")


# ---------------------------------------------------------------- saldo (para avisar na interface em vez de falhar calado)

_saldo_cache = {"ts": 0.0, "valor": None}


def marcar_sem_credito():
    _saldo_cache.update(ts=time.time(), valor=0)


def saldo(max_idade=600):
    """Créditos restantes (cache de 10 min). None = não deu para saber."""
    if not ativo():
        return None
    if time.time() - _saldo_cache["ts"] < max_idade:
        return _saldo_cache["valor"]
    try:
        r = requests.get(BASE + "/v1/credit-balance", headers={"x-api-key": os.getenv("SCRAPECREATORS_API_KEY", "")}, timeout=15)
        valor = r.json().get("creditCount") if r.status_code == 200 else None
    except Exception:
        valor = None
    _saldo_cache.update(ts=time.time(), valor=valor)
    return valor


def com_credito():
    s = saldo()
    return ativo() and (s is None or s > 0)


# ---------------------------------------------------------------- busca de perfis

def _usuarios(no, plataforma, saida):
    """Acha objetos de usuário em qualquer formato de resposta (a API muda a forma às vezes)."""
    if isinstance(no, dict):
        handle = no.get("username") if plataforma == "instagram" else (no.get("unique_id") or no.get("uniqueId"))
        if handle and isinstance(handle, str):
            foto = no.get("profile_pic_url_hd") or no.get("profile_pic_url")
            if not foto:
                av = no.get("avatar_thumb") or no.get("avatar_medium") or no.get("avatarThumb") or {}
                foto = (av.get("url_list") or [None])[0] if isinstance(av, dict) else av
            seg = no.get("follower_count") or no.get("followerCount") or (no.get("edge_followed_by") or {}).get("count")
            saida.append({"plataforma": plataforma, "conta": handle.lower(), "nome": no.get("full_name") or no.get("nickname"),
                          "foto": foto, "seguidores": seg,
                          "verificado": bool(no.get("is_verified") or no.get("verified") or no.get("custom_verify"))})
            return
        for v in no.values():
            _usuarios(v, plataforma, saida)
    elif isinstance(no, list):
        for v in no:
            _usuarios(v, plataforma, saida)


def buscar_perfis(plataforma, termo):
    caminho = "/v1/instagram/search" if plataforma == "instagram" else "/v1/tiktok/search/users"
    saida = []
    _usuarios(_get(caminho, query=termo), plataforma, saida)
    vistos, unicos = set(), []
    for u in saida:
        if u["conta"] not in vistos:
            vistos.add(u["conta"])
            unicos.append(u)
    return unicos[:8]


# ---------------------------------------------------------------- Instagram

def perfil_instagram(conta):
    u = (_get("/v1/instagram/profile", handle=conta).get("data") or {}).get("user") or {}
    if not u:
        raise ValueError("Perfil não encontrado.")
    return {
        "nome": u.get("full_name"),
        "foto": u.get("profile_pic_url_hd") or u.get("profile_pic_url"),
        "seguidores": (u.get("edge_followed_by") or {}).get("count"),
        "perfil": {
            "bio": u.get("biography"),
            "links": [{"titulo": l.get("title"), "url": l.get("url")} for l in u.get("bio_links") or []]
                     or ([{"titulo": None, "url": u["external_url"]}] if u.get("external_url") else []),
            "categoria": u.get("category_name") or u.get("business_category_name"),
            "seguindo": (u.get("edge_follow") or {}).get("count"),
            "verificado": u.get("is_verified"),
            "comercial": u.get("is_business_account"),
            "destaques": u.get("highlight_reel_count"),
            "privado": u.get("is_private"),
        },
    }


def _tipo_ig(m):
    if m.get("media_type") == 8:
        return "carrossel"
    if m.get("media_type") == 1:
        return "foto"
    return "reel" if m.get("product_type") == "clips" else "video"


def _item_ig(m, fixados):
    tipo = _tipo_ig(m)
    capa = ((m.get("image_versions2") or {}).get("candidates") or [{}])[0].get("url")
    imagens = []
    for c in (m.get("carousel_media") or [])[:10]:
        url = ((c.get("image_versions2") or {}).get("candidates") or [{}])[0].get("url")
        if url:
            imagens.append(url)
    if tipo == "carrossel" and not capa and imagens:
        capa = imagens[0]
    return {
        "id": m["code"],
        "url": f"https://www.instagram.com/{'reel' if tipo == 'reel' else 'p'}/{m['code']}/",
        "timestamp": m.get("taken_at"),
        "tipo": tipo,
        "views": m.get("ig_play_count") or m.get("play_count") or m.get("view_count"),
        "likes": m.get("like_count"),
        "comentarios": m.get("comment_count"),
        "duracao": m.get("video_duration"),
        "legenda": (m.get("caption") or {}).get("text") if isinstance(m.get("caption"), dict) else m.get("caption"),
        "capa": capa,
        "extra": {
            "parceria_paga": bool(m.get("is_paid_partnership")),
            "coautores": [c.get("username") for c in m.get("coauthor_producers") or [] if c.get("username")],
            "fixado": str(m.get("id") or m.get("pk")) in fixados or str(m.get("pk")) in fixados,
            "n_imagens": len(m.get("carousel_media") or []) or None,
        },
        "_imagens": imagens,
    }


def posts_instagram(conta, opcoes, log, cancelado, conhecido, inicio_ts=None, limite=None):
    """Todos os posts (Reels, vídeos, carrosséis e fotos), paginando até o filtro pedir para parar."""
    somente_reels = opcoes.get("somente_reels")
    itens, cursor, paginas, seguidos_parar = [], None, 0, 0
    while True:
        if cancelado():
            raise Cancelado()
        d = _get("/v2/instagram/user/posts", handle=conta, next_max_id=cursor)
        paginas += 1
        fixados = {str(x) for x in d.get("pinned_profile_grid_items_ids") or []}
        for m in d.get("items") or []:
            item = _item_ig(m, fixados)
            antigo = inicio_ts and (item["timestamp"] or 0) < inicio_ts
            seguidos_parar = seguidos_parar + 1 if (antigo or conhecido(item["id"])) else 0
            if somente_reels and item["tipo"] not in ("reel", "video"):
                continue
            itens.append(item)
        log(f"{len(itens)} posts encontrados ({paginas} páginas)...")
        cursor = d.get("next_max_id")
        if not d.get("more_available") or not cursor:
            break
        if (limite and len(itens) >= limite) or seguidos_parar > MAX_FIXADOS:
            break
    return itens


def post_instagram(codigo):
    """Detalhe de um post (para pegar as imagens atualizadas de um carrossel)."""
    d = _get("/v1/instagram/post", url=f"https://www.instagram.com/p/{codigo}/")
    m = (d.get("data") or {}).get("xdt_shortcode_media") or d.get("data") or d
    imagens = []
    for e in ((m.get("edge_sidecar_to_children") or {}).get("edges") or [])[:10]:
        n = e.get("node") or {}
        if n.get("display_url"):
            imagens.append(n["display_url"])
    for c in (m.get("carousel_media") or [])[:10]:
        url = ((c.get("image_versions2") or {}).get("candidates") or [{}])[0].get("url")
        if url:
            imagens.append(url)
    if not imagens and m.get("display_url"):
        imagens = [m["display_url"]]
    return imagens


# ---------------------------------------------------------------- comentários

def comentarios(plataforma, url, limite=40):
    """Comentários mais relevantes de um post: [{id, texto, likes, respostas, timestamp}]."""
    saida, cursor = [], None
    while len(saida) < limite:
        if plataforma == "instagram":
            d = _get("/v2/instagram/post/comments", url=url, cursor=cursor)
            for c in d.get("comments") or []:
                saida.append({"id": c.get("id"), "texto": c.get("text"), "likes": c.get("comment_like_count"),
                              "respostas": c.get("child_comment_count"),
                              "timestamp": _ts(c.get("created_at"))})
        else:
            d = _get("/v1/tiktok/video/comments", url=url, cursor=cursor)
            for c in d.get("comments") or []:
                saida.append({"id": c.get("cid"), "texto": c.get("text"), "likes": c.get("digg_count"),
                              "respostas": c.get("reply_comment_total"), "timestamp": c.get("create_time")})
        cursor = d.get("cursor")
        if not cursor or not (d.get("comments") or []) or (plataforma == "tiktok" and not d.get("has_more")):
            break
    return [c for c in saida if c["id"]][:limite]


def _ts(valor):
    if isinstance(valor, (int, float)):
        return valor
    if isinstance(valor, str):
        from datetime import datetime
        try:
            return datetime.fromisoformat(valor.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None
