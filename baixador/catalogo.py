"""Catálogo compartilhado: contas sociais e seus posts (um registro por post, para todos os usuários)."""
from datetime import datetime, timezone

from . import db


def conta_id(plataforma, conta, criar=True):
    r = db.um("select id from contas where plataforma = %s and conta = %s", plataforma, conta)
    if r or not criar:
        return r["id"] if r else None
    r = db.um("""insert into contas (plataforma, conta) values (%s, %s)
                 on conflict (plataforma, conta) do update set conta = excluded.conta returning id""", plataforma, conta)
    return r["id"]


def conta(cid):
    return db.um("select * from contas where id = %s", cid)


def atualizar_perfil(plataforma, conta_nome, nome=None, seguidores=None, foto_versao=None, perfil=None):
    cid = conta_id(plataforma, conta_nome)
    db.executar("""update contas set nome = coalesce(%s, nome), seguidores = coalesce(%s, seguidores),
                   foto_versao = coalesce(%s, foto_versao), perfil = perfil || %s, atualizado_em = now()
                   where id = %s""", nome, seguidores, foto_versao, perfil or {}, cid)
    return cid


def _data(item):
    ts = item.get("timestamp")
    return datetime.fromtimestamp(ts, timezone.utc) if ts else None


def salvar_posts(plataforma, conta_nome, itens):
    """Insere ou atualiza posts (métricas novas sobrescrevem; campos vazios não apagam os antigos)."""
    cid = conta_id(plataforma, conta_nome)
    for i in itens:
        db.executar("""
            insert into posts (conta_id, plataforma, codigo, url, publicado_em, tipo, legenda, duracao, views, likes, comentarios, extra)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (plataforma, codigo) do update set
              url = coalesce(excluded.url, posts.url),
              publicado_em = coalesce(excluded.publicado_em, posts.publicado_em),
              tipo = coalesce(excluded.tipo, posts.tipo),
              legenda = coalesce(nullif(excluded.legenda, ''), posts.legenda),
              duracao = coalesce(excluded.duracao, posts.duracao),
              views = coalesce(excluded.views, posts.views),
              likes = coalesce(excluded.likes, posts.likes),
              comentarios = coalesce(excluded.comentarios, posts.comentarios),
              extra = posts.extra || excluded.extra,
              atualizado_em = now()""",
            cid, plataforma, str(i["id"]), i.get("url"), _data(i), i.get("tipo") or "video",
            " ".join((i.get("legenda") or "").split()) or None,
            round(i["duracao"]) if i.get("duracao") else None,
            i.get("views"), i.get("likes"), i.get("comentarios"), i.get("extra") or {})


def codigos_conhecidos(plataforma, conta_nome):
    cid = conta_id(plataforma, conta_nome, criar=False)
    if not cid:
        return set()
    return {r["codigo"] for r in db.todos("select codigo from posts where conta_id = %s", cid)}


def post_id(plataforma, codigo):
    r = db.um("select id from posts where plataforma = %s and codigo = %s", plataforma, codigo)
    return r["id"] if r else None
