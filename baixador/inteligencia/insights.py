"""Insights: o que a análise encontra, guardado com deduplicação, relevância, validade e retorno do usuário.

Regras para a home parecer viva sem repetir:
- cada insight tem uma `chave` estável (ex.: "perfil:alcance", "mercado:formato:carrossel");
- um insight com a mesma chave só volta se a magnitude mudou de verdade (>= 30%) ou a direção virou,
  ou se o anterior já expirou e ainda importa;
- o que o usuário marcou como "não é relevante" ou "ocultar" não volta por 30 dias (a não ser que dobre);
- o feedback por tipo/categoria vira um peso que sobe ou desce a relevância das próximas recomendações.
"""
import math
from datetime import datetime, timedelta, timezone

from .. import db
from .. import contexto as ctx

VALIDADE = {"perfil": 7, "atencao": 7, "conta": 7, "mercado": 10, "ideia": 2, "sistema": 14}
BASE = {"perfil": 0.75, "atencao": 0.7, "conta": 0.55, "mercado": 0.6, "ideia": 0.6, "sistema": 0.8}
DESCARTADOS = ("irrelevante", "oculto")


def _agora():
    return datetime.now(timezone.utc)


def pesos_do_usuario():
    """Peso por categoria a partir do retorno: (interessantes + 1) / (descartes + 1), entre 0,4 e 1,5."""
    linhas = db.todos("""select coalesce(dados->>'categoria', tipo) as cat,
                                count(*) filter (where estado in ('interessante', 'feito')) as bons,
                                count(*) filter (where estado in ('irrelevante', 'oculto')) as ruins
                         from insights where usuario_id = %s group by 1""", ctx.usuario())
    pesos = {l["cat"]: max(0.4, min(1.5, (l["bons"] + 1) / (l["ruins"] + 1))) for l in linhas}
    # descobertas: o que a pessoa adiciona ou ignora ensina que tipo/categoria de perfil sugerir
    for campo in ("categoria", "tipo"):
        for l in db.todos(f"""select {campo} as cat, count(*) filter (where estado in ('adicionada', 'interessante')) as bons,
                                     count(*) filter (where estado in ('ignorada', 'oculta')) as ruins
                              from descobertas where usuario_id = %s group by 1""", ctx.usuario()):
            pesos[f"descoberta:{l['cat']}"] = max(0.4, min(1.5, (l["bons"] + 1) / (l["ruins"] + 1)))
    return pesos


def relevancia(tipo, magnitude, confianca, acionavel=True, categoria=None, pesos=None):
    """Prioridade: base do tipo × tamanho da mudança × confiança × acionável × gosto do usuário."""
    tamanho = 1 - math.exp(-abs(magnitude) / 25)  # 25% de mudança ≈ 0,63; 60% ≈ 0,9
    valor = BASE.get(tipo, 0.5) * (0.35 + 0.65 * tamanho) * (0.5 + 0.5 * confianca) * (1.0 if acionavel else 0.8)
    peso = (pesos or {}).get(categoria or tipo, 1.0)
    return round(max(0.0, min(1.0, valor * peso)), 3)


def repetido(tipo, chave, magnitude=0.0, texto_base=None):
    """True se um insight com essa chave não traria nada novo (mesma regra do registrar).
    Usado ANTES de chamar a IA, para não pagar redação de algo que seria descartado."""
    ultimo = db.um("""select magnitude, estado, criado_em, expira_em, dados from insights
                      where usuario_id = %s and chave = %s order by criado_em desc limit 1""", ctx.usuario(), chave)
    if not ultimo:
        return False
    agora = _agora()
    dias = (agora - ultimo["criado_em"]).days
    anterior = ultimo["magnitude"] or 0.0
    virou = (anterior > 0) != (magnitude > 0) and abs(magnitude) >= 5 and abs(anterior) >= 5
    mudou = abs(magnitude - anterior) >= max(5.0, abs(anterior) * 0.3) or virou
    if ultimo["estado"] in DESCARTADOS and dias < 30 and abs(magnitude) < abs(anterior) * 2:
        return True
    vigente = ultimo["expira_em"] is None or ultimo["expira_em"] > agora
    if vigente and not mudou and (ultimo["dados"] or {}).get("texto_base") == texto_base:
        return True
    if not vigente and not mudou and dias < 14 and tipo != "ideia":
        return True
    return False


