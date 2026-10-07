"""Marcas: as contas da mesma marca em plataformas diferentes (ex.: @pierre.finance.ai no TikTok e no Instagram)
viram uma unidade só para o usuário: um cartão, um papel, um contexto e uma análise conjunta.

Agrupamento automático pelo @ normalizado (sem pontuação e sem sufixos como .app, .ai, oficial) ou pelo nome;
o usuário pode unir e separar à mão. Conta separada à mão (`agrupar = false`) nunca é reagrupada sozinha.
"""
import re
import unicodedata

from . import contexto as ctx
from . import db

SUFIXOS = ("oficial", "official", "app", "ai", "ia", "com", "br", "brasil", "tv", "hq", "_")


def _sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")


def chave_handle(conta):
    """@meu.jota e @meujota → 'meujota'; @meuassessor.com e @meuassessor.ia → 'meuassessor'."""
    partes = [p for p in re.split(r"[._\-]+", (conta or "").lower()) if p]
    while len(partes) > 1 and partes[-1] in SUFIXOS:
        partes.pop()
    base = "".join(partes)
    for s in ("oficial", "official"):
        if base.endswith(s) and len(base) > len(s) + 2:
            base = base[: -len(s)]
    return base


def chave_nome(nome):
    n = re.sub(r"[^a-z0-9]", "", _sem_acento(nome).lower().split("|")[0].split(" - ")[0])
    return n if len(n) >= 4 else None


def _contas_do_usuario(uid):
    return db.todos("""select a.conta_id, a.papel, a.marca_id, a.agrupar, c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome
                       from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s""", uid)


def sincronizar(uid=None):
    """Agrupa automaticamente contas da mesma marca (uma por plataforma). Idempotente e barato (só SQL)."""
    uid = uid or ctx.usuario()
    contas = _contas_do_usuario(uid)
    soltas = [c for c in contas if not c["marca_id"] and c["agrupar"]]
    if len(soltas) < 1:
        return
    por_marca = {}
    for c in contas:
        if c["marca_id"]:
            por_marca.setdefault(c["marca_id"], []).append(c)
    for c in soltas:
        if c["marca_id"]:
            continue
        kh, kn = chave_handle(c["conta"]), chave_nome(c["nome"])
        # 1) já existe marca com par compatível (outra plataforma, mesmo papel "família")
        alvo = None
        for mid, membros in por_marca.items():
            if any(m["plataforma"] == c["plataforma"] for m in membros):
                continue
            if any(m["agrupar"] and (chave_handle(m["conta"]) == kh or (kn and chave_nome(m["nome"]) == kn)) for m in membros):
                alvo = mid
                break
        # 2) outra conta solta compatível em outra plataforma
        par = None
        if not alvo:
            par = next((o for o in soltas if o is not c and not o["marca_id"] and o["plataforma"] != c["plataforma"]
                        and (chave_handle(o["conta"]) == kh or (kn and chave_nome(o["nome"]) == kn))), None)
            if not par:
                continue
            nome = max((c["nome"], par["nome"]), key=lambda n: (len(n or "") <= 40, len(n or "")))
            alvo = db.um("insert into marcas (usuario_id, nome) values (%s, %s) returning id", uid, _limpar_nome(nome))["id"]
            por_marca[alvo] = []
        for m in (c, par) if par else (c,):
            db.executar("update acompanhamentos set marca_id = %s where usuario_id = %s and conta_id = %s", alvo, uid, m["conta_id"])
            m["marca_id"] = alvo
            por_marca[alvo].append(m)
        _alinhar_papel(uid, alvo)


def _limpar_nome(nome):
    return re.split(r"\s+[|\-–]\s+", (nome or "").strip())[0][:60] or nome


def _alinhar_papel(uid, marca_id):
    """Uma marca tem um papel só: vale o do membro mais 'forte' (próprio > concorrente > referência)."""
    membros = db.todos("select papel from acompanhamentos where usuario_id = %s and marca_id = %s", uid, marca_id)
    papeis = {m["papel"] for m in membros}
    papel = "proprio" if "proprio" in papeis else "concorrente" if "concorrente" in papeis else "referencia"
    db.executar("update acompanhamentos set papel = %s where usuario_id = %s and marca_id = %s", papel, uid, marca_id)


def unir(contas, nome=None):
    """Une à mão: contas = [{'plataforma','conta'}] (uma por plataforma)."""
    uid = ctx.usuario()
    linhas = [db.um("""select a.conta_id, a.marca_id, c.plataforma, coalesce(a.nome, c.nome, c.conta) as nome
                       from acompanhamentos a join contas c on c.id = a.conta_id
                       where a.usuario_id = %s and c.plataforma = %s and c.conta = %s""", uid, x["plataforma"], x["conta"]) for x in contas]
    linhas = [l for l in linhas if l]
    if len(linhas) < 2:
        raise ValueError("Escolha pelo menos duas contas para unir.")
    if len({l["plataforma"] for l in linhas}) < len(linhas):
        raise ValueError("Uma marca tem uma conta por plataforma. Escolha contas de plataformas diferentes.")
    existente = next((l["marca_id"] for l in linhas if l["marca_id"]), None)
    mid = existente or db.um("insert into marcas (usuario_id, nome) values (%s, %s) returning id",
                             uid, _limpar_nome(nome or linhas[0]["nome"]))["id"]
    if nome:
        db.executar("update marcas set nome = %s where id = %s and usuario_id = %s", nome.strip()[:60], mid, uid)
    db.executar("""update acompanhamentos set marca_id = %s, agrupar = true where usuario_id = %s and conta_id = any(%s)""",
                mid, uid, db.Lista([l["conta_id"] for l in linhas]))
    _limpar_vazias(uid)
    _alinhar_papel(uid, mid)
    return mid


def separar(plataforma, conta):
    uid = ctx.usuario()
    db.executar("""update acompanhamentos set marca_id = null, agrupar = false where usuario_id = %s
                   and conta_id = (select id from contas where plataforma = %s and conta = %s)""", uid, plataforma, conta)
    _limpar_vazias(uid)


def renomear(mid, nome):
    db.executar("update marcas set nome = %s where id = %s and usuario_id = %s", (nome or "").strip()[:60], mid, ctx.usuario())


def _limpar_vazias(uid):
    """Marca com menos de 2 contas deixa de ser marca (a conta volta a ser ela mesma)."""
    db.executar("""update acompanhamentos set marca_id = null where usuario_id = %s and marca_id in (
                     select marca_id from acompanhamentos where usuario_id = %s and marca_id is not null
                     group by marca_id having count(*) < 2)""", uid, uid)
    db.executar("""delete from marcas m where m.usuario_id = %s and not exists
                   (select 1 from acompanhamentos a where a.marca_id = m.id)""", uid)


def irmas(plataforma, conta, uid=None):
    """Outras contas da mesma marca (para aplicar papel/contexto à marca inteira)."""
    uid = uid or ctx.usuario()
    return db.todos("""select c.plataforma, c.conta from acompanhamentos a join contas c on c.id = a.conta_id
                       where a.usuario_id = %s and a.marca_id is not null and a.marca_id = (
                         select a2.marca_id from acompanhamentos a2 join contas c2 on c2.id = a2.conta_id
                         where a2.usuario_id = %s and c2.plataforma = %s and c2.conta = %s)
                       and not (c.plataforma = %s and c.conta = %s)""", uid, uid, plataforma, conta, plataforma, conta)


def listar(uid=None):
    uid = uid or ctx.usuario()
    return {m["id"]: m["nome"] for m in db.todos("select id, nome from marcas where usuario_id = %s", uid)}
