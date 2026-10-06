"""Seu perfil: rascunho do brief, diagnóstico (você contra os concorrentes) e estratégia.

O diagnóstico cruza o relatório do(s) seu(s) perfil(is), os relatórios dos concorrentes, a voz do
público e uma tabela de métricas calculada aqui (números reais, não estimados pela IA).
"""
import json
import re
from datetime import datetime
from typing import Literal

from curl_cffi import requests
from pydantic import BaseModel

from .. import biblioteca, db
from .. import contexto as ctx
from . import cliente, memoria, perfil
from .perfil import Ideia, Item, Oportunidade

# ---------------------------------------------------------------- contas do usuário


def contas_por_papel():
    linhas = db.todos("""select c.id, c.plataforma, c.conta, c.nome, c.seguidores, c.perfil, a.papel
                         from acompanhamentos a join contas c on c.id = a.conta_id where a.usuario_id = %s""",
                      ctx.usuario())
    proprias = [l for l in linhas if l["papel"] == "proprio"]
    concorrentes = [l for l in linhas if l["papel"] != "proprio"]
    return proprias, concorrentes


def tabela_metricas(contas):
    """Números comparáveis por conta: seguidores, ritmo, medianas e engajamento."""
    saida = []
    for c in contas:
        vids = biblioteca.videos(c["plataforma"], c["conta"])
        m = perfil.metricas(vids) if vids else {}
        mix = perfil.mix_e_cadencia(vids)["mix_de_formatos"] if vids else {}
        saida.append({
            "perfil": f"{c['plataforma']}/{c['conta']}", "nome": c["nome"], "seguidores": c["seguidores"],
            "posts": len(vids), "posts_por_semana": m.get("posts_por_semana"),
            "mediana_views": m.get("mediana_views"), "mediana_likes": m.get("mediana_likes"),
            "mediana_engajamento_pct": m.get("mediana_engajamento"),
            "mix": {k: v["posts"] for k, v in mix.items()},
        })
    return saida


# ---------------------------------------------------------------- rascunho do brief

class Brief(BaseModel):
    nome: str
    produto: str
    publico: str
    dores_do_publico: str
    objetivos: str
    metas: str
    onde_quer_chegar: str
    posicionamento_desejado: str
    tom: str
    diferenciais: str
    frequencia_possivel: str
    recursos_producao: str
    restricoes: str


def _texto_do_site(url):
    try:
        html = requests.get(url, impersonate="chrome", timeout=20).text
    except Exception:
        return ""
    html = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    return " ".join(re.sub(r"(?s)<[^>]+>", " ", html).split())[:6000]


def rascunhar_brief(site=None):
    """Lê seus perfis (bio, legendas, análises) e o site, e propõe um brief para você revisar."""
    proprias, concorrentes = contas_por_papel()
    if not proprias and not site:
        raise ValueError("Adicione o seu perfil (em Meu perfil) ou informe o site para a IA rascunhar o brief.")
    partes = []
    for c in proprias:
        p = c["perfil"] or {}
        vids = biblioteca.videos(c["plataforma"], c["conta"])[:20]
        partes.append(f"## @{c['conta']} ({c['plataforma']}) · {c['nome']} · {c['seguidores']} seguidores\n"
                      f"Bio: {p.get('bio')!r} · links: {json.dumps(p.get('links') or [], ensure_ascii=False)}\n"
                      "Legendas recentes:\n" + "\n".join(f"- {v['legenda'][:300]}" for v in vids if v["legenda"]))
        rel = perfil.obter(c["plataforma"], c["conta"])
        if rel:
            partes.append("Análise do perfil: " + json.dumps({k: rel["relatorio"][k] for k in ("resumo_executivo", "posicionamento")},
                                                              ensure_ascii=False))
    if site:
        partes.append(f"## Site {site}\n{_texto_do_site(site)}")
    if concorrentes:
        partes.append("## Concorrentes que acompanha\n" + ", ".join(f"@{c['conta']}" for c in concorrentes))
    atual = memoria.marca()
    partes.append("## O que o usuário já escreveu (mantenha e melhore, não descarte)\n"
                  + json.dumps({k: v for k, v in atual.items() if v}, ensure_ascii=False))
    r = cliente.estruturado(
        "criacao",
        "Você é um estrategista de marca. Proponha o BRIEF de conteúdo deste criador/marca a partir dos dados. "
        "Português do Brasil, frases curtas e concretas. Onde não houver evidência (ex.: metas em números, recursos "
        "de produção), escreva uma sugestão marcada com '(sugestão — confirme)'. Metas sempre com número e prazo.",
        "\n\n".join(partes), Brief, esforco="low")
    return {**r.model_dump(), "site": site or atual.get("site", "")}


