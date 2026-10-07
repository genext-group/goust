"""Análise conjunta de uma marca nas plataformas onde ela está (TikTok × Instagram).

Parte dos relatórios de cada conta (já feitos) e responde: a marca é a mesma nas duas plataformas? O que muda
em posicionamento, público, tom, formatos, pilares, frequência e desempenho? O que funciona em cada uma?
Ela reaproveita conteúdo ou adapta? E o que isso significa para o usuário (concorrente × referência)?
"""
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db
from . import cliente, memoria, perfil

NOME = {"tiktok": "TikTok", "instagram": "Instagram"}


class ComoE(BaseModel):
    plataforma: Literal["tiktok", "instagram"]
    como_e: str


class Diferenca(BaseModel):
    dimensao: Literal["posicionamento", "publico", "tom", "formatos", "pilares", "ganchos", "frequencia", "desempenho", "cta"]
    por_plataforma: list[ComoE]
    leitura: str                 # o que a diferença (ou a semelhança) significa, em 1 frase
    diferente: bool


class FuncionaEm(BaseModel):
    plataforma: Literal["tiktok", "instagram"]
    itens: list[str]


class Comparativo(BaseModel):
    resumo: str                          # a marca como um todo, em 2 a 3 frases
    consistencia: int                    # 0-10: quanto a marca é a mesma nas plataformas
    leitura_consistencia: str
    estrategia_multiplataforma: str      # reaproveita, adapta ou faz coisas diferentes? com exemplos
    diferencas: list[Diferenca]
    funciona_em_cada: list[FuncionaEm]
    plataforma_mais_forte: Literal["tiktok", "instagram", "equilibrado"]
    por_que_mais_forte: str
    para_voce: list[str]                 # o que o usuário faz com isso (até 4)


INSTRUCOES = """Você compara a presença de UMA marca em plataformas diferentes (TikTok e Instagram), a partir dos
relatórios de cada conta. Seja concreto e use os números fornecidos.
- 'resumo': quem é a marca no conjunto e como ela usa cada plataforma (2 a 3 frases).
- 'consistencia' 0-10 (10 = mesma mensagem, mesmo tom e mesmo público nas duas) e 'leitura_consistencia' (1 frase).
- 'estrategia_multiplataforma': ela reaproveita o mesmo conteúdo, adapta ou faz coisas diferentes? Cite exemplos.
- 'diferencas': 4 a 7 dimensões mais relevantes; em cada uma diga como é em CADA plataforma e o que isso significa.
  Marque 'diferente' = false quando for igual nas duas (consistência também é informação).
- 'funciona_em_cada': até 3 itens por plataforma, do que performa melhor ali.
- 'plataforma_mais_forte' e por quê (alcance, engajamento, frequência, maturidade).
- 'para_voce': até 4 ações para o usuário. Siga o enquadramento: se a marca é CONCORRENTE, brechas e onde
  disputar; se é REFERÊNCIA, o que adaptar ao negócio dele em cada plataforma.
- Até 2 frases por texto. Nunca escreva ids de vídeos. Português do Brasil."""


def contas_da_marca(mid):
    linhas = db.todos("""select c.plataforma, c.conta, a.papel, a.aspectos, a.nota, m.nome as marca
                         from acompanhamentos a join contas c on c.id = a.conta_id join marcas m on m.id = a.marca_id
                         where a.usuario_id = %s and a.marca_id = %s order by c.plataforma""", ctx.usuario(), mid)
    if not linhas:
        raise ValueError("Marca não encontrada.")
    return linhas


def _bloco(c, r):
    rel = r["relatorio"]
    campos = ("resumo_executivo", "posicionamento", "mensagens_centrais", "dores_e_desejos", "pilares", "formatos",
              "ganchos", "o_que_performa", "o_que_nao_performa", "cadencia", "ctas", "notas")
    return json.dumps({"plataforma": NOME[c["plataforma"]], "conta": f"@{c['conta']}", "metricas": r["metricas"],
                       "analisado_em": r["gerado"][:10], **{k: rel.get(k) for k in campos if rel.get(k) is not None}},
                      ensure_ascii=False, default=str)


def comparar(mid, progresso=lambda e, f, t: None):
    contas = contas_da_marca(mid)
    progresso("Juntando as análises de cada plataforma", 0, 2)
    pares = [(c, perfil.obter(c["plataforma"], c["conta"])) for c in contas]
    faltam = [f"@{c['conta']} no {NOME[c['plataforma']]}" for c, r in pares if not r]
    if faltam:
        raise ValueError("Analise primeiro: " + ", ".join(faltam) + ". A comparação usa a análise de cada plataforma.")
    if len(pares) < 2:
        raise ValueError("A marca precisa estar em duas plataformas para comparar.")
    enquadramento = perfil.enquadramento(contas[0])
    entrada = (memoria.contexto() + enquadramento + f"\n\n## Marca: {contas[0]['marca']}\n"
               + "\n\n".join(_bloco(c, r) for c, r in pares))
    progresso("Comparando as plataformas", 1, 2)
    comp = cliente.estruturado("relatorio", INSTRUCOES, entrada, Comparativo, esforco="low")
    agora = datetime.now()
    resultado = {"versao": agora.strftime("%Y%m%d-%H%M%S"), "gerado": agora.isoformat(timespec="seconds"),
                 "marca": contas[0]["marca"], "papel": contas[0]["papel"],
                 "contas": [{"plataforma": c["plataforma"], "conta": c["conta"], "relatorio": r["versao"],
                             "metricas": r["metricas"]} for c, r in pares],
                 "comparativo": comp.model_dump()}
    db.executar("insert into analises_marca (usuario_id, marca_id, versao, dados) values (%s, %s, %s, %s)",
                ctx.usuario(), mid, resultado["versao"], resultado)
    progresso("Concluído", 2, 2)
    return resultado


def obter(mid):
    """Último comparativo + se está desatualizado (alguma plataforma foi reanalisada depois)."""
    contas = contas_da_marca(mid)
    r = db.um("""select dados from analises_marca where usuario_id = %s and marca_id = %s
                 order by gerado_em desc limit 1""", ctx.usuario(), mid)
    atuais = {f"{c['plataforma']}/{c['conta']}": (perfil.obter(c["plataforma"], c["conta"]) or {}).get("versao") for c in contas}
    dados = r["dados"] if r else None
    desatualizado = bool(dados) and any(atuais.get(f"{x['plataforma']}/{x['conta']}") != x["relatorio"] for x in dados["contas"])
    return {"comparativo": dados, "desatualizado": desatualizado,
            "faltam": [k for k, v in atuais.items() if not v], "marca": contas[0]["marca"]}
