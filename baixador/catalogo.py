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
    if seguidores is not None:
        db.executar("""insert into metricas_contas (conta_id, dia, seguidores, posts) values (%s, current_date, %s, %s)
                       on conflict (conta_id, dia) do update set seguidores = excluded.seguidores,
                       posts = coalesce(excluded.posts, metricas_contas.posts)""",
                    cid, seguidores, (perfil or {}).get("total_posts"))
    return cid


def _data(item):
    ts = item.get("timestamp")
    return datetime.fromtimestamp(ts, timezone.utc) if ts else None


def salvar_posts(plataforma, conta_nome, itens):
    """Insere ou atualiza posts (métricas novas sobrescrevem; campos vazios não apagam os antigos)
    e guarda a foto do dia das métricas, para acompanhar a evolução de cada post."""
    cid = conta_id(plataforma, conta_nome)
    for i in itens:
        r = db.um("""
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
              atualizado_em = now()
            returning id, views, likes, comentarios""",
            cid, plataforma, str(i["id"]), i.get("url"), _data(i), i.get("tipo") or "video",
            " ".join((i.get("legenda") or "").split()) or None,
            round(i["duracao"]) if i.get("duracao") else None,
            i.get("views"), i.get("likes"), i.get("comentarios"), i.get("extra") or {})
        if any(r[k] is not None for k in ("views", "likes", "comentarios")):
            db.executar("""insert into metricas_posts (post_id, dia, views, likes, comentarios) values (%s, current_date, %s, %s, %s)
                           on conflict (post_id, dia) do update set views = excluded.views, likes = excluded.likes,
                           comentarios = excluded.comentarios""", r["id"], r["views"], r["likes"], r["comentarios"])


def codigos_conhecidos(plataforma, conta_nome):
    cid = conta_id(plataforma, conta_nome, criar=False)
    if not cid:
        return set()
    return {r["codigo"] for r in db.todos("select codigo from posts where conta_id = %s", cid)}


def post_id(plataforma, codigo):
    r = db.um("select id from posts where plataforma = %s and codigo = %s", plataforma, codigo)
    return r["id"] if r else None


# ---------------------------------------------------------------- comentários

def salvar_comentarios(plataforma, codigo, comentarios):
    pid = post_id(plataforma, codigo)
    if not pid:
        return 0
    for c in comentarios:
        db.executar("""insert into comentarios (post_id, externo_id, texto, likes, respostas, publicado_em)
                       values (%s, %s, %s, %s, %s, to_timestamp(%s))
                       on conflict (post_id, externo_id) do update set likes = excluded.likes, respostas = excluded.respostas""",
                    pid, str(c["id"]), c.get("texto"), c.get("likes"), c.get("respostas"), c.get("timestamp"))
    db.executar("update posts set extra = extra || %s where id = %s", {"comentarios_coletados": len(comentarios)}, pid)
    return len(comentarios)


def comentarios(plataforma, codigo, limite=60):
    return db.todos("""select c.texto, c.likes, c.respostas, c.publicado_em from comentarios c
                       join posts p on p.id = c.post_id where p.plataforma = %s and p.codigo = %s
                       order by c.likes desc nulls last limit %s""", plataforma, codigo, limite)


def comentarios_da_conta(conta_id_, limite=200):
    """Comentários mais curtidos dos posts de uma conta (matéria-prima da voz do público)."""
    return db.todos("""select p.codigo, c.texto, c.likes from comentarios c join posts p on p.id = c.post_id
                       where p.conta_id = %s and length(coalesce(c.texto, '')) > 3
                       order by c.likes desc nulls last limit %s""", conta_id_, limite)


def evolucao_seguidores(conta_id_):
    return db.todos("select dia, seguidores from metricas_contas where conta_id = %s order by dia", conta_id_)
