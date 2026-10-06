"""Relatório estratégico de um perfil concorrente, com histórico de versões."""
import json
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from .. import biblioteca, catalogo, db
from .. import contexto as ctx
from ..execucao import Continuar
from . import cliente, memoria, video

TEMPO_RELATORIO = 130  # segundos reservados para escrever o relatório (gpt-5.5) dentro do prazo
RECENTES, MAIS_VISTOS = 25, 15  # vídeos usados por análise (os mais recentes + os de maior alcance)


# ---------------------------------------------------------------- schema do relatório

class Item(BaseModel):
    texto: str
    videos: list[str]  # ids dos vídeos que sustentam a afirmação


class Posicionamento(BaseModel):
    proposta_de_valor: str
    publico_alvo: str
    categoria_percebida: str
    diferenciais: list[str]
    tom_de_voz: str
    arquetipo: str


class Pilar(BaseModel):
    nome: str
    descricao: str
    participacao_pct: int
    desempenho: Literal["acima", "na_media", "abaixo", "sem_dados"]
    videos: list[str]


class Formato(BaseModel):
    formato: str
    participacao_pct: int
    desempenho: Literal["acima", "na_media", "abaixo", "sem_dados"]
    observacao: str


class Gancho(BaseModel):
    padrao: str
    exemplo: str
    por_que_funciona: str
    videos: list[str]


class Oportunidade(BaseModel):
    titulo: str
    descricao: str
    acao_concreta: str
    prioridade: Literal["alta", "media", "baixa"]
    videos: list[str]


class Ideia(BaseModel):
    titulo: str
    gancho: str
    formato: str
    roteiro: list[str]
    inspirado_em: list[str]


class Notas(BaseModel):
    consistencia: int
    ganchos: int
    clareza_da_mensagem: int
    producao: int
    engajamento: int
    justificativa: str


class Cadencia(BaseModel):
    resumo: str
    melhores_dias: list[str]
    melhores_horarios: list[str]
    frequencia_recomendada: str


class VozDoPublico(BaseModel):
    sentimento_geral: str
    duvidas: list[Item]
    objecoes: list[Item]
    pedidos: list[Item]
    elogios: list[Item]


class Relatorio(BaseModel):
    resumo_executivo: str
    posicionamento: Posicionamento
    perfil_e_bio: list[Item]
    cadencia: Cadencia
    voz_do_publico: VozDoPublico
    mensagens_centrais: list[Item]
    dores_e_desejos: list[Item]
    provas_e_argumentos: list[Item]
    ctas: list[Item]
    pilares: list[Pilar]
    formatos: list[Formato]
    ganchos: list[Gancho]
    o_que_performa: list[Item]
    o_que_nao_performa: list[Item]
    pontos_fortes: list[Item]
    pontos_fracos: list[Item]
    oportunidades_para_voce: list[Oportunidade]
    ideias_de_conteudo: list[Ideia]
    mudancas_desde_ultima_analise: list[Item]
    notas: Notas