def registrar(tipo, chave, titulo, texto="", dados=None, magnitude=0.0, confianca=0.5, acionavel=True, pesos=None):
    """Grava um insight novo se ele trouxer algo novo. Devolve o id (ou None quando é repetição)."""
    dados = dados or {}
    if repetido(tipo, chave, magnitude, dados.get("texto_base")):
        return None
    agora = _agora()
    rel = relevancia(tipo, magnitude, confianca, acionavel, dados.get("categoria"), pesos)
    r = db.um("""insert into insights (usuario_id, tipo, chave, titulo, texto, dados, magnitude, confianca, relevancia, expira_em)
                 values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
              ctx.usuario(), tipo, chave, titulo[:240], texto, dados, float(magnitude), float(confianca), rel,
              agora + timedelta(days=VALIDADE.get(tipo, 7)))
    return r["id"]


def _forma(l):
    return {"id": l["id"], "tipo": l["tipo"], "chave": l["chave"], "titulo": l["titulo"], "texto": l["texto"],
            "dados": l["dados"], "magnitude": l["magnitude"], "confianca": l["confianca"], "relevancia": l["relevancia"],
            "estado": l["estado"], "criado": l["criado_em"].isoformat(), "novo": l["visto_em"] is None}


def vigentes(tipos=None, limite=20):
    """Insights válidos, não descartados, ordenados por relevância com decaimento pela idade."""
    filtro = "and tipo = any(%s)" if tipos else ""
    params = [ctx.usuario()] + ([db.Lista(tipos)] if tipos else [])
    linhas = db.todos(f"""select * from insights where usuario_id = %s {filtro}
                          and estado not in ('irrelevante', 'oculto', 'feito')
                          and (expira_em is null or expira_em > now())
                          order by criado_em desc limit 200""", *params)
    # mantém só a versão mais recente de cada chave
    vistos, unicos = set(), []
    for l in linhas:
        if l["chave"] not in vistos:
            vistos.add(l["chave"])
            unicos.append(l)
    agora = _agora()
    def nota(l):
        idade = (agora - l["criado_em"]).total_seconds() / 86400
        bonus = 1.1 if l["estado"] == "interessante" else 1.0
        return l["relevancia"] * math.exp(-idade / 6) * bonus
    unicos.sort(key=nota, reverse=True)
    return [_forma(l) for l in unicos[:limite]]


def desde(momento, limite=4, minimo=0.35):
    """O que surgiu depois de `momento` e importa (para "Desde sua última visita")."""
    if not momento:
        return []
    linhas = db.todos("""select * from insights where usuario_id = %s and criado_em > %s and tipo <> 'ideia'
                         and estado not in ('irrelevante', 'oculto') and relevancia >= %s
                         order by relevancia desc limit %s""", ctx.usuario(), momento, minimo, limite)
    return [_forma(l) for l in linhas]


def marcar_vistos(ids):
    if ids:
        db.executar("update insights set visto_em = now() where usuario_id = %s and id = any(%s) and visto_em is null",
                    ctx.usuario(), db.Lista(ids))


def avaliar(insight_id, estado):
    if estado not in ("interessante", "irrelevante", "oculto", "feito", "visto"):
        raise ValueError("Avaliação inválida.")
    db.executar("update insights set estado = %s where id = %s and usuario_id = %s", estado, insight_id, ctx.usuario())


def resumo_feedback():
    """Texto curto para os prompts: o que o usuário costuma achar útil ou descartar."""
    linhas = db.todos("""select tipo, titulo, estado from insights where usuario_id = %s
                         and estado in ('interessante', 'feito', 'irrelevante', 'oculto') order by criado_em desc limit 30""",
                      ctx.usuario())
    if not linhas:
        return None
    bons = [f"- {l['titulo']}" for l in linhas if l["estado"] in ("interessante", "feito")]
    ruins = [f"- {l['titulo']}" for l in linhas if l["estado"] in ("irrelevante", "oculto")]
    return ("## Retorno do usuário sobre recomendações anteriores\nAchou útil:\n" + ("\n".join(bons) or "(nada)")
            + "\nDescartou (evite parecidos):\n" + ("\n".join(ruins) or "(nada)"))


def perfil_mudou():
    """O perfil próprio mudou (conectou, desconectou ou trocou): tudo o que foi calculado sobre o anterior
    (leitura da semana, alertas do perfil, ideias do dia) deixa de valer, e a rotina recalcula na próxima visita."""
    db.executar("""update insights set expira_em = now() where usuario_id = %s and (expira_em is null or expira_em > now())
                   and (tipo in ('perfil', 'ideia') or dados->>'categoria' = 'perfil')""", ctx.usuario())
    db.executar("""update usuarios set config = jsonb_set(config, '{inteligencia,ultima}', '0')
                   where id = %s and config ? 'inteligencia'""", ctx.usuario())
