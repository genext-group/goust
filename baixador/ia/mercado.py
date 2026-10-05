"""Panorama do mercado: compara todos os perfis já analisados."""
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from . import cliente, memoria, perfil
from .cliente import PASTA_IA
from .perfil import Ideia, Item, Oportunidade

PASTA_MERCADO = PASTA_IA / "mercado"
PASTA_MERCADO.mkdir(parents=True, exist_ok=True)


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
Português do Brasil, específico, com números."""


def versoes():
    return sorted((f.stem for f in PASTA_MERCADO.glob("*.json")), reverse=True)


def obter(versao=None):
    vs = versoes()
    if not vs:
        return None
    alvo = versao if versao in vs else vs[0]
    return json.loads((PASTA_MERCADO / f"{alvo}.json").read_text(encoding="utf-8"))


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
    (PASTA_MERCADO / f"{resultado['versao']}.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    progresso("Concluído", 1, 1)
    return resultado
