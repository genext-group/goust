"""Biblioteca do usuário: posts das contas que ele acompanha, miniaturas e perfis (foto, nome, seguidores).

Os dados vêm do catálogo compartilhado no banco. No modo local, se o arquivo do vídeo existir em
downloads/, ele toca direto; senão (e sempre na nuvem) toca pelo player oficial da plataforma.
"""
import threading
import time
from urllib.parse import quote

from curl_cffi import requests

from . import armazenamento, catalogo, contexto, db, instagram, tiktok
from .armazenamento import NUVEM
from .filtros import PASTA_DOWNLOADS
from .midia import chave_thumb, rodar_ffmpeg

VALIDADE_PERFIL = 24 * 3600


def _arquivo_local(plataforma, conta, codigo):
    if NUVEM:
        return None
    pasta = PASTA_DOWNLOADS / plataforma / conta
    return next(pasta.glob(f"*_{codigo}.mp4"), None) if pasta.exists() else None


def _video(r):
    views, likes, coments = r["views"], r["likes"], r["comentarios"]
    arquivo = _arquivo_local(r["plataforma"], r["conta"], r["codigo"])
    base = f"{r['plataforma']}/{quote(r['conta'])}"
    return {
        "plataforma": r["plataforma"],
        "conta": r["conta"],
        "id": r["codigo"],
        "arquivo": arquivo.name if arquivo else "",
        "data": r["publicado_em"].strftime("%Y-%m-%d %H:%M") if r["publicado_em"] else "",
        "url": r["url"] or "",
        "tipo": r["tipo"],
        "views": views,
        "likes": likes,
        "comentarios": coments,
        "engajamento": round(((likes or 0) + (coments or 0)) / views * 100, 2) if views else None,
        "duracao": r["duracao"],
        "legenda": r["legenda"] or "",
        "tamanho": arquivo.stat().st_size if arquivo else 0,
        "url_thumb": f"/thumb/{base}/{quote(r['codigo'])}",
        "url_video": f"/media/{base}/{quote(arquivo.name)}" if arquivo else None,
    }


def videos(plataforma=None, conta=None):
    """Posts das contas acompanhadas pelo usuário atual (opcionalmente de uma conta só)."""
    filtro, params = "", [contexto.usuario()]
    if plataforma and conta:
        filtro, params = " and c.plataforma = %s and c.conta = %s", params + [plataforma, conta]
    linhas = db.todos(f"""
        select p.*, c.conta from posts p
        join contas c on c.id = p.conta_id
        join acompanhamentos a on a.conta_id = c.id and a.usuario_id = %s
        where true {filtro}
        order by p.publicado_em desc nulls last""", *params)
    return [_video(r) for r in linhas]


def resumo_por_conta():
    linhas = db.todos("""
        select c.plataforma, c.conta, count(p.id) as videos, coalesce(sum(p.views), 0) as views,
               max(p.publicado_em) as ultimo
        from acompanhamentos a join contas c on c.id = a.conta_id
        left join posts p on p.conta_id = c.id
        where a.usuario_id = %s group by c.plataforma, c.conta""", contexto.usuario())
    return {f"{r['plataforma']}/{r['conta']}": {"videos": r["videos"], "views": int(r["views"]),
                                                  "ultimo": r["ultimo"].strftime("%Y-%m-%d") if r["ultimo"] else ""}
            for r in linhas}


def miniatura(plataforma, conta, vid):
    """Bytes do JPG de capa: a capa guardada; no modo local, gerada do arquivo se não houver."""
    dados = armazenamento.imagem_ler(chave_thumb(plataforma, vid))
    if dados:
        return dados
    if NUVEM:
        return _recuperar_capa(plataforma, conta, vid)
    video = _arquivo_local(plataforma, conta, vid)
    if not video:
        return None
    thumb = video.parent / ".thumbs" / (video.stem + ".jpg")
    if not thumb.exists():
        thumb.parent.mkdir(exist_ok=True)
        rodar_ffmpeg("-ss", "0.8", "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", thumb)
    return thumb.read_bytes() if thumb.exists() else None


def _recuperar_capa(plataforma, conta, vid):
    """Capa que não veio na coleta: busca uma vez (no máximo a cada 3 dias por post, para não gastar à toa)."""
    from . import db, midia
    p = db.um("""select p.id, p.url, p.extra->>'capa_tentada' as tentada from posts p join contas c on c.id = p.conta_id
                 where c.plataforma = %s and c.conta = %s and p.codigo = %s""", plataforma, conta, vid)
    if not p:
        return None
    import time
    if p["tentada"] and time.time() - float(p["tentada"]) < 3 * 86400:
        return None
    db.executar("update posts set extra = jsonb_set(coalesce(extra, '{}'), '{capa_tentada}', to_jsonb(%s::float)) where id = %s",
                time.time(), p["id"])
    return midia.recuperar_capa(plataforma, vid, p["url"] or (f"https://www.instagram.com/p/{vid}/" if plataforma == "instagram"
                                                            else f"https://www.tiktok.com/@{conta}/video/{vid}"))


# ---------------------------------------------------------------- perfis (catálogo compartilhado)

def chave_avatar(plataforma, conta):
    return f"dados/avatares/{plataforma}_{conta}.jpg"


def perfis():
    """{plataforma/conta: {nome, foto, seguidores}} das contas acompanhadas pelo usuário."""
    linhas = db.todos("""select c.* from contas c join acompanhamentos a on a.conta_id = c.id
                         where a.usuario_id = %s""", contexto.usuario())
    return {f"{r['plataforma']}/{r['conta']}": {
        "nome": r["nome"], "seguidores": r["seguidores"],
        "foto": f"/avatar/{r['plataforma']}/{quote(r['conta'])}.jpg?v={r['foto_versao']}" if r["foto_versao"] else None,
        "atualizado": r["atualizado_em"].timestamp() if r["atualizado_em"] else 0,
    } for r in linhas}


def atualizar_perfil(plataforma, conta, forcar=False):
    """Busca nome, foto e seguidores (a foto é guardada porque o link da CDN expira)."""
    r = db.um("select * from contas where plataforma = %s and conta = %s", plataforma, conta)
    if r and r["atualizado_em"] and not forcar and time.time() - r["atualizado_em"].timestamp() < VALIDADE_PERFIL:
        return
    mod = tiktok if plataforma == "tiktok" else instagram
    try:
        p = mod.perfil_publico(conta)
    except Exception:
        return
    if not p.get("nome") and not p.get("foto"):
        return  # a plataforma bloqueou o servidor: mantém o que já tinha
    versao = None
    if p.get("foto"):
        try:
            img = requests.get(p["foto"], impersonate="chrome", timeout=30)
            if img.status_code == 200:
                armazenamento.imagem_gravar(chave_avatar(plataforma, conta), img.content)
                versao = int(time.time())
        except Exception:
            pass
    catalogo.atualizar_perfil(plataforma, conta, nome=p.get("nome"), seguidores=p.get("seguidores"), foto_versao=versao,
                              perfil=p.get("perfil"))


def atualizar_perfis_em_segundo_plano(contas):
    def rodar():
        for c in contas:
            atualizar_perfil(c["plataforma"], c["conta"])
    threading.Thread(target=rodar, daemon=True).start()
