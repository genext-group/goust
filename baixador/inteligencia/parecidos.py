"""Encontrar marcas parecidas: do mercado do usuário E parecidas com as marcas que ele já acompanha.

São duas pesquisas independentes (para um lado não "puxar" o outro), cada uma com a própria base:
- "mercado": o brief (o negócio dele) → perfis que disputam o mesmo cliente ou são referência no mercado dele;
- "marcas": as marcas escolhidas (por padrão, os concorrentes acompanhados) → perfis parecidos com ELAS.
Em cada lado:
1. A IA monta buscas por ASSUNTO para Instagram e TikTok.
2. A API de dados executa em profundidade: Instagram, busca de perfis (com bio); TikTok, busca de perfis +
   busca de VÍDEOS no Brasil (a legenda mostra do que o autor fala). Quem aparece em várias buscas ganha peso.
3. A IA ranqueia pela semelhança com a base daquele lado, equilibrando as plataformas, e classifica
   concorrente direto (disputa o cliente do NEGÓCIO) ou referência.
Sem créditos na API de dados, cai para a busca na web da IA. Resultados vão para `descobertas` (categoria
'parecido'): "ignorar" vale para sempre; cache de 24 h por base.
"""
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db
from ..fontes import scrapecreators as sc
from ..ia import cliente, memoria, perfil

LIMITE_POR_LADO = 6
MINIMO_SEGUIDORES = 300
CANDIDATOS_POR_PLATAFORMA = 35


class PlanoBusca(BaseModel):
    perfil_ideal: str
    termos_instagram: list[str]
    termos_tiktok: list[str]


INSTRUCOES_PLANO = """Você ajuda um criador brasileiro a encontrar perfis PARECIDOS com a base, no Instagram e no TikTok.
{alvo}
- 'perfil_ideal': 1 frase com o que um perfil parecido tem (mercado, produto, público, abordagem).
- 'termos_instagram' e 'termos_tiktok': {n} buscas cada, por ASSUNTO, em português, como alguém digitaria na busca
  da plataforma. No TikTok prefira termos de conteúdo (o que os vídeos falam); no Instagram, termos de nicho/serviço
  (o que a bio diz). Varie produto, público e dor. Nada de nomes de marcas. 2 a 4 palavras por busca.
- Se a base disser que o negócio é LOCAL (atende uma cidade/região), metade das buscas inclui a cidade
  (ex.: "hamburgueria campinas", "lanche em campinas"): é assim que aparecem os concorrentes de verdade dele."""

ALVO = {
    "mercado": "A base é o NEGÓCIO do criador (brief): procure quem disputa o mesmo cliente e referências do mercado DELE.",
    "marcas": ("A base são MARCAS que o criador acompanha: procure perfis parecidos com ELAS (mesmo mercado, produto, "
               "público e tipo de conteúdo delas), mesmo que sejam de outro mercado que o do criador. Ignore o negócio dele."),
}


class Escolhido(BaseModel):
    plataforma: Literal["instagram", "tiktok"]
    conta: str
    tipo: Literal["concorrente", "referencia"]
    semelhanca: int
    parecido_com: list[str]          # @ das marcas da base mais próximas (vazio no lado "mercado")
    motivo: str


class Ranking(BaseModel):
    escolhidos: list[Escolhido]


INSTRUCOES_RANKING = """Você escolhe, entre candidatos reais encontrados nas buscas, os perfis mais PARECIDOS com a BASE.
{alvo}
- Parecido = mesmo mercado/produto, mesmo público ou mesma abordagem de conteúdo. Julgue pela bio (Instagram) e pelos
  exemplos de vídeo (TikTok). 'buscas' = em quantas buscas o perfil apareceu (mais = mais no nicho).
- Descarte homônimos, perfis pessoais sem relação, fã-clubes, estrangeiros sem público no Brasil e conteúdo fora da base.
- EQUILIBRE: até {metade} do Instagram e até {metade} do TikTok, se houver bons nas duas. Máximo {limite} no total.
- 'tipo': 'concorrente' só se disputa o mesmo cliente que o NEGÓCIO do criador (veja o resumo do negócio); senão 'referencia'.
- 'semelhanca' 0-100 com a base; 'parecido_com': @ das marcas da base mais próximas (vazio se a base for o negócio).
- 'motivo': 1 frase concreta (o que faz e por que vale olhar). Use só contas da lista, com a mesma grafia.
Prefira poucos e bons. Português do Brasil."""