# ---------------------------------------------------------------- diagnóstico + estratégia

class LinhaBenchmark(BaseModel):
    metrica: str
    voce: str
    media_concorrentes: str
    melhor: str
    leitura: str


class Pilar(BaseModel):
    nome: str
    objetivo: str
    participacao_pct: int
    formatos: list[str]
    temas: list[str]


class MixFormato(BaseModel):
    formato: str
    por_semana: float
    por_que: str


class Meta(BaseModel):
    metrica: str
    atual: str
    meta_90_dias: str
    como: str


class Posicionamento(BaseModel):
    frase: str
    para_quem: str
    contra_quem: str
    por_que_voce: str


class Estrategia(BaseModel):
    resumo: str
    benchmark: list[LinhaBenchmark]
    onde_voce_esta_atras: list[Item]
    onde_voce_ganha: list[Item]
    o_que_adaptar_dos_concorrentes: list[Oportunidade]
    espacos_livres: list[Oportunidade]
    posicionamento_recomendado: Posicionamento
    pilares: list[Pilar]
    mix_de_formatos: list[MixFormato]
    tom_de_voz: str
    frequencia: str
    metas: list[Meta]
    prioridades_90_dias: list[Oportunidade]
    primeiras_ideias: list[Ideia]
    nivel_de_confianca: Literal["alto", "medio", "baixo"]
    o_que_falta_para_melhorar: list[str]


INSTRUCOES = """Você é o estrategista de conteúdo (TikTok/Reels) deste criador no Brasil.
Com o brief, a análise do(s) perfil(is) DELE, os relatórios dos concorrentes, a voz do público e a tabela
de métricas reais, escreva o diagnóstico e a estratégia DELE.
- 'benchmark': use APENAS os números da tabela fornecida (não invente). 'leitura' = o que o número significa.
- Diagnóstico honesto: onde ele está atrás e onde já ganha, com evidência.
- 'o_que_adaptar_dos_concorrentes': o que funciona para eles e cabe no brief dele (adaptar, não copiar).
- 'espacos_livres': posicionamentos, dúvidas do público, formatos ou temas que ninguém atende bem.
- Estratégia coerente com o brief (objetivo, metas, frequência possível, recursos e restrições). Se a frequência
  possível for baixa, não recomende algo inviável.
- 'pilares': 3 a 5, somando ~100%. 'metas': ligadas às metas do brief, com número e prazo de 90 dias.
- 'primeiras_ideias': 6 ideias de conteúdo prontas para o calendário (roteiro em 3 a 6 passos).
- Em 'videos' dos itens use ids de posts que aparecem nos dados; nunca escreva ids no texto.
- Se não houver perfil próprio analisado, diga isso em 'o_que_falta_para_melhorar' e baixe a confiança.
Português do Brasil, específico, com números.

CONCISÃO (obrigatório): cada lista com no máximo 5 itens — só os mais fortes e mais acionáveis; cada texto em até
2 frases; não repita a mesma ideia em seções diferentes. Qualidade acima de quantidade."""


def versoes():
    return [r["versao"] for r in db.todos("select versao from estrategias where usuario_id = %s order by versao desc",
                                          ctx.usuario())]


