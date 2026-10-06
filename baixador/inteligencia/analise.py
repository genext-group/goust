"""Análise determinística (sem IA): números do seu perfil e sinais do mercado a partir do catálogo.

Tudo aqui sai de SQL + estatística simples, então é barato, reproduzível e não inventa nada.
A IA entra depois só para redigir ("o que detectamos → por que importa") e recomendar.

Normalização: cada post é comparado com a mediana da PRÓPRIA conta (lift). Assim uma conta grande
não domina o sinal e dá para comparar formatos entre perfis de tamanhos diferentes.
"""
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

from .. import db
from .. import contexto as ctx

LIMIAR_ESTAVEL = 3.0  # % abaixo disso é "estável"


def _agora():
    return datetime.now(timezone.utc)


def _pct(atual, anterior):
    if atual is None or anterior in (None, 0):
        return None
    return round((atual / anterior - 1) * 100, 1)


def _direcao(delta):
    if delta is None:
        return None
    return "estavel" if abs(delta) < LIMIAR_ESTAVEL else ("alta" if delta > 0 else "queda")


def _med(xs):
    xs = [x for x in xs if x is not None]
    return round(median(xs), 2) if xs else None


def contas(papeis):
    return db.todos("""select c.id, c.plataforma, c.conta, c.nome, c.seguidores, c.perfil, c.atualizado_em, a.papel
                       from acompanhamentos a join contas c on c.id = a.conta_id
                       where a.usuario_id = %s and a.papel = any(%s)""", ctx.usuario(), db.Lista(papeis))


def _posts(conta_ids, dias):
    if not conta_ids:
        return []
    return db.todos("""select p.id, p.conta_id, p.plataforma, p.codigo, p.tipo, p.publicado_em, p.views, p.likes,
                              p.comentarios, p.legenda, c.conta, c.seguidores, av.dados->>'formato' as formato_ia,
                              av.dados->>'gancho' as gancho_ia
                       from posts p join contas c on c.id = p.conta_id
                       left join analises_video av on av.post_id = p.id
                       where p.conta_id = any(%s) and p.publicado_em > now() - make_interval(days => %s)""",
                    db.Lista(conta_ids), dias)


def _gancho(bruto):
    """A análise guarda o gancho como JSON; aqui só interessa a frase."""
    if not bruto:
        return None
    try:
        g = json.loads(bruto)
        return g.get("frase_ou_texto") or g.get("descricao")
    except (ValueError, AttributeError):
        return bruto


def _eng(p):
    """Engajamento por seguidor (vale para vídeo, carrossel e foto)."""
    if not p["seguidores"] or p["likes"] is None:
        return None
    return ((p["likes"] or 0) + (p["comentarios"] or 0)) / p["seguidores"] * 100


def _seguidores_antes(conta_id, dias):
    """Seguidores em ~`dias` atrás pelo histórico diário; senão, o registro mais antigo com 2+ dias."""
    r = db.um("""select seguidores, dia from metricas_contas where conta_id = %s and dia <= current_date - %s
                 and seguidores is not null order by dia desc limit 1""", conta_id, dias)
    if r:
        return r["seguidores"], r["dia"]
    r = db.um("""select seguidores, dia from metricas_contas where conta_id = %s and dia <= current_date - 2
                 and seguidores is not null order by dia asc limit 1""", conta_id)
    return (r["seguidores"], r["dia"]) if r else (None, None)


# ---------------------------------------------------------------- seu perfil

