"""Radar do mercado: números calculados direto dos posts coletados todo dia (sem IA, sem custo).

Por marca (contas da mesma marca somadas; o seu perfil vem como "você" para comparação):
- seguidores e variação (só quando há histórico diário suficiente: a série começa quando o acompanhamento começa);
- ritmo: posts nos últimos 30 dias × 30 anteriores e a série semanal de 12 semanas;
- alcance: mediana de views dos posts com 2+ dias de vida nos últimos 30 dias × 30 anteriores;
- engajamento mediano ((curtidas + comentários) ÷ views) e o melhor post do período;
- momento: acelerando / estável / esfriando (ritmo e alcance juntos).
Do mercado (concorrentes e referências): ritmo semanal por formato, mix de formatos por mês, alcance por formato
e os posts em alta (os que mais superaram a mediana da própria conta).
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from .. import contexto as ctx
from .. import db

SEMANAS = 12


def _agora():
    return datetime.now(timezone.utc)


def _formato(p):
    if p["tipo"] in ("carrossel", "foto"):
        return p["tipo"]
    return "tiktok" if p["plataforma"] == "tiktok" else "reel"


def _eng(p):
    if not p["views"]:
        return None
    return ((p["likes"] or 0) + (p["comentarios"] or 0)) / p["views"] * 100


def _med(xs, inteiro=False):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    return round(median(xs)) if inteiro else median(xs)


def _pct(a, b):
    return (a / b - 1) * 100 if a is not None and b else None


def _segunda(d):
    d = d.astimezone(timezone.utc)
    return (d - timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def radar(dias=30):
    uid = ctx.usuario()
    agora = _agora()
    contas = db.todos("""select c.id, c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome, c.seguidores, c.perfil,
                                a.papel, a.marca_id, m.nome as marca
                         from acompanhamentos a join contas c on c.id = a.conta_id left join marcas m on m.id = a.marca_id
                         where a.usuario_id = %s""", uid)
    if not contas:
        return {"marcas": [], "mercado": None}
    ids = [c["id"] for c in contas]
    from .. import biblioteca
    fotos = biblioteca.perfis()   # mesma foto de perfil usada no resto do app
    posts = db.todos("""select id, conta_id, plataforma, codigo, tipo, publicado_em, views, likes, comentarios from posts
                        where conta_id = any(%s) and publicado_em > now() - interval '180 days'""", db.Lista(ids))
    seg_hist = db.todos("""select conta_id, dia, seguidores from metricas_contas
                           where conta_id = any(%s) and dia > current_date - 90 and seguidores is not null order by dia""",
                        db.Lista(ids))

    # grupos (marca = contas da mesma marca somadas)
    grupos = {}
    for c in contas:
        k = f"m{c['marca_id']}" if c["marca_id"] else f"c{c['id']}"
        g = grupos.setdefault(k, {"chave": k, "nome": c["marca"] or c["nome"], "papel": c["papel"], "contas": []})
        g["contas"].append(c)
    conta_grupo = {c["id"]: k for k, g in grupos.items() for c in g["contas"]}
    por_grupo = defaultdict(list)
    for p in posts:
        por_grupo[conta_grupo[p["conta_id"]]].append(p)

    inicio = agora - timedelta(days=dias)
    anterior = agora - timedelta(days=2 * dias)
    maduro = agora - timedelta(days=2)              # views de post com menos de 2 dias ainda não dizem nada
    semana0 = _segunda(agora) - timedelta(weeks=SEMANAS - 1)

    # mediana de views de cada conta (90 dias) para medir "fora da curva"
    med_conta = {}
    for cid in ids:
        vs = [p["views"] for p in posts if p["conta_id"] == cid and p["views"] and p["publicado_em"] > agora - timedelta(days=90)]
        med_conta[cid] = median(vs) if vs else None

    marcas = []
    for k, g in grupos.items():
        ps = por_grupo.get(k, [])
        atual = [p for p in ps if p["publicado_em"] >= inicio]
        ant = [p for p in ps if anterior <= p["publicado_em"] < inicio]
        semanas = [0] * SEMANAS
        for p in ps:
            if p["publicado_em"] >= semana0:
                semanas[min(SEMANAS - 1, (p["publicado_em"] - semana0).days // 7)] += 1
        views_at = _med([p["views"] for p in atual if p["publicado_em"] < maduro], True)
        views_ant = _med([p["views"] for p in ant], True)
        # seguidores: soma das contas por dia (só dias em que todas as contas da marca têm valor)
        ids_g = {c["id"] for c in g["contas"]}
        por_dia = defaultdict(dict)
        for h in seg_hist:
            if h["conta_id"] in ids_g:
                por_dia[h["dia"]][h["conta_id"]] = h["seguidores"]
        serie = [(d, sum(v.values())) for d, v in sorted(por_dia.items()) if len(v) == len(ids_g)]
        delta_seg = (serie[-1][1] - serie[0][1]) if len(serie) >= 2 and (serie[-1][0] - serie[0][0]).days >= 3 else None
        melhor = max((p for p in atual if p["views"]), key=lambda p: p["views"], default=None)
        d_posts = _pct(len(atual), len(ant)) if ant else None
        d_views = _pct(views_at, views_ant)
        sinais = [x for x in (d_posts, d_views) if x is not None]
        momento = None
        if ps and not atual:
            momento = "parado"
        elif atual and not ant:
            momento = "retomou"
        elif sinais:
            m = sum(sinais) / len(sinais)
            momento = "acelerando" if m >= 20 else "esfriando" if m <= -20 else "estavel"
        conta_por_id = {c["id"]: c for c in g["contas"]}
        marcas.append({
            "chave": k, "nome": g["nome"], "papel": g["papel"],
            "contas": [{"plataforma": c["plataforma"], "conta": c["conta"], "seguidores": c["seguidores"],
                        "foto": (fotos.get(f"{c['plataforma']}/{c['conta']}") or {}).get("foto")} for c in g["contas"]],
            "seguidores": sum(c["seguidores"] or 0 for c in g["contas"]) or None,
            "seguidores_delta": delta_seg, "seguidores_desde": serie[0][0].isoformat() if serie else None,
            "serie_seguidores": [{"dia": d.isoformat(), "v": v} for d, v in serie],
            "posts": len(atual), "posts_antes": len(ant), "posts_delta": d_posts, "semanas": semanas,
            "views_mediana": views_at, "views_delta": d_views,
            "engajamento": _med([_eng(p) for p in atual if p["publicado_em"] < maduro]),
            "interacoes": _med([(p["likes"] or 0) + (p["comentarios"] or 0) for p in atual if p["publicado_em"] < maduro and p["likes"] is not None], True),
            "momento": momento,
            "melhor": {"plataforma": melhor["plataforma"], "conta": conta_por_id[melhor["conta_id"]]["conta"], "id": melhor["codigo"],
                       "views": melhor["views"], "formato": _formato(melhor)} if melhor else None,
            "por_mes": _por_mes(ps, agora),
        })
    marcas.sort(key=lambda m: (m["papel"] != "proprio", -(m["views_mediana"] or 0)))
    return {"marcas": marcas, "mercado": _mercado(grupos, por_grupo, med_conta, agora, semana0), "dias": dias,
            "historico_seguidores_desde": min((h["dia"] for h in seg_hist), default=None) and min(h["dia"] for h in seg_hist).isoformat()}


def _por_mes(ps, agora):
    """Últimos 6 meses: posts e mediana de views por mês (evolução da marca)."""
    saida = []
    base = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for i in range(5, -1, -1):
        a, m = divmod(base.year * 12 + base.month - 1 - i, 12)
        ref = base.replace(year=a, month=m + 1)
        fim = (ref + timedelta(days=32)).replace(day=1)
        do_mes = [p for p in ps if ref <= p["publicado_em"] < fim]
        # mês com menos de 3 posts com views não tem mediana confiável (distorce o gráfico)
        com_views = [p["views"] for p in do_mes if p["views"]]
        saida.append({"mes": ref.strftime("%Y-%m"), "posts": len(do_mes), "views": _med(com_views, True) if len(com_views) >= 3 else None})
    return saida


def _mercado(grupos, por_grupo, med_conta, agora, semana0):
    outros = [k for k, g in grupos.items() if g["papel"] != "proprio"]
    ps = [p for k in outros for p in por_grupo.get(k, [])]
    if not ps:
        return None
    formatos = ("reel", "carrossel", "foto", "tiktok")
    semanas = [{f: 0 for f in formatos} for _ in range(SEMANAS)]
    for p in ps:
        if p["publicado_em"] >= semana0:
            semanas[min(SEMANAS - 1, (p["publicado_em"] - semana0).days // 7)][_formato(p)] += 1
    recentes = [p for p in ps if agora - timedelta(days=60) <= p["publicado_em"] < agora - timedelta(days=2)]
    por_formato = []
    for f in formatos:
        dos = [p for p in recentes if _formato(p) == f]
        if dos:
            por_formato.append({"formato": f, "posts": len(dos), "parcela": len(dos) / len(recentes) * 100,
                                "views": _med([p["views"] for p in dos], True), "engajamento": _med([_eng(p) for p in dos]),
                                "interacoes": _med([(p["likes"] or 0) + (p["comentarios"] or 0) for p in dos if p["likes"] is not None], True)})
    em_alta = []
    for p in ps:
        if p["publicado_em"] >= agora - timedelta(days=14) and p["views"] and med_conta.get(p["conta_id"]):
            em_alta.append({"plataforma": p["plataforma"], "id": p["codigo"], "conta_id": p["conta_id"], "views": p["views"],
                            "formato": _formato(p), "vezes": round(p["views"] / med_conta[p["conta_id"]], 1),
                            "publicado": p["publicado_em"].isoformat()})
    em_alta = sorted([x for x in em_alta if x["vezes"] >= 1.5], key=lambda x: -x["vezes"])[:8]
    nomes = {c["id"]: (c["conta"], g["nome"]) for g in grupos.values() for c in g["contas"]}
    for x in em_alta:
        x["conta"], x["marca"] = nomes[x.pop("conta_id")]
    return {"semanas": semanas, "inicio_semanas": semana0.date().isoformat(), "por_formato": por_formato, "em_alta": em_alta,
            "posts_30": sum(1 for p in ps if p["publicado_em"] >= agora - timedelta(days=30)),
            "posts_30_antes": sum(1 for p in ps if agora - timedelta(days=60) <= p["publicado_em"] < agora - timedelta(days=30))}
