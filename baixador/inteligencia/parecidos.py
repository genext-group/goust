"""Encontrar marcas parecidas com as que o usuário já acompanha.

1. A IA lê os perfis-semente (bio, categoria, posicionamento e público do relatório) e o brief, e monta buscas por
   ASSUNTO para cada plataforma (não por nome: queremos quem fala com o mesmo público, não homônimos).
2. A API de dados executa as buscas (perfis reais, com bio e seguidores; ~1 crédito cada).
3. A IA ranqueia os candidatos pela semelhança com as sementes e classifica: concorrente direto ou referência.
Sem créditos na API de dados, cai para a busca na web da IA. Resultado guardado em `descobertas` (categoria
'parecido'), então "ignorar" vale para sempre e quem já é acompanhado nunca reaparece. Cache de 24 h por sementes.
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db
from ..fontes import scrapecreators as sc
from ..ia import cliente, memoria, perfil

LIMITE_BUSCAS_POR_PLATAFORMA = 4
LIMITE_RESULTADOS = 10
MINIMO_SEGUIDORES = 300


class PlanoBusca(BaseModel):
    perfil_ideal: str                # em 1 frase: o que os parecidos têm em comum
    termos_instagram: list[str]      # buscas por assunto em português (2 a 4 palavras cada)
    termos_tiktok: list[str]


INSTRUCOES_PLANO = """Você ajuda um criador a encontrar perfis PARECIDOS com os perfis-semente (Instagram/TikTok, Brasil).
A semelhança é com as SEMENTES (mercado, produto, público e abordagem delas), mesmo que sejam de outro mercado que o
do criador. Se não houver sementes, o alvo são concorrentes e referências do NEGÓCIO descrito no brief.
- 'perfil_ideal': em 1 frase, o que um perfil parecido precisa ter (mercado, produto, público, abordagem).
- 'termos_instagram' e 'termos_tiktok': 4 buscas cada, por ASSUNTO e em português, como alguém digitaria na busca
  da plataforma para achar perfis desse nicho (ex.: "app controle financeiro", "marketing para restaurantes").
  Varie os ângulos (produto, público, dor). Nada de nomes de marcas das sementes. 2 a 4 palavras por busca."""


class Escolhido(BaseModel):
    plataforma: Literal["instagram", "tiktok"]
    conta: str
    tipo: Literal["concorrente", "referencia"]
    semelhanca: int                  # 0-100
    parecido_com: list[str]          # @ das sementes mais parecidas
    motivo: str                      # 1 frase: por que é parecido e o que observar nele


class Ranking(BaseModel):
    escolhidos: list[Escolhido]


INSTRUCOES_RANKING = """Você escolhe, entre candidatos encontrados na busca, os perfis mais PARECIDOS com o alvo: os
perfis-semente quando houver (a semelhança é com ELES, não com o negócio do usuário) ou, sem sementes, o negócio do brief.
- Parecido = mesmo mercado/produto, mesmo público ou mesma abordagem de conteúdo. Descarte homônimos, perfis pessoais
  sem relação, fã-clubes, perfis abandonados e marcas gringas sem público no Brasil (a menos que sejam referência óbvia).