def perfil_semana():
    proprias = contas(("proprio",))
    if not proprias:
        return {"tem_perfil": False}
    ids = [c["id"] for c in proprias]
    posts = _posts(ids, 120)
    agora = _agora()
    def janela(de, ate):
        return [p for p in posts if p["publicado_em"] and agora - timedelta(days=de) <= p["publicado_em"] < agora - timedelta(days=ate)]
    atual, anterior = janela(7, 0), janela(14, 7)
    ultimo = db.um("select max(publicado_em) as m from posts where conta_id = any(%s)", db.Lista(ids))["m"]
    dias_sem = (agora - ultimo).days if ultimo else None

    seg_atual = sum(c["seguidores"] or 0 for c in proprias) or None
    seg_antes, dia_antes = 0, None
    for c in proprias:
        s, d = _seguidores_antes(c["id"], 7)
        if s is None:
            seg_antes = None
            break
        seg_antes += s
        dia_antes = d
    views = lambda ps: sum(p["views"] or 0 for p in ps) if any(p["views"] for p in ps) else None
    alcance_atual, alcance_ant = views(atual), views(anterior)
    eng_atual, eng_ant = _med([_eng(p) for p in atual]), _med([_eng(p) for p in anterior])
    eng_hist = _med([_eng(p) for p in posts if p["publicado_em"] and p["publicado_em"] > agora - timedelta(days=90)])

    outros = contas(("concorrente", "referencia"))
    posts_outros = _posts([c["id"] for c in outros], 30)
    eng_bench = _med([_eng(p) for p in posts_outros])
    publicados_outros_14 = sum(1 for p in posts_outros if p["publicado_em"] > agora - timedelta(days=14))

    metricas = [
        {"chave": "seguidores", "rotulo": "Seguidores", "valor": seg_atual,
         "delta": _pct(seg_atual, seg_antes) if seg_antes else None,
         "comparacao": f"desde {dia_antes.strftime('%d/%m')}" if dia_antes else None,
         "nota": None if seg_antes else "A evolução aparece com o histórico diário"},
        {"chave": "alcance", "rotulo": "Alcance", "valor": alcance_atual, "delta": _pct(alcance_atual, alcance_ant),
         "comparacao": "vs semana anterior" if alcance_ant else None,
         "nota": None if alcance_atual is not None else "Sem posts com visualizações na semana"},
        {"chave": "engajamento", "rotulo": "Engajamento", "valor": eng_atual, "sufixo": "%",
         "delta": _pct(eng_atual, eng_ant), "comparacao": "vs semana anterior" if eng_ant else None,
         "referencia": {"historico": eng_hist, "concorrentes": eng_bench},
         "nota": None if eng_atual is not None else "Sem posts na semana"},
        {"chave": "publicacoes", "rotulo": "Publicações", "valor": len(atual), "delta": _pct(len(atual), len(anterior)) if anterior else None,
         "comparacao": f"{len(anterior)} na semana anterior"},
    ]
    for m in metricas:
        m["direcao"] = _direcao(m["delta"])
    leitura = interpretar(metricas, dias_sem, publicados_outros_14, eng_hist, eng_bench, ultimo)
    return {"tem_perfil": True, "contas": [f"@{c['conta']}" for c in proprias], "metricas": metricas,
            "dias_sem_postar": dias_sem, "ultimo_post": ultimo.isoformat() if ultimo else None,
            "concorrentes_publicaram_14d": publicados_outros_14, "historico_posts": len(posts), **leitura}


