"""Pastas da biblioteca, por usuário. "Favoritos" é a pasta do sistema, criada na primeira vez que é usada."""
from . import catalogo, db
from . import contexto as ctx

FAVORITOS = "favoritos"


def _favoritos_id():
    r = db.um("select id from pastas where usuario_id = %s and sistema = %s", ctx.usuario(), FAVORITOS)
    if r:
        return r["id"]
    r = db.um("""insert into pastas (usuario_id, nome, sistema) values (%s, 'Favoritos', %s)
                 on conflict (usuario_id, sistema) where sistema is not null do update set nome = excluded.nome
                 returning id""", ctx.usuario(), FAVORITOS)
    return r["id"]


def listar():
    """Favoritos sempre primeiro, depois as pastas do usuário em ordem de criação."""
    _favoritos_id()
    linhas = db.todos("""select p.id, p.nome, p.sistema, p.cor, count(pp.post_id) as posts
                         from pastas p left join pastas_posts pp on pp.pasta_id = p.id
                         where p.usuario_id = %s group by p.id order by (p.sistema is null), p.id""", ctx.usuario())
    return [{**l, "posts": int(l["posts"])} for l in linhas]


def _da_pessoa(pasta_id):
    r = db.um("select id, sistema from pastas where id = %s and usuario_id = %s", pasta_id, ctx.usuario())
    if not r:
        raise ValueError("Pasta não encontrada.")
    return r


def criar(nome, cor=None):
    nome = (nome or "").strip()[:60]
    if not nome:
        raise ValueError("Dê um nome para a pasta.")
    db.executar("insert into pastas (usuario_id, nome, cor) values (%s, %s, %s)", ctx.usuario(), nome, cor)
    return listar()


def renomear(pasta_id, nome, cor=None):
    p = _da_pessoa(pasta_id)
    if p["sistema"]:
        raise ValueError("A pasta Favoritos não pode ser renomeada.")
    db.executar("update pastas set nome = %s, cor = coalesce(%s, cor) where id = %s", nome.strip()[:60], cor, pasta_id)
    return listar()


def apagar(pasta_id):
    p = _da_pessoa(pasta_id)
    if p["sistema"]:
        raise ValueError("A pasta Favoritos não pode ser apagada.")
    db.executar("delete from pastas where id = %s", pasta_id)
    return listar()


def _post(plataforma, codigo):
    pid = catalogo.post_id(plataforma, codigo)
    if not pid:
        raise ValueError("Post não encontrado.")
    return pid


def colocar(pasta_id, plataforma, codigo, dentro=True):
    _da_pessoa(pasta_id)
    pid = _post(plataforma, codigo)
    if dentro:
        db.executar("insert into pastas_posts (pasta_id, post_id) values (%s, %s) on conflict do nothing", pasta_id, pid)
    else:
        db.executar("delete from pastas_posts where pasta_id = %s and post_id = %s", pasta_id, pid)


def favoritar(plataforma, codigo, favorito):
    colocar(_favoritos_id(), plataforma, codigo, favorito)


def mapa_do_usuario():
    """{plataforma/codigo: [pasta_id, ...]} para marcar os cards da biblioteca."""
    linhas = db.todos("""select p.plataforma, p.codigo, array_agg(pp.pasta_id) as pastas
                         from pastas_posts pp join pastas pa on pa.id = pp.pasta_id
                         join posts p on p.id = pp.post_id
                         where pa.usuario_id = %s group by p.plataforma, p.codigo""", ctx.usuario())
    return {f"{l['plataforma']}/{l['codigo']}": l["pastas"] for l in linhas}