- 'tipo': 'concorrente' se disputa o mesmo cliente que o USUÁRIO (veja o brief); senão 'referencia'.
- 'semelhanca' 0-100 com o alvo; 'parecido_com' = @ das sementes mais próximas (com @), vazio quando não há sementes.
- 'motivo' em 1 frase concreta (o que faz e por que vale olhar). Use só contas da lista de candidatos (mesma grafia).
- Entre perfis igualmente parecidos, prefira os com mais audiência e sinais de atividade (é com eles que se aprende).
- No máximo {limite}, do mais parecido ao menos. Melhor poucos e bons do que muitos fracos. Português do Brasil."""


def _sementes(chaves, papel):
    if not chaves and papel == "negocio":
        return []
    uid = ctx.usuario()
    linhas = db.todos("""select c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome, a.papel, c.perfil, c.seguidores
                         from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s""", uid)
    if chaves:
        linhas = [l for l in linhas if f"{l['plataforma']}/{l['conta']}" in set(chaves)]
    else:
        linhas = [l for l in linhas if l["papel"] == (papel or "concorrente")]
    if not linhas:
        raise ValueError("Escolha pelo menos um perfil que você já acompanha para buscar parecidos.")
    saida = []
    for l in linhas[:8]:
        r = perfil.obter(l["plataforma"], l["conta"])
        rel = (r or {}).get("relatorio") or {}
        saida.append({"perfil": f"@{l['conta']} ({l['plataforma']})", "nome": l["nome"], "papel": l["papel"],
                      "seguidores": l["seguidores"], "bio": (l["perfil"] or {}).get("bio"),
                      "categoria": (l["perfil"] or {}).get("categoria"),
                      "posicionamento": rel.get("posicionamento"), "resumo": (rel.get("resumo_executivo") or "")[:400]})
    return saida


def _ja_conhecidos():
    uid = ctx.usuario()
    seguidos = {(r["plataforma"], r["conta"].lower()) for r in db.todos(
        "select c.plataforma, c.conta from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s", uid)}
    descartados = {(r["plataforma"], r["conta"].lower()) for r in db.todos(
        "select plataforma, conta from descobertas where usuario_id = %s and estado in ('ignorada', 'oculta', 'adicionada')", uid)}
    return seguidos, descartados


def buscar(chaves=None, papel=None, forcar=False):
    sementes = _sementes(chaves or [], papel)
    assinatura = hashlib.sha1(json.dumps(sorted(s["perfil"] for s in sementes) or ["negocio"]).encode()).hexdigest()[:16]
    guardado = memoria.ler_documento("parecidos", {})
    seguidos, descartados = _ja_conhecidos()
    if not forcar and guardado.get("assinatura") == assinatura and guardado.get("ate", 0) > _agora():
        return _filtrar(guardado["resultado"], seguidos, descartados)

    if sementes:
        entrada_sementes = "## Perfis-semente\n" + "\n".join(json.dumps(s, ensure_ascii=False, default=str) for s in sementes)
        base_plano = entrada_sementes   # o brief não entra no plano: a semelhança é com as sementes
    else:
        marca = memoria.marca()
        if not (marca.get("produto") or marca.get("publico")):
            raise ValueError("Preencha o seu brief (o que você vende e para quem) para buscar concorrentes do seu negócio.")
        entrada_sementes = "## Sem sementes: procure concorrentes e referências do negócio do brief"
        base_plano = memoria.contexto() + "\n\n" + entrada_sementes
    with ctx.em_operacao("parecidos"):
        plano = cliente.estruturado("criacao", INSTRUCOES_PLANO, base_plano, PlanoBusca, esforco="low")
        candidatos, fonte = [], "busca"
        if sc.ativo() and sc.com_credito():
            buscas = [("instagram", t) for t in plano.termos_instagram[:LIMITE_BUSCAS_POR_PLATAFORMA]] + \
                     [("tiktok", t) for t in plano.termos_tiktok[:LIMITE_BUSCAS_POR_PLATAFORMA]]
            def uma(b):
                try:
                    return sc.buscar_nicho(*b)
                except Exception:
                    return []
            with ThreadPoolExecutor(4) as ex:
                for lista in ex.map(ctx.em_contexto(uma), buscas):
                    candidatos += lista
        vistos, unicos = set(), []
        for c in candidatos:
            k = (c["plataforma"], c["conta"])
            if k in vistos or k in seguidos or k in descartados:
                continue
            if c.get("seguidores") is not None and c["seguidores"] < MINIMO_SEGUIDORES:
                continue   # perfil sem audiência ainda: pouco a aprender ou a disputar
            vistos.add(k)
            unicos.append(c)
        if len(unicos) < 3:
            return _pela_web(sementes, plano, seguidos, descartados, assinatura)
        lista_cand = "\n".join(json.dumps({"plataforma": c["plataforma"], "conta": c["conta"], "nome": c["nome"],
                                           "seguidores": c["seguidores"], "bio": c["bio"]}, ensure_ascii=False)
                               for c in unicos[:60])
        entrada = (memoria.contexto() + "\n\n" + entrada_sementes + f"\n\n## O que procuramos\n{plano.perfil_ideal}"
                   + f"\n\n## Candidatos ({len(unicos[:60])})\n" + lista_cand)
        r = cliente.estruturado("criacao", INSTRUCOES_RANKING.replace("{limite}", str(LIMITE_RESULTADOS)), entrada, Ranking, esforco="low")
    por_chave = {(c["plataforma"], c["conta"]): c for c in unicos}
    resultado = []
    for e in r.escolhidos:
        c = por_chave.get((e.plataforma, e.conta.lstrip("@").lower()))
        if not c:
            continue
        resultado.append({**c, "tipo": e.tipo, "semelhanca": max(0, min(100, e.semelhanca)),
                          "parecido_com": e.parecido_com[:3], "motivo": e.motivo, "fonte": fonte})
    resultado = resultado[:LIMITE_RESULTADOS]
    _guardar(resultado, assinatura, plano.perfil_ideal)
    return _filtrar({"itens": resultado, "perfil_ideal": plano.perfil_ideal}, seguidos, descartados)


def _pela_web(sementes, plano, seguidos, descartados, assinatura):
    """Sem créditos (ou sem resultados) na API de dados: a IA procura na web."""
    from ..inteligencia.rotina import ResultadoDescoberta
    texto = (memoria.contexto() + "\n\n## Perfis-semente\n" + "\n".join(json.dumps(s, ensure_ascii=False, default=str) for s in sementes)
             + f"\n\n## Procure perfis parecidos com as sementes\n{plano.perfil_ideal}\nNão sugira: "
             + ", ".join(f"@{c}" for _, c in seguidos))
    with ctx.em_operacao("parecidos"):
        r = cliente.com_busca_na_web("criacao", "Sugira até 8 perfis ATIVOS de Instagram/TikTok no Brasil parecidos com as sementes. "
                                     "Só @ confirmados na pesquisa. 'tipo' concorrente ou referencia; 'motivo' em 1 frase. "
                                     "'fora_do_nicho' fica vazio. Português do Brasil.", texto, ResultadoDescoberta)
    resultado = [{"plataforma": s.plataforma, "conta": s.conta.lstrip("@").lower(), "nome": s.nome, "foto": None, "seguidores": None,
                  "bio": None, "tipo": s.tipo, "semelhanca": 60, "parecido_com": [], "motivo": s.motivo, "fonte": "web"}
                 for s in r.sugestoes if (s.plataforma, s.conta.lstrip("@").lower()) not in seguidos]
    _guardar(resultado, assinatura, plano.perfil_ideal)
    return _filtrar({"itens": resultado, "perfil_ideal": plano.perfil_ideal}, seguidos, descartados)


def _agora():
    import time
    return time.time()


def _guardar(resultado, assinatura, perfil_ideal):
    memoria.gravar_documento("parecidos", {"assinatura": assinatura, "ate": _agora() + 24 * 3600,
                                           "resultado": {"itens": resultado, "perfil_ideal": perfil_ideal}})
    uid = ctx.usuario()
    for x in resultado:   # entra nas descobertas: "ignorar" vale para sempre e o Início também mostra
        db.executar("""insert into descobertas (usuario_id, plataforma, conta, nome, tipo, categoria, motivo, seguidores, relevancia)
                       values (%s, %s, %s, %s, %s, 'parecido', %s, %s, %s) on conflict (usuario_id, plataforma, conta) do nothing""",
                    uid, x["plataforma"], x["conta"], x["nome"], x["tipo"], x["motivo"], x["seguidores"], round(x["semelhanca"] / 100, 2))


def _filtrar(resultado, seguidos, descartados):
    itens = resultado["itens"] if isinstance(resultado, dict) else resultado
    perfil_ideal = resultado.get("perfil_ideal") if isinstance(resultado, dict) else None
    ids = {(d["plataforma"], d["conta"]): d["id"] for d in db.todos(
        "select id, plataforma, conta from descobertas where usuario_id = %s", ctx.usuario())}
    return {"perfil_ideal": perfil_ideal,
            "itens": [{**x, "id": ids.get((x["plataforma"], x["conta"]))} for x in itens
                      if (x["plataforma"], x["conta"]) not in seguidos and (x["plataforma"], x["conta"]) not in descartados]}