def interpretar(metricas, dias_sem, outros_14, eng_hist, eng_bench, ultimo):
    """A leitura principal da semana, por regras (a mais importante primeiro)."""
    m = {x["chave"]: x for x in metricas}
    alc, eng, pub = m["alcance"]["delta"], m["engajamento"]["delta"], m["publicacoes"]
    if dias_sem is not None and dias_sem >= 10:
        extra = f" Nas últimas 2 semanas, os perfis que você acompanha publicaram {outros_14} posts." if outros_14 else ""
        return {"leitura": f"Você não publica há {dias_sem} dias (último post em {ultimo.strftime('%d/%m')}).{extra}",
                "tom": "alerta", "chave": "perfil:parado", "magnitude": min(100, dias_sem)}
    if dias_sem is None:
        return {"leitura": "Ainda não encontramos posts no seu perfil. Assim que houver publicações, a leitura semanal aparece aqui.",
                "tom": "neutro", "chave": "perfil:sem_posts", "magnitude": 0}
    if alc is not None and eng is not None and alc >= 15 and eng <= -5:
        return {"leitura": f"Seu alcance cresceu {alc:.0f}% esta semana, mas o engajamento não acompanhou ({eng:.0f}%). Mais gente viu, menos gente interagiu.",
                "tom": "atencao", "chave": "perfil:alcance_sem_engajamento", "magnitude": alc - eng}
    if alc is not None and alc >= 15:
        return {"leitura": f"Semana forte: seu alcance cresceu {alc:.0f}%" + (f" e o engajamento subiu {eng:.0f}%." if eng and eng > 3 else " com engajamento estável."),
                "tom": "positivo", "chave": "perfil:alcance_alta", "magnitude": alc}
    if alc is not None and alc <= -15:
        menos = (int(pub["comparacao"].split()[0]) - pub["valor"]) if pub["comparacao"] else 0
        causa = f" Você publicou {menos} post{'s' if menos != 1 else ''} a menos que na semana anterior." if menos > 0 else ""
        return {"leitura": f"Seu alcance caiu {abs(alc):.0f}% em relação à semana anterior.{causa}",
                "tom": "alerta", "chave": "perfil:alcance_queda", "magnitude": alc}
    if eng is not None and eng <= -15:
        return {"leitura": f"Seu engajamento caiu {abs(eng):.0f}% em relação à semana anterior.",
                "tom": "alerta", "chave": "perfil:engajamento_queda", "magnitude": eng}
    eng_atual = m["engajamento"]["valor"]
    if eng_atual and eng_bench and eng_atual < eng_bench * 0.7:
        return {"leitura": f"Seu engajamento ({eng_atual:.1f}% por seguidor) está abaixo da média dos perfis que você acompanha ({eng_bench:.1f}%).",
                "tom": "atencao", "chave": "perfil:engajamento_abaixo", "magnitude": (eng_atual / eng_bench - 1) * 100}
    if eng_atual and eng_hist and eng_atual > eng_hist * 1.3:
        return {"leitura": f"Seus posts desta semana engajaram acima da sua média dos últimos 90 dias ({eng_atual:.1f}% contra {eng_hist:.1f}%).",
                "tom": "positivo", "chave": "perfil:engajamento_acima", "magnitude": (eng_atual / eng_hist - 1) * 100}
    return {"leitura": f"Semana estável: {pub['valor']} publicação{'ões' if pub['valor'] != 1 else ''} e números dentro do seu padrão.",
            "tom": "neutro", "chave": "perfil:estavel", "magnitude": 0}


# ---------------------------------------------------------------- mercado

def _confianca(n_posts, n_contas):
    return round(min(1.0, 0.15 + 0.035 * n_posts + 0.12 * n_contas), 2)


def rotulo_confianca(conf, direcao):
    if direcao == "queda":
        return "Perdendo força" if conf >= 0.75 else "Sinal de queda"
    return "Sinal emergente" if conf < 0.5 else ("Tendência observada" if conf < 0.75 else "Crescendo no seu nicho")


NOME_FORMATO = {
    "esquete_humor": "esquete de humor", "carrossel_storytelling": "carrossel contando uma história",
    "ugc_influenciador": "vídeo estilo influenciador (UGC)", "demonstracao_produto": "demonstração do produto",
    "trend_meme": "trend/meme", "bastidores": "bastidores", "slides_texto": "slides com texto",
    "carrossel_educativo": "carrossel educativo", "anuncio_produzido": "anúncio produzido", "outro": "outros formatos",
    "entrevista_podcast": "entrevista/podcast", "storytelling": "storytelling", "foto_unica": "foto única",
    "tutorial_tela": "tutorial de tela", "talking_head": "pessoa falando para a câmera", "depoimento": "depoimento",
}


def nome_formato(f):
    """Rótulo técnico da análise (talking_head) → nome que o usuário entende."""
    return NOME_FORMATO.get(f or "", (f or "").replace("_", " "))


GRUPO_TIPO = {"video": "Vídeos curtos", "reel": "Vídeos curtos", "carrossel": "Carrosséis", "foto": "Posts de imagem"}