# ---------------------------------------------------------------- bases

def _marcas_base(chaves):
    uid = ctx.usuario()
    linhas = db.todos("""select c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome, a.papel, c.perfil, c.seguidores
                         from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s""", uid)
    saida = []
    for l in [l for l in linhas if f"{l['plataforma']}/{l['conta']}" in set(chaves)][:10]:
        rel = ((perfil.obter(l["plataforma"], l["conta"]) or {}).get("relatorio") or {})
        saida.append({"perfil": f"@{l['conta']} ({l['plataforma']})", "nome": l["nome"], "seguidores": l["seguidores"],
                      "bio": (l["perfil"] or {}).get("bio"), "posicionamento": rel.get("posicionamento"),
                      "resumo": (rel.get("resumo_executivo") or "")[:350]})
    return saida


def _resumo_negocio():
    m = memoria.marca()
    return (json.dumps({k: m.get(k) for k in ("nome", "produto", "publico", "alcance", "cidade") if m.get(k)}, ensure_ascii=False)
            + "\n" + memoria.regra_concorrencia(m))


def _ja_conhecidos():
    uid = ctx.usuario()
    seguidos = {(r["plataforma"], r["conta"].lower()) for r in db.todos(
        "select c.plataforma, c.conta from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s", uid)}
    descartados = {(r["plataforma"], r["conta"].lower()) for r in db.todos(
        "select plataforma, conta from descobertas where usuario_id = %s and estado in ('ignorada', 'oculta', 'adicionada')", uid)}
    return seguidos, descartados


# ---------------------------------------------------------------- coleta

def _videos_tiktok(termo):
    """Busca de vídeos no Brasil: cada autor vem com seguidores e a legenda do vídeo (do que ele fala)."""
    d = sc._get("/v1/tiktok/search/keyword", query=termo, region="BR")
    saida = []
    for item in d.get("search_item_list") or []:
        v = item.get("aweme_info") or item
        a = v.get("author") or {}
        if not a.get("unique_id"):
            continue
        av = a.get("avatar_thumb") or {}
        saida.append({"plataforma": "tiktok", "conta": a["unique_id"].lower(), "nome": a.get("nickname"),
                      "foto": sc.foto_compativel(av.get("url_list")) if isinstance(av, dict) else None,
                      "seguidores": a.get("follower_count"), "bio": None, "privado": False, "exemplo": (v.get("desc") or "")[:200]})
    return saida


def _coletar(plano, n):
    buscas = [("ig", t) for t in plano.termos_instagram[:n]] + [("tt_perfis", t) for t in plano.termos_tiktok[:n]] \
        + [("tt_videos", t) for t in plano.termos_tiktok[:n]]

    def uma(b):
        tipo, termo = b
        try:
            if tipo == "ig":
                return sc.buscar_nicho("instagram", termo, limite=15)
            if tipo == "tt_perfis":
                return sc.buscar_nicho("tiktok", termo, limite=15)
            return _videos_tiktok(termo)
        except Exception:
            return []

    candidatos = {}
    with ThreadPoolExecutor(5) as ex:
        for lista in ex.map(ctx.em_contexto(uma), buscas):
            for c in lista:
                k = (c["plataforma"], c["conta"])
                atual = candidatos.get(k)
                if not atual:
                    candidatos[k] = {**c, "buscas": 1, "exemplos": [c["exemplo"]] if c.get("exemplo") else []}
                else:
                    atual["buscas"] += 1
                    for campo in ("bio", "seguidores", "foto"):
                        atual[campo] = atual.get(campo) or c.get(campo)
                    if c.get("exemplo") and len(atual["exemplos"]) < 2:
                        atual["exemplos"].append(c["exemplo"])
    return list(candidatos.values()), len(buscas)


