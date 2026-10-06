"""Painel de super-admin: visão geral da plataforma, usuários, custos, operação e controles por usuário.

Acesso: e-mails em DONO_EMAIL (pode ter vários, separados por vírgula).
"""
import os
import time
from datetime import date

from . import db, eventos

PRECO_PLANO = {"gratis": 0, "criador": 79, "pro": 179, "agencia": 449}   # R$/mês (proposta)
DOLAR = float(os.getenv("DOLAR_BRL", "5.40"))
_admins_cache = {}


def emails_admin():
    return {e.strip().lower() for e in (os.getenv("DONO_EMAIL") or "").split(",") if e.strip()}


def eh_admin(usuario_id):
    c = _admins_cache.get(usuario_id)
    if c and time.time() - c[1] < 300:
        return c[0]
    r = db.um("select email from usuarios where id = %s", usuario_id)
    ok = bool(r and (r["email"] or "").lower() in emails_admin())
    _admins_cache[usuario_id] = (ok, time.time())
    return ok


def _f(v):
    return float(v or 0)


# ---------------------------------------------------------------- visão geral

def visao(dias=30):
    k = db.um("""select
        (select count(*) from usuarios) as usuarios,
        (select count(*) from usuarios where criado_em > now() - interval '7 days') as novos_7d,
        (select count(*) from usuarios where criado_em > now() - interval '30 days') as novos_30d,
        (select count(distinct usuario_id) from atividade_diaria where dia = current_date) as ativos_hoje,
        (select count(distinct usuario_id) from atividade_diaria where dia > current_date - 7) as ativos_7d,
        (select count(distinct usuario_id) from atividade_diaria where dia > current_date - 30) as ativos_30d,
        (select count(distinct usuario_id) from acompanhamentos where papel = 'proprio') as com_perfil,
        (select count(*) from usuarios where (config->>'onboarding') is not null) as onboarding_ok,
        (select count(*) from acompanhamentos where papel = 'concorrente') as concorrentes,
        (select count(*) from acompanhamentos where papel = 'referencia') as referencias,
        (select count(*) from acompanhamentos where papel = 'referencia' or papel = 'concorrente') as seguidos,
        (select count(*) from acompanhamentos where (papel <> 'proprio') and (jsonb_array_length(aspectos) > 0 or nota is not null)) as com_contexto,
        (select count(*) from contas) as contas_catalogo,
        (select count(*) from posts) as posts,
        (select count(*) from analises_video) as analises_video,
        (select count(*) from relatorios) as relatorios,
        (select count(*) from estrategias) as estrategias,
        (select count(*) from conteudos) as conteudos,
        (select count(*) from imagens) as imagens,
        (select count(*) from insights where criado_em > now() - interval '7 days') as insights_7d,
        (select count(*) from insights where estado in ('interessante', 'feito')) as insights_uteis,
        (select count(*) from insights where estado in ('irrelevante', 'oculto')) as insights_descartados,
        (select count(*) from descobertas where estado = 'adicionada') as descobertas_aceitas,
        (select count(*) from descobertas) as descobertas""")
    custo = db.um("""select
        coalesce(sum(usd) filter (where dia = current_date), 0) as hoje,
        coalesce(sum(usd) filter (where dia > current_date - 7), 0) as d7,
        coalesce(sum(usd) filter (where dia > current_date - 30), 0) as d30,
        coalesce(sum(usd) filter (where dia >= date_trunc('month', current_date)), 0) as mes,
        coalesce(sum(usd) filter (where dia > current_date - 30 and modelo = 'scrapecreators'), 0) as dados_30,
        coalesce(sum(usd) filter (where dia > current_date - 30 and modelo like 'gpt-image%%'), 0) as imagens_30,
        coalesce(sum(usd) filter (where dia > current_date - 30 and modelo like '%%:lote'), 0) as lote_30
        from custos""")
    custo = {k2: _f(v) for k2, v in custo.items()}
    hoje = date.today()
    dias_mes = (date(hoje.year + hoje.month // 12, hoje.month % 12 + 1, 1) - date(hoje.year, hoje.month, 1)).days
    custo["projecao_mes"] = custo["mes"] / max(hoje.day, 1) * dias_mes
    custo["por_ativo_30d"] = custo["d30"] / max(k["ativos_30d"] or 0, 1)
    custo["ia_30"] = custo["d30"] - custo["dados_30"]

    serie = db.todos("""with d as (select generate_series(current_date - (%s - 1), current_date, interval '1 day')::date as dia)
        select d.dia,
          (select count(*) from usuarios u where u.criado_em::date = d.dia) as novos,
          (select count(*) from atividade_diaria a where a.dia = d.dia) as ativos,
          (select coalesce(sum(sessoes), 0) from atividade_diaria a where a.dia = d.dia) as sessoes,
          (select coalesce(sum(requisicoes), 0) from atividade_diaria a where a.dia = d.dia) as requisicoes,
          (select coalesce(sum(usd), 0) from custos c where c.dia = d.dia and c.modelo <> 'scrapecreators') as ia,
          (select coalesce(sum(usd), 0) from custos c where c.dia = d.dia and c.modelo = 'scrapecreators') as dados,
          (select count(*) from eventos e where e.ts::date = d.dia and e.tipo like 'ia:%%') as tarefas_ia,
          (select count(*) from eventos e where e.ts::date = d.dia and e.tipo like 'erro:%%') as erros
        from d order by d.dia""", dias)
    por_operacao = db.todos("""select operacao, sum(usd) as usd, sum(chamadas) as chamadas, count(distinct usuario_id) as usuarios
                               from custos where dia > current_date - %s group by 1 order by 2 desc limit 20""", dias)
    por_modelo = db.todos("""select modelo, sum(usd) as usd, sum(chamadas) as chamadas, sum(entrada) as entrada, sum(saida) as saida,
                             sum(creditos) as creditos from custos where dia > current_date - %s group by 1 order by 2 desc""", dias)
    planos = db.todos("""select coalesce(config->'admin'->>'plano', 'gratis') as plano, count(*) as n from usuarios group by 1""")
    receita = sum(PRECO_PLANO.get(p["plano"], 0) * p["n"] for p in planos)
    return {
        "gerado": time.time(), "dias": dias, "kpis": k, "custo": custo, "dolar": DOLAR,
        "receita_mensal_brl": receita, "planos": planos,
        "serie": [{**s, "dia": s["dia"].isoformat(), "ia": _f(s["ia"]), "dados": _f(s["dados"])} for s in serie],
        "por_operacao": [{**o, "usd": _f(o["usd"])} for o in por_operacao],
        "por_modelo": [{**m, "usd": _f(m["usd"])} for m in por_modelo],
        "saude": saude(),
    }


def saude():
    from .fontes import scrapecreators
    from .ia import cliente
    tarefas = db.um("""select
        count(*) filter (where status in ('na fila', 'rodando')) as ativas,
        count(*) filter (where status = 'rodando' and criada < now() - interval '15 minutes') as travadas,
        count(*) filter (where status = 'erro' and coalesce(fim, criada) > now() - interval '24 hours') as erros_24h
        from tarefas""")
    lote = {r["estado"]: r["n"] for r in db.todos("""select estado, count(*) n from lote_pedidos
                                                     where criado_em > now() - interval '7 days' group by 1""")}
    rotina = db.um("""select max((config->'inteligencia'->>'ultima')::float) as ultima,
        count(*) filter (where jsonb_array_length(coalesce(config->'inteligencia'->'falhas', '[]')) > 0) as com_falha
        from usuarios""")
    try:
        saldo = scrapecreators.saldo()
    except Exception:
        saldo = None
    return {"tarefas": tarefas, "lote": lote, "rotina": rotina, "saldo_dados": saldo,
            "openai": cliente.configurada(), "lote_ativo": os.getenv("IA_LOTE", "1") != "0"}


# ---------------------------------------------------------------- usuários

def usuarios():
    linhas = db.todos("""select u.id, u.email, u.nome, u.criado_em,
          u.config->'admin' as admin, (u.config->'visita'->>'atual')::float as ultima_visita,
          (u.config->>'onboarding') is not null as onboarding,
          (select count(*) from acompanhamentos a where a.usuario_id = u.id and a.papel = 'proprio') as proprios,
          (select count(*) from acompanhamentos a where a.usuario_id = u.id and a.papel = 'concorrente') as concorrentes,
          (select count(*) from acompanhamentos a where a.usuario_id = u.id and a.papel = 'referencia') as referencias,
          (select count(*) from relatorios r where r.usuario_id = u.id) as relatorios,
          (select count(*) from conteudos c where c.usuario_id = u.id) as conteudos,
          (select count(*) from imagens i where i.usuario_id = u.id) as imagens,
          (select coalesce(sum(sessoes), 0) from atividade_diaria a where a.usuario_id = u.id and a.dia > current_date - 30) as sessoes_30d,
          (select count(*) from atividade_diaria a where a.usuario_id = u.id and a.dia > current_date - 30) as dias_ativos_30d,
          (select coalesce(sum(usd), 0) from custos c where c.usuario_id = u.id and c.dia >= date_trunc('month', current_date)) as custo_mes,
          (select coalesce(sum(usd), 0) from custos c where c.usuario_id = u.id and c.dia > current_date - 30) as custo_30d,
          (select coalesce(sum(usd), 0) from custos c where c.usuario_id = u.id) as custo_total,
          (select count(*) from eventos e where e.usuario_id = u.id and e.tipo like 'erro:%%' and e.ts > now() - interval '7 days') as erros_7d
        from usuarios u order by u.criado_em desc""")
    saida = []
    for l in linhas:
        ctl = l.pop("admin") or {}
        plano = ctl.get("plano") or "gratis"
        receita_usd = PRECO_PLANO.get(plano, 0) * 0.88 / DOLAR
        saida.append({**l, "criado_em": l["criado_em"].isoformat(), "plano": plano, "controles": ctl,
                      "custo_mes": _f(l["custo_mes"]), "custo_30d": _f(l["custo_30d"]), "custo_total": _f(l["custo_total"]),
                      "margem_30d": (receita_usd - _f(l["custo_30d"])) / receita_usd if receita_usd else None,
                      "admin": l["email"] and l["email"].lower() in emails_admin()})
    return saida


def usuario(uid):
    u = db.um("select id, email, nome, criado_em, config from usuarios where id = %s", uid)
    if not u:
        return None
    config = u.pop("config") or {}
    contas = db.todos("""select c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome, a.papel, a.aspectos, a.nota,
          a.criado_em, c.seguidores, (select count(*) from posts p where p.conta_id = c.id) as posts,
          (select max(r.gerado_em) from relatorios r where r.conta_id = c.id and r.usuario_id = a.usuario_id) as ultima_analise
        from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s order by a.criado_em""", uid)
    custos_dia = db.todos("""select dia, sum(usd) filter (where modelo <> 'scrapecreators') as ia,
          sum(usd) filter (where modelo = 'scrapecreators') as dados from custos
        where usuario_id = %s and dia > current_date - 30 group by 1 order by 1""", uid)
    por_operacao = db.todos("""select operacao, modelo, sum(chamadas) as chamadas, sum(entrada) as entrada, sum(saida) as saida,
          sum(creditos) as creditos, sum(usd) as usd from custos where usuario_id = %s and dia > current_date - 30
        group by 1, 2 order by usd desc""", uid)
    atividade = db.todos("""select dia, requisicoes, sessoes from atividade_diaria where usuario_id = %s
                            and dia > current_date - 30 order by dia""", uid)
    linha_tempo = db.todos("select ts, tipo, dados from eventos where usuario_id = %s order by ts desc limit 120", uid)
    tarefas = db.todos("""select id, status, dados->>'tipo' as tipo, dados->>'conta' as conta, dados->>'erro' as erro,
          dados->>'etapa' as etapa, criada, fim from tarefas where usuario_id = %s and tipo = 'ia' order by id desc limit 40""", uid)
    insights = db.um("""select count(*) as total, count(*) filter (where estado in ('interessante', 'feito')) as uteis,
          count(*) filter (where estado in ('irrelevante', 'oculto')) as descartados,
          count(*) filter (where visto_em is not null) as vistos from insights where usuario_id = %s""", uid)
    lote = db.todos("""select tipo, estado, erro, criado_em, feito_em from lote_pedidos where usuario_id = %s
                       order by id desc limit 15""", uid)
    return {
        "id": u["id"], "email": u["email"], "nome": u["nome"], "criado_em": u["criado_em"].isoformat(),
        "controles": config.get("admin") or {}, "visita": config.get("visita") or {},
        "onboarding": config.get("onboarding"), "piloto": config.get("piloto"), "rotina": config.get("inteligencia") or {},
        "monitoramento": config.get("monitoramento"),
        "contas": [{**c, "criado_em": c["criado_em"].isoformat(),
                    "ultima_analise": c["ultima_analise"].isoformat() if c["ultima_analise"] else None} for c in contas],
        "custos_dia": [{"dia": c["dia"].isoformat(), "ia": _f(c["ia"]), "dados": _f(c["dados"])} for c in custos_dia],
        "por_operacao": [{**o, "usd": _f(o["usd"])} for o in por_operacao],
        "atividade": [{**a, "dia": a["dia"].isoformat()} for a in atividade],
        "linha_tempo": [{**e, "ts": e["ts"].isoformat()} for e in linha_tempo],
        "tarefas": [{**t, "criada": t["criada"].isoformat(), "fim": t["fim"].isoformat() if t["fim"] else None} for t in tarefas],
        "insights": insights,
        "lote": [{**x, "criado_em": x["criado_em"].isoformat(), "feito_em": x["feito_em"].isoformat() if x["feito_em"] else None} for x in lote],
    }


CAMPOS_CONTROLE = {"plano": str, "limite_usd_mes": float, "bloqueado": bool, "nota": str}


def atualizar(uid, dados, autor):
    atual = (db.um("select config->'admin' as a from usuarios where id = %s", uid) or {}).get("a") or {}
    novo = dict(atual)
    for k, tipo in CAMPOS_CONTROLE.items():
        if k in dados:
            v = dados[k]
            novo[k] = None if v in (None, "") else tipo(v)
    if novo.get("plano") and novo["plano"] not in PRECO_PLANO:
        raise ValueError("Plano inválido.")
    db.executar("update usuarios set config = jsonb_set(config, '{admin}', %s) where id = %s", novo, uid)
    eventos.esquecer_cache(uid)
    mudou = {k: novo.get(k) for k in CAMPOS_CONTROLE if novo.get(k) != atual.get(k)}
    if mudou:
        eventos.registrar("admin:controles", {"por": autor, **mudou}, uid)
    return novo


# ---------------------------------------------------------------- operação

def operacao():
    tarefas = db.todos("""select t.id, t.status, t.dados->>'tipo' as tipo, t.dados->>'conta' as conta, t.dados->>'erro' as erro,
          t.dados->>'etapa' as etapa, t.criada, t.fim, u.email from tarefas t join usuarios u on u.id = t.usuario_id
        where t.tipo = 'ia' order by t.id desc limit 60""")
    erros = db.todos("""select e.ts, e.tipo, e.dados, u.email from eventos e join usuarios u on u.id = e.usuario_id
                        where e.tipo like 'erro:%%' order by e.ts desc limit 40""")
    rotinas = db.todos("""select email, (config->'inteligencia'->>'ultima')::float as ultima, config->'inteligencia'->'resultado' as resultado,
          config->'inteligencia'->'falhas' as falhas from usuarios order by 2 desc nulls last""")
    lotes = db.todos("""select lote_id, min(criado_em) as criado, max(feito_em) as feito, count(*) as pedidos,
          count(*) filter (where estado = 'feito') as feitos, count(*) filter (where estado = 'erro') as erros,
          string_agg(distinct estado, ',') as estados from lote_pedidos where criado_em > now() - interval '7 days'
        group by lote_id order by min(criado_em) desc limit 30""")
    eventos_recentes = db.todos("""select e.ts, e.tipo, e.dados, u.email from eventos e join usuarios u on u.id = e.usuario_id
                                   order by e.ts desc limit 80""")
    iso = lambda v: v.isoformat() if v else None  # noqa: E731
    return {
        "tarefas": [{**t, "criada": iso(t["criada"]), "fim": iso(t["fim"])} for t in tarefas],
        "erros": [{**e, "ts": iso(e["ts"])} for e in erros],
        "rotinas": rotinas,
        "lotes": [{**x, "criado": iso(x["criado"]), "feito": iso(x["feito"])} for x in lotes],
        "eventos": [{**e, "ts": iso(e["ts"])} for e in eventos_recentes],
        "saude": saude(),
    }