def sinais_mercado():
    """Sinais entre os perfis acompanhados: formatos ganhando/perdendo força, posts fora da curva,
    contas acelerando ou crescendo."""
    outros = contas(("concorrente", "referencia"))
    if not outros:
        return []
    posts = _posts([c["id"] for c in outros], 90)
    por_conta = defaultdict(list)
    for p in posts:
        por_conta[p["conta_id"]].append(p)
    med_views = {k: _med([p["views"] for p in v if p["views"]]) for k, v in por_conta.items()}
    med_likes = {k: _med([p["likes"] for p in v if p["likes"]]) for k, v in por_conta.items()}

    def lift(p):
        if p["views"] and med_views.get(p["conta_id"]):
            return p["views"] / med_views[p["conta_id"]]
        if p["likes"] and med_likes.get(p["conta_id"]):
            return p["likes"] / med_likes[p["conta_id"]]
        return None

    agora = _agora()
    recentes = [p for p in posts if p["publicado_em"] > agora - timedelta(days=21)]
    base = [p for p in posts if p["publicado_em"] <= agora - timedelta(days=21)]
    sinais = []

    def evidencias(ps, n=3):
        top = sorted((p for p in ps if lift(p)), key=lift, reverse=True)[:n]
        return [{"plataforma": p["plataforma"], "conta": p["conta"], "id": p["codigo"], "lift": round(lift(p), 1)} for p in top]

    def comparar(chave_grupo, nome, f_grupo, categoria):
        r = [p for p in recentes if f_grupo(p)]
        b = [p for p in base if f_grupo(p)]
        # posts muito fora da curva entram com teto (10×) para não distorcer a comparação entre períodos
        lr = [min(lift(p), 10) for p in r if lift(p)]
        lb = [min(lift(p), 10) for p in b if lift(p)]
        contas_r = len({p["conta_id"] for p in r})
        if len(lr) >= 3 and len(lb) >= 4 and contas_r >= 2:
            mr, mb = median(lr), median(lb)
            mudanca = round((mr / mb - 1) * 100, 1) if mb else 0
            if abs(mudanca) >= 20:
                conf = _confianca(len(lr), contas_r)
                direcao = "alta" if mudanca > 0 else "queda"
                sinais.append({"chave": f"mercado:{chave_grupo}", "tipo": "mercado", "categoria": categoria, "assunto": nome,
                               "direcao": direcao, "magnitude": mudanca, "confianca": conf,
                               "rotulo": rotulo_confianca(conf, direcao), "evidencias": evidencias(r),
                               "dados": {"posts_recentes": len(lr), "contas": contas_r, "desempenho_recente_x_media_da_conta": round(mr, 2),
                                         "desempenho_antes_x_media_da_conta": round(mb, 2), "janela": "últimas 3 semanas × 3 meses anteriores"}})
        # frequência: mais contas apostando no formato
        if recentes and base and len(r) >= 4:
            sr, sb = len(r) / len(recentes), len(b) / len(base)
            pp = round((sr - sb) * 100, 1)
            if abs(pp) >= 12:
                conf = _confianca(len(r), contas_r)
                direcao = "alta" if pp > 0 else "queda"
                sinais.append({"chave": f"mercado:frequencia:{chave_grupo}", "tipo": "mercado", "categoria": "frequencia", "assunto": nome,
                               "direcao": direcao, "magnitude": pp, "confianca": conf, "rotulo": rotulo_confianca(conf, direcao),
                               "evidencias": evidencias(r),
                               "dados": {"participacao_recente_pct": round(sr * 100), "participacao_antes_pct": round(sb * 100),
                                         "posts_recentes": len(r), "contas": contas_r}})

    for chave in ("video", "carrossel", "foto"):
        grupo = {"video": ("video", "reel")}.get(chave, (chave,))
        comparar(f"tipo:{chave}", GRUPO_TIPO[chave], lambda p, g=grupo: p["tipo"] in g, "formato")
    formatos_ia = {p["formato_ia"] for p in posts if p["formato_ia"]}
    for f in formatos_ia:
        comparar(f"estilo:{f}", nome_formato(f), lambda p, f=f: p["formato_ia"] == f, "estilo")

    # posts fora da curva nos últimos 10 dias
    for p in recentes:
        l = lift(p)
        if l and l >= 3 and p["publicado_em"] > agora - timedelta(days=10):
            sinais.append({"chave": f"conta:{p['conta']}:destaque:{p['codigo']}", "tipo": "conta", "categoria": "destaque",
                           "assunto": f"@{p['conta']}", "direcao": "alta", "magnitude": round((l - 1) * 100), "confianca": 0.8,
                           "rotulo": "Post fora da curva",
                           "evidencias": [{"plataforma": p["plataforma"], "conta": p["conta"], "id": p["codigo"], "lift": round(l, 1)}],
                           "dados": {"vezes_a_media_da_conta": round(l, 1), "legenda": (p["legenda"] or "")[:300],
                                     "gancho": _gancho(p["gancho_ia"]), "formato": nome_formato(p["formato_ia"]) if p["formato_ia"] else p["tipo"]}})

    # contas acelerando o ritmo de publicação
    for cid, ps in por_conta.items():
        r14 = sum(1 for p in ps if p["publicado_em"] > agora - timedelta(days=14))
        antes = sum(1 for p in ps if agora - timedelta(days=60) < p["publicado_em"] <= agora - timedelta(days=14))
        ritmo_antes = antes / 46 * 14
        if r14 >= 4 and r14 >= max(2, ritmo_antes) * 2:
            conta = ps[0]["conta"]
            sinais.append({"chave": f"conta:{conta}:ritmo", "tipo": "conta", "categoria": "ritmo", "assunto": f"@{conta}",
                           "direcao": "alta", "magnitude": round((r14 / max(ritmo_antes, 1) - 1) * 100), "confianca": 0.7,
                           "rotulo": "Acelerou", "evidencias": evidencias([p for p in ps if p["publicado_em"] > agora - timedelta(days=14)], 2),
                           "dados": {"posts_ultimas_2_semanas": r14, "media_antes_a_cada_2_semanas": round(ritmo_antes, 1)}})

    # contas crescendo em seguidores (precisa de histórico diário)
    crescimentos = []
    for c in outros:
        s, d = _seguidores_antes(c["id"], 7)
        if s and c["seguidores"] and d and (date.today() - d).days >= 4:
            crescimentos.append((c, (c["seguidores"] / s - 1) * 100, (date.today() - d).days))
    if len(crescimentos) >= 3:
        media = median(g for _, g, _ in crescimentos)
        for c, g, dias in crescimentos:
            if g >= 3 and g >= media * 2:
                sinais.append({"chave": f"conta:{c['conta']}:crescimento", "tipo": "conta", "categoria": "crescimento",
                               "assunto": f"@{c['conta']}", "direcao": "alta", "magnitude": round(g, 1), "confianca": 0.75,
                               "rotulo": "Crescendo acima da média", "evidencias": [],
                               "dados": {"crescimento_pct": round(g, 1), "dias": dias, "media_dos_outros_pct": round(media, 1)}})
    sinais.sort(key=lambda s: abs(s["magnitude"]) * s["confianca"], reverse=True)
    return sinais