def _lado(lado, base, n_termos, seguidos, descartados, resumo_negocio):
    """Uma pesquisa completa (plano → buscas → ranking) para um lado. Devolve itens, plano e estatística."""
    plano = cliente.estruturado("criacao", INSTRUCOES_PLANO.replace("{alvo}", ALVO[lado]).replace("{n}", str(n_termos)),
                                base, PlanoBusca, esforco="low")
    candidatos, buscas = _coletar(plano, n_termos)
    validos = [c for c in candidatos if (c["plataforma"], c["conta"]) not in seguidos and (c["plataforma"], c["conta"]) not in descartados
               and not c.get("privado") and (c.get("seguidores") is None or c["seguidores"] >= MINIMO_SEGUIDORES)]
    escolha = []
    for plat in ("instagram", "tiktok"):
        da = sorted((c for c in validos if c["plataforma"] == plat), key=lambda c: (-c["buscas"], -(c["seguidores"] or 0)))
        escolha += da[:CANDIDATOS_POR_PLATAFORMA]
    if not escolha:
        return [], plano, {"buscas": buscas, "candidatos": 0}
    lista = "\n".join(json.dumps({"plataforma": c["plataforma"], "conta": c["conta"], "nome": c["nome"], "seguidores": c["seguidores"],
                                  "buscas": c["buscas"], "bio": c.get("bio"), "exemplos_de_video": c.get("exemplos") or None},
                                 ensure_ascii=False) for c in escolha)
    instr = (INSTRUCOES_RANKING.replace("{alvo}", ALVO[lado]).replace("{metade}", str(LIMITE_POR_LADO // 2 + 1))
             .replace("{limite}", str(LIMITE_POR_LADO)))
    entrada = (base + f"\n\n## Negócio do criador (só para decidir concorrente × referência)\n{resumo_negocio}"
               + f"\n\n## O que procuramos\n{plano.perfil_ideal}\n\n## Candidatos ({len(escolha)})\n" + lista)
    r = cliente.estruturado("criacao", instr, entrada, Ranking, esforco="low")
    por_chave = {(c["plataforma"], c["conta"]): c for c in escolha}
    itens = []
    for e in r.escolhidos[:LIMITE_POR_LADO]:
        c = por_chave.get((e.plataforma, e.conta.lstrip("@").lower()))
        if c and not any(x["conta"] == c["conta"] and x["plataforma"] == c["plataforma"] for x in itens):
            itens.append({"plataforma": c["plataforma"], "conta": c["conta"], "nome": c["nome"], "foto": c["foto"],
                          "seguidores": c["seguidores"], "bio": c.get("bio") or (c.get("exemplos") or [None])[0],
                          "tipo": e.tipo, "semelhanca": max(0, min(100, e.semelhanca)), "grupo": lado,
                          "parecido_com": e.parecido_com[:3] if lado == "marcas" else [], "motivo": e.motivo, "fonte": "busca"})
    return itens, plano, {"buscas": buscas, "candidatos": len(validos)}


# ---------------------------------------------------------------- busca

def buscar(chaves=None, negocio=True, forcar=False):
    marcas_base = _marcas_base(chaves or []) if chaves else []
    tem_brief = negocio and bool(memoria.marca().get("produto") or memoria.marca().get("publico"))
    if not marcas_base and not tem_brief:
        raise ValueError("Preencha o seu brief ou escolha marcas que você acompanha para servir de base.")
    m = memoria.marca()
    brief = [m.get(k) for k in ("produto", "publico", "alcance", "cidade")] if tem_brief else None
    assinatura = hashlib.sha1(json.dumps({"c": sorted(x["perfil"] for x in marcas_base), "n": brief}).encode()).hexdigest()[:16]
    guardado = memoria.ler_documento("parecidos", {})
    seguidos, descartados = _ja_conhecidos()
    if not forcar and guardado.get("assinatura") == assinatura and guardado.get("ate", 0) > time.time():
        return _filtrar(guardado["resultado"], seguidos, descartados)

    lados = []
    if tem_brief:
        lados.append(("mercado", memoria.contexto()))
    if marcas_base:
        lados.append(("marcas", "## Marcas que ele acompanha (base)\n"
                      + "\n".join(json.dumps(x, ensure_ascii=False, default=str) for x in marcas_base)))
    n_termos = 5 if len(lados) == 1 else 4
    resumo = _resumo_negocio()
    if not (sc.ativo() and sc.com_credito()):
        return _pela_web(lados, seguidos, descartados, assinatura)
    with ctx.em_operacao("parecidos"), ThreadPoolExecutor(2) as ex:
        resultados = list(ex.map(ctx.em_contexto(lambda l: _lado(l[0], l[1], n_termos, seguidos, descartados, resumo)), lados))
    itens, ideais, termos, buscas, candidatos = [], {}, set(), 0, 0
    for (lado, _), (its, plano, est) in zip(lados, resultados):
        for x in its:
            if not any(y["conta"] == x["conta"] and y["plataforma"] == x["plataforma"] for y in itens):
                itens.append(x)
        ideais[lado] = plano.perfil_ideal
        termos |= set(plano.termos_instagram[:n_termos] + plano.termos_tiktok[:n_termos])
        buscas += est["buscas"]
        candidatos += est["candidatos"]
    if not itens:
        return _pela_web(lados, seguidos, descartados, assinatura)
    resultado = {"itens": itens, "ideais": ideais, "pesquisa": {"buscas": buscas, "candidatos": candidatos, "termos": sorted(termos)}}
    _guardar(resultado, assinatura)
    return _filtrar(resultado, seguidos, descartados)


def _pela_web(lados, seguidos, descartados, assinatura):
    """Sem créditos (ou sem resultados) na API de dados: a IA procura na web."""
    from ..inteligencia.rotina import ResultadoDescoberta
    texto = "\n\n".join(b for _, b in lados) + "\n\nNão sugira: " + ", ".join(f"@{c}" for _, c in seguidos)
    with ctx.em_operacao("parecidos"):
        r = cliente.com_busca_na_web("criacao", "Sugira até 10 perfis ATIVOS no Brasil parecidos com a base, metade Instagram e metade "
                                     "TikTok quando possível. Só @ confirmados na pesquisa. 'tipo' concorrente ou referencia; 'motivo' "
                                     "em 1 frase. 'fora_do_nicho' fica vazio. Português do Brasil.", texto, ResultadoDescoberta)
    itens = [{"plataforma": s.plataforma, "conta": s.conta.lstrip("@").lower(), "nome": s.nome, "foto": None, "seguidores": None,
              "bio": None, "tipo": s.tipo, "semelhanca": 60, "grupo": lados[0][0], "parecido_com": [], "motivo": s.motivo, "fonte": "web"}
             for s in r.sugestoes if (s.plataforma, s.conta.lstrip("@").lower()) not in seguidos]
    resultado = {"itens": itens, "ideais": {}, "pesquisa": {"buscas": 0, "candidatos": 0, "termos": [], "web": True}}
    _guardar(resultado, assinatura)
    return _filtrar(resultado, seguidos, descartados)


def _guardar(resultado, assinatura):
    memoria.gravar_documento("parecidos", {"assinatura": assinatura, "ate": time.time() + 24 * 3600, "resultado": resultado})
    _registrar(resultado["itens"])


def _registrar(itens):
    """Entra nas descobertas: "ignorar" vale para sempre e o Início também mostra."""
    uid = ctx.usuario()
    for x in itens:
        db.executar("""insert into descobertas (usuario_id, plataforma, conta, nome, tipo, categoria, motivo, seguidores, relevancia)
                       values (%s, %s, %s, %s, %s, 'parecido', %s, %s, %s) on conflict (usuario_id, plataforma, conta) do nothing""",
                    uid, x["plataforma"], x["conta"], x["nome"], x["tipo"], x["motivo"], x["seguidores"], round(x["semelhanca"] / 100, 2))


def _filtrar(resultado, seguidos, descartados):
    ids = {(d["plataforma"], d["conta"]): d["id"] for d in db.todos(
        "select id, plataforma, conta from descobertas where usuario_id = %s", ctx.usuario())}
    return {**resultado,
            "itens": [{**x, "id": ids.get((x["plataforma"], x["conta"]))} for x in resultado["itens"]
                      if (x["plataforma"], x["conta"]) not in seguidos and (x["plataforma"], x["conta"]) not in descartados]}