INSTRUCOES = """Você é um estrategista sênior de marca e conteúdo para vídeos curtos (TikTok e Reels) no Brasil.
Recebe a análise individual dos vídeos de UM perfil, com métricas, e produz um relatório estratégico para o
usuário. O perfil pode ser um CONCORRENTE, uma REFERÊNCIA (inspiração, talvez de outro mercado) ou o PRÓPRIO
perfil do usuário: siga o enquadramento informado no contexto, ele define o tom e o foco do relatório.

Como escrever:
- Português do Brasil. Específico, com números e exemplos tirados dos dados. Nada genérico.
- TODA afirmação com base em vídeos deve listar em 'videos' os ids que a sustentam (use os ids exatos
  fornecidos). Não invente ids. NUNCA escreva ids no meio do texto: o painel mostra as miniaturas a partir
  do campo 'videos'. No texto, cite o vídeo pelo que ele mostra (ex.: "o vídeo da fatura de R$ 5 mil, 3,7 mi de views").
- Desempenho: compare com a mediana DA PRÓPRIA CONTA ("acima" = claramente melhor). Sem métricas → "sem_dados".
- 'oportunidades_para_voce': para concorrente, como ganhar dele (lacunas, fraquezas exploráveis); para referência,
  o que adaptar ao negócio do usuário. Ação concreta, testável na próxima semana.
- 'ideias_de_conteudo': 5 ideias originais para o usuário (não copie o perfil), roteiro em 3 a 6 passos.
- 'mudancas_desde_ultima_analise': compare com o relatório anterior se houver; senão compare os últimos 30 dias
  com o período anterior. Se não houver mudança relevante, devolva lista vazia.
- 'notas' de 0 a 10.
- Pilares: agrupe os rótulos 'pilar' dos vídeos em 3 a 7 pilares; participação somando cerca de 100.
- Os posts podem ser Reels/vídeos, carrosséis ou fotos: compare o desempenho de cada tipo (o "Mix de formatos"
  traz contagem e medianas) e diga o que o perfil faz em cada um.
- 'perfil_e_bio': avalie bio, links e CTA do perfil (clareza da proposta, prova, chamada para ação, para onde o
  link leva) e o que o usuário pode aprender ou fazer melhor. Lista vazia se não houver dados do perfil.
- 'cadencia': use a tabela de dias/horários (horário de Brasília) para dizer quando publicam e quando performa
  melhor; recomende uma frequência para o USUÁRIO competir.
- 'voz_do_publico': leia os comentários reais. Agrupe em dúvidas, objeções, pedidos e elogios, cada item com
  uma frase-resumo + um exemplo literal entre aspas, e em 'videos' os ids dos posts onde apareceram. São a
  matéria-prima de roteiros: deixe claro o que o público quer saber e o que o impede de comprar. Sem comentários,
  devolva listas vazias e sentimento_geral "sem dados".

CONCISÃO (obrigatório): cada lista com no máximo 5 itens — só os mais fortes e mais acionáveis; cada texto em até
2 frases; não repita a mesma ideia em seções diferentes. Qualidade acima de quantidade."""


# ---------------------------------------------------------------- métricas

