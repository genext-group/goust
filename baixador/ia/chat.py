"""Perguntas livres sobre um perfil ou sobre o mercado inteiro."""
import json

from . import cliente, memoria, mercado, perfil, video
from .. import biblioteca

INSTRUCOES = """Você é o analista de concorrentes do usuário, especialista em conteúdo curto (TikTok/Reels) no Brasil.
Responda com base nos dados fornecidos (relatórios, análises de vídeos e transcrições). Seja direto e específico:
cite números e vídeos (pelo id entre colchetes, ex.: [DdpRBd2BSF7]) quando usar um exemplo. Se os dados não
permitem responder, diga o que falta. Use markdown leve (listas curtas, negrito pontual). Português do Brasil."""


def _contexto_perfil(plataforma, conta):
    r = perfil.obter(plataforma, conta)
    partes = []
    if r:
        partes.append(f"## Relatório de @{conta} ({plataforma}), gerado em {r['gerado'][:10]}\n"
                      + json.dumps(r["relatorio"], ensure_ascii=False))
    vids = [v for v in biblioteca.videos() if v["plataforma"] == plataforma and v["conta"] == conta]
    linhas = []
    for v in vids:
        a = video.obter(plataforma, v["id"])
        if a:
            linhas.append(json.dumps({"id": v["id"], "data": v["data"][:10], "views": v["views"], "likes": v["likes"],
                                      "pilar": a["pilar"], "formato": a["formato"], "gancho": a["gancho"]["frase_ou_texto"],
                                      "mensagem": a["mensagem_central"], "cta": a["cta"],
                                      "fala": (a.get("transcricao") or "")[:700]}, ensure_ascii=False))
    if linhas:
        partes.append("## Vídeos analisados\n" + "\n".join(linhas))
    if not partes:
        partes.append(f"(Ainda não há análise de @{conta}. Responda com o que der e sugira analisar o perfil.)")
    return "\n\n".join(partes)


def _contexto_mercado():
    partes = []
    p = mercado.obter()
    if p:
        partes.append("## Panorama do mercado\n" + json.dumps(p["panorama"], ensure_ascii=False))
    for chave, r in perfil.resumo_todos().items():
        plataforma, conta = chave.split("/", 1)
        rel = perfil.obter(plataforma, conta)["relatorio"]
        partes.append(f"## {chave}\n" + json.dumps({k: rel[k] for k in ("resumo_executivo", "posicionamento", "pilares",
                                                                         "ganchos", "pontos_fortes", "pontos_fracos")}, ensure_ascii=False))
    return "\n\n".join(partes) or "(Nenhum perfil analisado ainda.)"


def responder(escopo, mensagens):
    """escopo: {"tipo": "perfil", "plataforma", "conta"} ou {"tipo": "mercado"}; mensagens: [{papel, texto}]"""
    dados = _contexto_perfil(escopo["plataforma"], escopo["conta"]) if escopo.get("tipo") == "perfil" else _contexto_mercado()
    historico = "\n\n".join(f"{'Usuário' if m['papel'] == 'usuario' else 'Analista'}: {m['texto']}" for m in mensagens[-12:])
    entrada = f"{memoria.contexto()}\n\n# Dados\n{dados}\n\n# Conversa\n{historico}\n\nAnalista:"
    return cliente.texto("criacao", INSTRUCOES, entrada, esforco="low")