def obter(versao=None):
    if versao:
        r = db.um("select dados from estrategias where usuario_id = %s and versao = %s", ctx.usuario(), versao)
        if r:
            return r["dados"]
    r = db.um("select dados from estrategias where usuario_id = %s order by versao desc limit 1", ctx.usuario())
    return r["dados"] if r else None


def _bloco_relatorio(c, campos):
    r = perfil.obter(c["plataforma"], c["conta"])
    if not r:
        return None
    rel = r["relatorio"]
    return json.dumps({"perfil": f"{c['plataforma']}/{c['conta']}", **{k: rel.get(k) for k in campos if rel.get(k)}},
                      ensure_ascii=False)


def gerar(progresso=lambda etapa, feito, total: None):
    proprias, concorrentes = contas_por_papel()
    if not concorrentes:
        raise ValueError("Acompanhe pelo menos um concorrente antes de gerar a estratégia.")
    progresso("Comparando você com os concorrentes", 0, 1)
    campos_proprio = ("resumo_executivo", "posicionamento", "perfil_e_bio", "cadencia", "voz_do_publico", "pilares",
                      "formatos", "ganchos", "o_que_performa", "o_que_nao_performa", "pontos_fortes", "pontos_fracos", "notas")
    campos_conc = ("resumo_executivo", "posicionamento", "voz_do_publico", "pilares", "formatos", "ganchos",
                   "o_que_performa", "pontos_fortes", "pontos_fracos", "oportunidades_para_voce", "notas")
    blocos_proprios = [b for c in proprias if (b := _bloco_relatorio(c, campos_proprio))]
    # concorrente disputa o mesmo cliente (entra no benchmark); referência é inspiração (entra só como aprendizado)
    diretos = [c for c in concorrentes if c["papel"] != "referencia"] or concorrentes
    referencias = [c for c in concorrentes if c["papel"] == "referencia" and c not in diretos]
    blocos_conc = [b for c in diretos if (b := _bloco_relatorio(c, campos_conc))]
    blocos_ref = [b for c in referencias if (b := _bloco_relatorio(c, ("resumo_executivo", "posicionamento", "ganchos", "o_que_performa", "formatos")))]
    if not blocos_conc and not blocos_ref:
        raise ValueError("Analise pelo menos um concorrente com IA antes de gerar a estratégia.")
    panorama = None
    from . import mercado
    p = mercado.obter()
    if p:
        panorama = {k: p["panorama"].get(k) for k in ("resumo_do_mercado", "temas_saturados", "espacos_em_branco")}
    entrada = "\n\n".join(filter(None, [
        memoria.contexto(),
        "## Tabela de métricas reais\n" + json.dumps({"voce": tabela_metricas(proprias),
                                                      "concorrentes": tabela_metricas(diretos)}, ensure_ascii=False),
        "## Análise do(s) seu(s) perfil(is)\n" + ("\n".join(blocos_proprios) if blocos_proprios else
                                                  "(nenhum perfil próprio analisado ainda)"),
        "## Relatórios dos concorrentes diretos\n" + "\n".join(blocos_conc) if blocos_conc else None,
        "## Referências (não são concorrentes: inspiração do que adaptar, fora do benchmark)\n" + "\n".join(blocos_ref) if blocos_ref else None,
        "## Panorama do mercado\n" + json.dumps(panorama, ensure_ascii=False) if panorama else None,
    ]))
    est = cliente.estruturado("relatorio", INSTRUCOES, entrada, Estrategia, esforco="medium")
    agora = datetime.now()
    resultado = {"versao": agora.strftime("%Y%m%d-%H%M%S"), "gerado": agora.isoformat(timespec="seconds"),
                 "perfis_proprios": [f"{c['plataforma']}/{c['conta']}" for c in proprias],
                 "concorrentes": [f"{c['plataforma']}/{c['conta']}" for c in concorrentes],
                 "estrategia": est.model_dump()}
    db.executar("insert into estrategias (usuario_id, versao, gerado_em, dados) values (%s, %s, %s, %s)",
                ctx.usuario(), resultado["versao"], agora, resultado)
    progresso("Concluído", 1, 1)
    return resultado