def _mediana(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def metricas(videos):
    datas = sorted(v["data"][:10] for v in videos if v["data"])
    semanas = None
    if len(datas) > 1:
        dias = (datetime.fromisoformat(datas[-1]) - datetime.fromisoformat(datas[0])).days or 1
        semanas = round(len(datas) / (dias / 7), 2)
    return {
        "videos": len(videos),
        "periodo": f"{datas[0]} a {datas[-1]}" if datas else None,
        "posts_por_semana": semanas,
        "mediana_views": _mediana([v["views"] for v in videos]),
        "media_views": round(statistics.mean([v["views"] for v in videos if v["views"] is not None])) if any(v["views"] is not None for v in videos) else None,
        "mediana_likes": _mediana([v["likes"] for v in videos]),
        "mediana_engajamento": _mediana([v["engajamento"] for v in videos]),
        "duracao_mediana_s": _mediana([v["duracao"] for v in videos]),
    }


DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def mix_e_cadencia(videos):
    """Contagem e desempenho por tipo de post, e posts/desempenho por dia da semana e faixa de horário (BRT)."""
    from datetime import timedelta
    mix = {}
    for tipo in sorted({v.get("tipo") or "video" for v in videos}):
        vs = [v for v in videos if (v.get("tipo") or "video") == tipo]
        mix[tipo] = {"posts": len(vs), "mediana_views": _mediana([v["views"] for v in vs]),
                     "mediana_likes": _mediana([v["likes"] for v in vs]),
                     "mediana_comentarios": _mediana([v["comentarios"] for v in vs])}
    dias, faixas = {}, {}
    for v in videos:
        if len(v["data"]) < 16:
            continue
        brt = datetime.fromisoformat(v["data"]) - timedelta(hours=3)
        for chave, tabela in ((DIAS[brt.weekday()], dias), (f"{brt.hour // 3 * 3:02d}h-{brt.hour // 3 * 3 + 3:02d}h", faixas)):
            tabela.setdefault(chave, []).append(v["likes"] or 0)
    resumo = lambda t: {k: {"posts": len(x), "mediana_likes": _mediana(x)} for k, x in sorted(t.items())}
    return {"mix_de_formatos": mix, "por_dia_da_semana": resumo(dias), "por_horario": resumo(faixas)}


def _comentarios_para_prompt(plataforma, conta, limite=150):
    cid = catalogo.conta_id(plataforma, conta, criar=False)
    if not cid:
        return []
    return [f"[{c['codigo']}] ({c['likes'] or 0} curtidas) {' '.join((c['texto'] or '').split())[:220]}"
            for c in catalogo.comentarios_da_conta(cid, limite)]


def _selecionar(videos):
    recentes = sorted(videos, key=lambda v: v["data"], reverse=True)[:RECENTES]
    vistos = sorted(videos, key=lambda v: v["views"] or v["likes"] or 0, reverse=True)[:MAIS_VISTOS]
    vistos_ids = {v["id"] for v in recentes}
    return recentes + [v for v in vistos if v["id"] not in vistos_ids]


# ---------------------------------------------------------------- armazenamento

def versoes(plataforma, conta):
    cid = catalogo.conta_id(plataforma, conta, criar=False)
    if not cid:
        return []
    return [r["versao"] for r in db.todos("""select versao from relatorios where usuario_id = %s and conta_id = %s
                                             order by versao desc""", ctx.usuario(), cid)]


def obter(plataforma, conta, versao=None):
    cid = catalogo.conta_id(plataforma, conta, criar=False)
    if not cid:
        return None
    if versao:
        r = db.um("select dados from relatorios where usuario_id = %s and conta_id = %s and versao = %s",
                  ctx.usuario(), cid, versao)
        if r:
            return r["dados"]
    r = db.um("select dados from relatorios where usuario_id = %s and conta_id = %s order by versao desc limit 1",
              ctx.usuario(), cid)
    return r["dados"] if r else None


def resumo_todos():
    """Último relatório de cada conta do usuário (só o essencial para listas e para o panorama)."""
    linhas = db.todos("""select distinct on (r.conta_id) c.plataforma, c.conta, r.dados from relatorios r
                         join contas c on c.id = r.conta_id where r.usuario_id = %s
                         order by r.conta_id, r.versao desc""", ctx.usuario())
    return {f"{l['plataforma']}/{l['conta']}": {"versao": l["dados"]["versao"], "gerado": l["dados"]["gerado"],
                                                "notas": l["dados"]["relatorio"]["notas"],
                                                "resumo": l["dados"]["relatorio"]["resumo_executivo"],
                                                "metricas": l["dados"]["metricas"]} for l in linhas}


# ---------------------------------------------------------------- geração

def _compactar(a, v):
    """Versão enxuta da análise de cada vídeo para caber no prompt do relatório."""
    return {
        "id": v["id"], "data": v["data"][:10], "views": v["views"], "likes": v["likes"], "comentarios": v["comentarios"],
        "engajamento_pct": v["engajamento"], "duracao_s": a.get("duracao"),
        "pilar": a["pilar"], "tema": a["tema"], "formato": a["formato"],
        "gancho": f"[{a['gancho']['tipo']}] {a['gancho']['frase_ou_texto']}",
        "mensagem": a["mensagem_central"], "promessa": a["promessa"], "dores": a["dores_ou_desejos"],
        "provas": a["provas_ou_argumentos"][:4], "cta": a["cta"], "tom": a["tom"],
        "producao": a["qualidade_producao"], "hipotese": a["hipotese_desempenho"],
        "fala": (a.get("transcricao") or "")[:500],
    }


ASPECTOS = {
    # referência: o que o usuário quer aprender
    "estilo_videos": "estilo dos vídeos (edição, ritmo, cortes, enquadramento)", "comunicacao": "comunicação e tom de voz",
    "formatos": "formatos de conteúdo", "ganchos": "ganchos e aberturas", "estetica": "estética visual e identidade",
    "posicionamento": "posicionamento de marca", "crescimento": "estratégia de crescimento",
    "comunidade": "comunidade e engajamento", "oferta": "como apresenta produto e oferta", "roteiro": "roteiro e narrativa",
    # concorrente: em que disputam
    "mesmo_publico": "disputa o mesmo público", "mesmo_produto": "vende algo parecido", "mesma_regiao": "atua na mesma região",
    "preco": "compete em preço", "lider": "é o líder com quem o mercado compara",
}


def enquadramento(vinculo):
    """Como a IA deve olhar o perfil, a partir do que o usuário disse sobre ele (papel, interesses, anotação)."""
    papel = vinculo.get("papel") or "concorrente"
    interesses = [ASPECTOS.get(a, a) for a in (vinculo.get("aspectos") or [])]
    nota = (vinculo.get("nota") or "").strip()
    if papel == "proprio":
        return ("\n\nATENÇÃO: este é o PERFIL DO PRÓPRIO USUÁRIO, não um concorrente. Escreva para ele melhorar: "
                "'oportunidades_para_voce' = melhorias no próprio perfil; 'ideias_de_conteudo' = próximos posts dele; "
                "'pontos_fracos' = o que corrigir primeiro.")
    partes = []
    if papel == "referencia":
        partes.append("ATENÇÃO: este perfil é uma REFERÊNCIA, NÃO um concorrente. O usuário acompanha para aprender com ele "
                      "(pode ser de outro mercado). Não use linguagem de disputa, ameaça ou brecha competitiva. "
                      "'oportunidades_para_voce' = o que adaptar para o negócio do usuário, de forma concreta; "
                      "'pontos_fracos' = o que NÃO copiar; 'ideias_de_conteudo' = ideias do usuário inspiradas no que "
                      "este perfil faz bem.")
        if interesses:
            partes.append("O que interessa ao usuário neste perfil (dê mais profundidade a isso): " + "; ".join(interesses) + ".")
    else:
        partes.append("Este perfil é um CONCORRENTE direto do usuário: compare, ache brechas e diferenciais.")
        if interesses:
            partes.append("Em que eles competem, segundo o usuário: " + "; ".join(interesses) + ".")
    if nota:
        partes.append(f'Anotação do usuário sobre este perfil (contexto prioritário): "{nota}"')
    return "\n\n" + "\n".join(partes)


def gerar(plataforma, conta, progresso=lambda etapa, feito, total: None, prazo=None):
    """Com prazo (nuvem), levanta Continuar se o tempo da mensagem acabar; as análises
    de vídeo já feitas ficam em cache, então a próxima mensagem retoma de onde parou."""
    todos = biblioteca.videos(plataforma, conta)
    if not todos:
        raise ValueError("Baixe alguns vídeos dessa conta antes de analisar.")
    met = metricas(todos)
    escolhidos = _selecionar(todos)

    feitos = [0]

    def analisar_um(v):
        try:
            a = video.analisar(v, met)
        except Exception:
            a = None
        feitos[0] += 1
        progresso("Analisando vídeos (áudio, imagem e legenda)", feitos[0], len(escolhidos))
        return (a, v) if a else None

    progresso("Analisando vídeos (áudio, imagem e legenda)", 0, len(escolhidos))
    pares = []
    with ThreadPoolExecutor(4) as ex:
        for i in range(0, len(escolhidos), 4):
            pares += [p for p in ex.map(ctx.em_contexto(analisar_um), escolhidos[i:i + 4]) if p]
            if prazo and i + 4 < len(escolhidos) and time.time() > prazo - TEMPO_RELATORIO:
                raise Continuar()
    if not pares:
        raise RuntimeError("Não foi possível analisar os vídeos.")
    if prazo and time.time() > prazo - TEMPO_RELATORIO:
        raise Continuar()  # deixa o relatório para a próxima mensagem, com tempo de sobra

    progresso("Escrevendo o relatório estratégico", 0, 1)
    anterior = obter(plataforma, conta)
    perfil = biblioteca.perfis().get(f"{plataforma}/{conta}") or {}
    conta_db = db.um("select perfil from contas where plataforma = %s and conta = %s", plataforma, conta) or {}
    dados_perfil = conta_db.get("perfil") or {}
    cid = catalogo.conta_id(plataforma, conta)
    seguidores_hist = [f"{r['dia']}: {r['seguidores']}" for r in catalogo.evolucao_seguidores(cid)][-30:]
    comentarios = _comentarios_para_prompt(plataforma, conta)
    vinculo = db.um("""select papel, aspectos, nota from acompanhamentos where usuario_id = %s and conta_id = %s""",
                    ctx.usuario(), cid) or {"papel": "concorrente", "aspectos": [], "nota": None}
    aviso = enquadramento(vinculo)
    entrada = (
        memoria.contexto() + aviso
        + f"\n\n## Perfil analisado\n@{conta} no {plataforma} · nome: {perfil.get('nome')} · seguidores: {perfil.get('seguidores')}"
        + (f"\nBio: {dados_perfil.get('bio')!r} · categoria: {dados_perfil.get('categoria')} · links: "
           + json.dumps(dados_perfil.get("links") or [], ensure_ascii=False) if dados_perfil else "")
        + (f"\nEvolução de seguidores: {', '.join(seguidores_hist)}" if len(seguidores_hist) > 1 else "")
        + f"\nMétricas da conta (todos os {met['videos']} posts catalogados): {json.dumps(met, ensure_ascii=False)}"
        + f"\nMix de formatos e cadência (horário de Brasília): {json.dumps(mix_e_cadencia(todos), ensure_ascii=False)}"
        + (f"\n\n## Comentários do público ({len(comentarios)}, mais curtidos primeiro; [id do post])\n" + "\n".join(comentarios)
           if comentarios else "\n\n## Comentários do público\n(nenhum coletado)")
        + (f"\n\n## Relatório anterior ({anterior['gerado'][:10]})\n"
           + json.dumps({k: anterior["relatorio"][k] for k in ("resumo_executivo", "posicionamento", "pilares", "pontos_fortes", "pontos_fracos")}, ensure_ascii=False)
           if anterior else "")
        + f"\n\n## Vídeos analisados ({len(pares)})\n"
        + "\n".join(json.dumps(_compactar(a, v), ensure_ascii=False) for a, v in pares)
    )
    relatorio = cliente.estruturado("relatorio", INSTRUCOES, entrada, Relatorio, esforco="medium")

    agora = datetime.now()
    resultado = {
        "versao": agora.strftime("%Y%m%d-%H%M%S"),
        "gerado": agora.isoformat(timespec="seconds"),
        "plataforma": plataforma,
        "conta": conta,
        "metricas": met,
        "videos_analisados": [v["id"] for _, v in pares],
        "aprendizados_versao": memoria.aprendizados()["versao"],
        "papel": vinculo["papel"],
        "contexto": {"aspectos": vinculo["aspectos"] or [], "nota": vinculo["nota"]},
        "relatorio": relatorio.model_dump(),
    }
    db.executar("insert into relatorios (usuario_id, conta_id, versao, gerado_em, dados) values (%s, %s, %s, %s, %s)",
                ctx.usuario(), catalogo.conta_id(plataforma, conta), resultado["versao"], agora, resultado)
    progresso("Concluído", 1, 1)
    return resultado