def destaques_proprios(n=3):
    """Seus melhores e piores posts recentes (para as ideias do dia)."""
    proprias = contas(("proprio",))
    posts = _posts([c["id"] for c in proprias], 180)
    if len(posts) < 3:
        return {"melhores": [], "piores": []}
    med_v = _med([p["views"] for p in posts if p["views"]])
    med_l = _med([p["likes"] for p in posts if p["likes"]])
    def lift(p):
        if p["views"] and med_v:
            return p["views"] / med_v
        return p["likes"] / med_l if p["likes"] and med_l else None
    com = sorted((p for p in posts if lift(p)), key=lift, reverse=True)
    forma = lambda p: {"id": p["codigo"], "plataforma": p["plataforma"], "conta": p["conta"], "tipo": p["tipo"],
                       "vezes_sua_media": round(lift(p), 1), "legenda": (p["legenda"] or "")[:240], "gancho": _gancho(p["gancho_ia"])}
    return {"melhores": [forma(p) for p in com[:n]], "piores": [forma(p) for p in com[-2:]] if len(com) > n + 2 else []}


def jornada():
    from ..ia import estrategia, memoria
    proprias = contas(("proprio",))
    outros = contas(("concorrente", "referencia"))
    analisados = db.um("select count(distinct conta_id) as n from relatorios where usuario_id = %s", ctx.usuario())["n"]
    brief = memoria.marca()
    planejados = db.um("select count(*) as n from conteudos where usuario_id = %s", ctx.usuario())["n"]
    return {"perfil": bool(proprias), "brief": sum(1 for v in brief.values() if (v or "").strip()) >= 6,
            "concorrentes": len(outros) >= 3, "analise": analisados > 0, "estrategia": bool(estrategia.versoes()),
            "planejamento": planejados > 0}
