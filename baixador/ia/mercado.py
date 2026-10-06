"""Panorama do mercado: compara todos os perfis já analisados."""
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db
from . import cliente, memoria, perfil
from .perfil import Ideia, Item, Oportunidade



class Concorrente(BaseModel):
    perfil: str  # "plataforma/conta"
    posicionamento_curto: str
    publico: str
    tom: str
    forca_principal: str
    fraqueza_principal: str
    nivel_de_ameaca: Literal["alto", "medio", "baixo"]


class Benchmark(BaseModel):
    metrica: str
    lider: str
    valor: str
    comentario: str


class Panorama(BaseModel):
    resumo_do_mercado: str
    concorrentes: list[Concorrente]
    narrativas_dominantes: list[Item]
    temas_saturados: list[Item]
    espacos_em_branco: list[Oportunidade]
    tendencias: list[Item]
    benchmarks: list[Benchmark]
    recomendacoes_para_voce: list[Oportunidade]
    ideias_de_conteudo: list[Ideia]


INSTRUCOES = """Você é um estrategista sênior de marca e conteúdo no Brasil. Recebe os relatórios dos perfis
concorrentes já analisados e escreve um panorama do mercado para o usuário.
- Compare: quem se posiciona como o quê, quem fala com quem, quem performa melhor e por quê.
- 'narrativas_dominantes' e 'temas_saturados': o que todos dizem (difícil se diferenciar ali).
- 'espacos_em_branco': posicionamentos, dores, formatos ou públicos que NINGUÉM ocupa bem. Concretos.
- 'recomendacoes_para_voce' e 'ideias_de_conteudo': para o usuário vencer nesse mercado (ideias originais).
- Em 'videos' dos itens use ids de vídeos citados nos relatórios, quando houver; senão lista vazia.
  NUNCA escreva ids no meio do texto; descreva o vídeo pelo conteúdo.
- 'perfil' de cada concorrente no formato plataforma/conta exatamente como recebido.
Português do Brasil, específico, com números.

CONCISÃO (obrigatório): cada lista com no máximo 5 itens — só os mais fortes e mais acionáveis; cada texto em até
2 frases; não repita a mesma ideia em seções diferentes. Qualidade acima de quantidade."""


def versoes():
    return [r["versao"] for r in db.todos("select versao from panoramas where usuario_id = %s order by versao desc",
                                          ctx.usuario())]


def obter(versao=None):
    if versao:
        r = db.um("select dados from panoramas where usuario_id = %s and versao = %s", ctx.usuario(), versao)
        if r:
            return r["dados"]
    r = db.um("select dados from panoramas where usuario_id = %s order by versao desc limit 1", ctx.usuario())
    return r["dados"] if r else None


def gerar(progresso=lambda etapa, feito, total: None):
    blocos, perfis = [], []
    for chave in perfil.resumo_todos():
        plataforma, conta = chave.split("/", 1)
        r = perfil.obter(plataforma, conta)
        rel = r["relatorio"]
        perfis.append(chave)
        blocos.append(json.dumps({
            "perfil": chave, "metricas": r["metricas"], "gerado": r["gerado"][:10],
            **{k: rel[k] for k in ("resumo_executivo", "posicionamento", "mensagens_centrais", "dores_e_desejos",
                                   "pilares", "formatos", "ganchos", "o_que_performa", "pontos_fortes", "pontos_fracos", "notas")},
        }, ensure_ascii=False))
    if len(blocos) < 2:
        raise ValueError("Analise pelo menos 2 perfis antes de gerar o panorama do mercado.")

    progresso("Comparando os concorrentes", 0, 1)
    entrada = memoria.contexto() + "\n\n## Relatórios dos concorrentes\n" + "\n\n".join(blocos)
    panorama = cliente.estruturado("relatorio", INSTRUCOES, entrada, Panorama, esforco="medium")
    agora = datetime.now()
    resultado = {
        "versao": agora.strftime("%Y%m%d-%H%M%S"),
        "gerado": agora.isoformat(timespec="seconds"),
        "perfis": perfis,
        "aprendizados_versao": memoria.aprendizados()["versao"],
        "panorama": panorama.model_dump(),
    }
    db.executar("insert into panoramas (usuario_id, versao, gerado_em, dados) values (%s, %s, %s, %s)",
                ctx.usuario(), resultado["versao"], agora, resultado)
    progresso("Concluído", 1, 1)
    return resultado
