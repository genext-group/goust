"""Descoberta precisa da primeira configuração: cruza o perfil do usuário, o brief e os perfis que ele já
informou (concorrentes e referências) para sugerir marcas com muito mais precisão que a busca por assunto.

Duas fontes em paralelo:
1. Web: a IA identifica a CATEGORIA DE PRODUTO do usuário e pesquisa empresas/produtos da mesma categoria com
   perfil oficial; cada @ é confirmado na API de dados (bio, foto, seguidores). É daqui que vêm os concorrentes
   diretos de verdade (ex.: outros assistentes de IA no WhatsApp), que a busca por assunto não acha.
2. Redes: buscas por assunto no Instagram e no TikTok, guiadas pelos perfis que ele já informou.
No ranking, concorrente direto é só o perfil OFICIAL de quem vende a mesma categoria de produto; criador que
fala ou demonstra produtos é, no máximo, referência.
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
from ..ia import cliente, memoria
from . import parecidos

LIMITE = 15
CONFIANCA_MINIMA = 45


class MarcaWeb(BaseModel):
    nome: str
    instagram: str
    tiktok: str
    o_que_vende: str


class MarcasWeb(BaseModel):
    categoria: str
    marcas: list[MarcaWeb]


INSTRUCOES_WEB = """Você mapeia o mercado de um negócio brasileiro.
1. Leia a base (brief, perfil do usuário e perfis que ele já informou) e escreva em 'categoria' a CATEGORIA DE PRODUTO
   dele em poucas palavras, específica (ex.: "assistente de IA no WhatsApp para finanças, lembretes e agenda").
2. Pesquise na web EMPRESAS/PRODUTOS da MESMA categoria que atendem o Brasil e têm perfil OFICIAL no Instagram ou no
   TikTok (o perfil da marca, não de quem fala dela). {foco} Traga de 6 a 10.
   Se o negócio for LOCAL, só empresas da mesma cidade.
3. 'instagram' e 'tiktok': o @ oficial sem @ (vazio se não confirmou). Só @ que você confirmou na pesquisa.
4. 'o_que_vende': 1 frase. Não repita perfis que o usuário já informou."""


# duas pesquisas em paralelo, por ângulos diferentes: mais marcas e metade do tempo de uma pesquisa longa
FOCOS = ["Foco: quem vende a MESMA solução completa (o mesmo produto, do mesmo jeito).",
         "Foco: quem resolve CADA função principal do produto separadamente (ex.: só finanças, só agenda, só lembretes)."]


class PlanoPreciso(BaseModel):
    termos_instagram: list[str]
    termos_tiktok: list[str]


INSTRUCOES_PLANO = """Você monta buscas para achar, no Instagram e no TikTok, perfis do MESMO mercado do usuário.
Use os perfis que ele já informou como modelo (como se descrevem na bio, que produto vendem, que público atendem).
- 'termos_instagram': 5 buscas como alguém digitaria para achar MARCAS/PRODUTOS da mesma categoria (o que a bio delas
  diria: categoria + "app", "assistente", "ia", o serviço). 'termos_tiktok': 5 buscas por assunto de conteúdo.
- Em português, 2 a 4 palavras, sem nomes de marcas. Negócio LOCAL: metade das buscas com a cidade."""


class Escolhido(BaseModel):
    plataforma: Literal["instagram", "tiktok"]
    conta: str
    eh_marca_oficial: bool       # perfil oficial de empresa/produto (não pessoa que fala/demonstra produtos)
    produto: str                 # o que vende (marca) ou do que fala (criador), em poucas palavras
    tipo: Literal["concorrente", "referencia"]
    confianca: int               # 0-100: certeza de que vale ele acompanhar
    motivo: str
    comparacao: str


class Ranking(BaseModel):
    escolhidos: list[Escolhido]


INSTRUCOES_RANKING = """Você escolhe, entre candidatos REAIS, quem o usuário deve acompanhar. Seja rigoroso: ele vai
avaliar um por um. Use a base (brief, perfil dele, concorrentes e referências que ELE informou) como gabarito.
- 'tipo' = 'concorrente' SÓ se 'eh_marca_oficial' e vende a MESMA categoria de produto para o mesmo público (siga a
  regra de concorrência da base: negócio local, mesma cidade). Influenciador, criador, agência ou perfil pessoal que
  fala, ensina ou DEMONSTRA produtos NUNCA é concorrente: no máximo 'referencia'.
- 'referencia' = não disputa o cliente, mas o conteúdo serve ao mesmo público ou mostra formatos que ele pode usar.
- Descarte: fora do mercado, homônimos, fã-clubes, estrangeiros sem público no Brasil, contas sem relação.
- 'confianca' 0-100 (abaixo de 45 nem inclua). Candidatos com origem "web" foram confirmados como marcas da categoria.
- 'produto': o que vende ou do que fala, em poucas palavras. 'motivo': 1 frase concreta do que o perfil faz.
- 'comparacao': 1 frase curta comparando com o usuário (ex.: "Também é IA no WhatsApp, mas só para finanças").
- Até {limite}, os melhores primeiro, equilibrando Instagram e TikTok quando houver bons nos dois. Use só contas da
  lista, com a mesma grafia. Português do Brasil."""


def _base():
    """Texto com tudo o que sabemos do usuário e dos perfis que ele informou."""
    uid = ctx.usuario()
    linhas = db.todos("""select c.plataforma, c.conta, a.papel, a.nota from acompanhamentos a join contas c on c.id = a.conta_id
                         where a.usuario_id = %s""", uid)
    chave = lambda l: f"{l['plataforma']}/{l['conta']}"
    proprios = parecidos._marcas_base([chave(l) for l in linhas if l["papel"] == "proprio"])
    conhecidos = {chave(l): l for l in linhas if l["papel"] in ("concorrente", "referencia")}
    info = {x["perfil"]: x for x in parecidos._marcas_base(list(conhecidos))}
    partes = [memoria.contexto()]
    if proprios:
        partes.append("## Perfil do usuário\n" + "\n".join(json.dumps(x, ensure_ascii=False, default=str) for x in proprios))
    for papel, titulo in (("concorrente", "Concorrentes diretos que ELE informou"), ("referencia", "Referências que ELE informou")):
        doPapel = [l for l in conhecidos.values() if l["papel"] == papel]
        if doPapel:
            partes.append(f"## {titulo}\n" + "\n".join(
                json.dumps({**(info.get(f"@{l['conta']} ({l['plataforma']})") or {"perfil": f"@{l['conta']} ({l['plataforma']})"}),
                            "nota": l.get("nota") or None}, ensure_ascii=False, default=str) for l in doPapel))
    return "\n\n".join(partes), len(proprios), sum(1 for l in conhecidos.values() if l["papel"] == "concorrente"), \
        sum(1 for l in conhecidos.values() if l["papel"] == "referencia")


def _confirmar(plataforma, conta):
    """Confirma um @ achado na web e traz bio, foto e seguidores."""
    from .. import busca_perfis
    conta = conta.strip().lstrip("@").split("/")[-1].split("?")[0].lower()
    if not conta:
        return None
    try:
        if plataforma == "instagram":
            p = sc.perfil_instagram(conta)
            if (p["perfil"] or {}).get("privado"):
                return None
            return {"plataforma": "instagram", "conta": conta, "nome": p["nome"], "foto": p["foto"], "seguidores": p["seguidores"],
                    "bio": (p["perfil"] or {}).get("bio"), "categoria_ig": (p["perfil"] or {}).get("categoria")}
        e = busca_perfis._exato("tiktok", conta)
        return e and {"plataforma": "tiktok", "conta": conta, "nome": e["nome"], "foto": e["foto"], "seguidores": e["seguidores"], "bio": None}
    except Exception:
        return None


def _pela_web(base):
    with ThreadPoolExecutor(2) as ex:
        respostas = list(ex.map(ctx.em_contexto(lambda foco: cliente.com_busca_na_web(
            "relatorio", INSTRUCOES_WEB.replace("{foco}", foco), base, MarcasWeb)), FOCOS))
    respostas = [r for r in respostas if r]
    if not respostas:
        return "", []
    marcas, vistos = [], set()
    for r in respostas:
        for m in r.marcas:
            if _normalizar(m.nome) not in vistos:
                vistos.add(_normalizar(m.nome))
                marcas.append(m)
    pedidos = []
    for m in marcas[:18]:
        if m.instagram.strip() or not m.tiktok.strip():
            pedidos.append(("instagram", m.instagram, m))   # sem @: procura pelo nome
        if m.tiktok.strip():
            pedidos.append(("tiktok", m.tiktok, m))
    achados = []
    with ThreadPoolExecutor(6) as ex:
        for (plat, _, m), c in zip(pedidos, ex.map(ctx.em_contexto(lambda p: _confirmar(p[0], p[1]) or _pelo_nome(p[0], p[2].nome)), pedidos)):
            if c and not any(a["conta"] == c["conta"] and a["plataforma"] == c["plataforma"] for a in achados):
                achados.append({**c, "buscas": 3, "origem": "web", "exemplos": [f"{m.nome}: {m.o_que_vende}"]})
    return respostas[0].categoria, achados


def _normalizar(t):
    import unicodedata
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in t if ch.isalnum())


def _pelo_nome(plataforma, nome):
    """O @ da web veio errado ou vazio: procura a marca pelo nome na rede e confirma."""
    alvo = _normalizar(nome)
    if len(alvo) < 3:
        return None
    try:
        for u in sc.buscar_perfis(plataforma, nome)[:5]:
            if alvo in _normalizar(u["conta"]) or alvo in _normalizar(u.get("nome")):
                return _confirmar(plataforma, u["conta"])
    except Exception:
        return None
    return None


def _pelas_redes(base):
    plano = cliente.estruturado("criacao", INSTRUCOES_PLANO, base, PlanoPreciso, esforco="low")
    p = parecidos.PlanoBusca(perfil_ideal="", termos_instagram=plano.termos_instagram, termos_tiktok=plano.termos_tiktok)
    candidatos, _ = parecidos._coletar(p, 5)
    return candidatos


def buscar(forcar=False):
    base, n_proprios, n_conc, n_ref = _base()
    assinatura = hashlib.sha1(base.encode()).hexdigest()[:16]
    guardado = memoria.ler_documento("descobrir_inicio", {})
    seguidos, descartados = parecidos._ja_conhecidos()
    if not forcar and guardado.get("assinatura") == assinatura and guardado.get("ate", 0) > time.time():
        return parecidos._filtrar(guardado["resultado"], seguidos, descartados)

    redes = sc.ativo() and sc.com_credito()
    with ctx.em_operacao("parecidos"), ThreadPoolExecutor(2) as ex:
        f_web = ex.submit(ctx.em_contexto(_pela_web), base)
        f_redes = ex.submit(ctx.em_contexto(_pelas_redes), base) if redes else None
        categoria, da_web = f_web.result()
        das_redes = f_redes.result() if f_redes else []

    candidatos = {}
    for c in da_web + das_redes:
        k = (c["plataforma"], c["conta"])
        if k in seguidos or k in descartados or c.get("privado"):
            continue
        if c.get("origem") != "web" and c.get("seguidores") is not None and c["seguidores"] < parecidos.MINIMO_SEGUIDORES:
            continue
        if k in candidatos:
            candidatos[k]["buscas"] += c.get("buscas", 1)
            candidatos[k]["origem"] = candidatos[k].get("origem") or c.get("origem")
        else:
            candidatos[k] = dict(c)
    lista = sorted(candidatos.values(), key=lambda c: (c.get("origem") != "web", -c.get("buscas", 1), -(c.get("seguidores") or 0)))[:60]
    itens = []
    if lista:
        entrada = base + (f"\n\n## Categoria de produto do usuário\n{categoria}" if categoria else "") + f"\n\n## Candidatos ({len(lista)})\n" + "\n".join(
            json.dumps({"plataforma": c["plataforma"], "conta": c["conta"], "nome": c.get("nome"), "seguidores": c.get("seguidores"),
                        "origem": c.get("origem") or "busca", "bio": c.get("bio"), "categoria_instagram": c.get("categoria_ig"),
                        "exemplos": c.get("exemplos") or None}, ensure_ascii=False) for c in lista)
        with ctx.em_operacao("parecidos"):
            r = cliente.estruturado("relatorio", INSTRUCOES_RANKING.replace("{limite}", str(LIMITE)), entrada, Ranking, esforco="low")
        por_chave = {(c["plataforma"], c["conta"]): c for c in lista}
        for e in r.escolhidos:
            c = por_chave.get((e.plataforma, e.conta.lstrip("@").lower()))
            if not c or e.confianca < CONFIANCA_MINIMA or any(x["conta"] == c["conta"] and x["plataforma"] == c["plataforma"] for x in itens):
                continue
            tipo = e.tipo if e.eh_marca_oficial else "referencia"   # quem só fala/demonstra produto nunca é concorrente
            itens.append({"plataforma": c["plataforma"], "conta": c["conta"], "nome": c.get("nome"), "foto": c.get("foto"),
                          "seguidores": c.get("seguidores"), "bio": c.get("bio") or (c.get("exemplos") or [None])[0],
                          "tipo": tipo, "semelhanca": max(0, min(100, e.confianca)), "grupo": "mercado", "parecido_com": [],
                          "motivo": e.motivo, "comparacao": e.comparacao, "produto": e.produto, "marca_oficial": e.eh_marca_oficial,
                          "fonte": c.get("origem") or "busca"})
            if len(itens) >= LIMITE:
                break
    resultado = {"itens": itens, "categoria": categoria,
                 "base": {"proprios": n_proprios, "concorrentes": n_conc, "referencias": n_ref}}
    memoria.gravar_documento("descobrir_inicio", {"assinatura": assinatura, "ate": time.time() + 24 * 3600, "resultado": resultado})
    parecidos._registrar(itens)
    return parecidos._filtrar(resultado, seguidos, descartados)
