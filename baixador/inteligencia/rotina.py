"""Rotina diária da central de inteligência (roda em segundo plano, por usuário).

Coleta → Normalização → Análise → Insights → Recomendações → Interface
- coleta_diaria(): pede posts novos do seu perfil e das contas mais desatualizadas (com limite);
  a coleta normaliza no catálogo e grava o histórico diário de métricas.
- rotina(): análise determinística (analise.py) → a IA redige os sinais e recomenda (ideias do dia,
  descoberta de referências, auditoria do que você acompanha) → tudo vira insight (insights.py).
Cada etapa é independente: se uma falhar, as outras continuam. As fontes (coleta, busca na web, modelo)
ficam atrás destas funções e podem ser trocadas sem mexer na home.
"""
import json
import time
import traceback
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel

from .. import db
from .. import contexto as ctx
from ..ia import cliente, conteudo, estrategia, lote, memoria
from . import analise, insights

LIMITE_COLETA_DIARIA = 6        # contas acompanhadas por dia (além do seu perfil)
DIAS_SEM_VISITA_PARA_IA = 3     # quem não abre o app há mais tempo fica só com coleta e cálculos (sem IA)
DIAS_SEM_VISITA_PARA_IDEIAS = 2 # ideias que ninguém vê são dinheiro jogado fora
DIAS_ENTRE_DESCOBERTAS = 7      # busca de referências na web: semanal
LIMITE_DESCOBERTAS_DIA = 6
INTERVALO_HORAS = 20            # não roda de novo antes disso


# ---------------------------------------------------------------- estado (em usuarios.config.inteligencia)

def estado():
    r = db.um("select config from usuarios where id = %s", ctx.usuario())
    return ((r or {}).get("config") or {}).get("inteligencia") or {}


def _gravar_estado(**kw):
    atual = {**estado(), **kw}
    db.executar("update usuarios set config = jsonb_set(config, '{inteligencia}', %s) where id = %s", atual, ctx.usuario())


def _ultima_visita():
    r = db.um("select config from usuarios where id = %s", ctx.usuario())
    return (((r or {}).get("config") or {}).get("visita") or {}).get("atual")


def precisa_rodar():
    e = estado()
    return not e.get("ultima") or time.time() - e["ultima"] > INTERVALO_HORAS * 3600


# ---------------------------------------------------------------- coleta

def coleta_diaria():
    """Posts novos do seu perfil + das contas mais desatualizadas. Devolve quantas coletas pediu."""
    from .. import tarefas as downloads
    proprias = analise.contas(("proprio",))
    outros = sorted(analise.contas(("concorrente", "referencia")),
                    key=lambda c: c["atualizado_em"] or datetime(1970, 1, 1, tzinfo=timezone.utc))
    alvo = proprias + outros[:LIMITE_COLETA_DIARIA]
    for c in alvo:
        downloads.enfileirar(c["plataforma"], c["conta"], {"modo": "novos", "somente_reels": False})
    _gravar_estado(ultima_coleta=time.time())
    return len(alvo)


# ---------------------------------------------------------------- redação dos sinais (IA)

class SinalRedigido(BaseModel):
    chave: str
    titulo: str
    detectamos: str
    por_que_importa: str
    acao: str
    tema_para_ideia: str


class Redacao(BaseModel):
    sinais: list[SinalRedigido]


INSTRUCOES_REDACAO = """Você é o analista de mercado deste criador. Recebe SINAIS calculados a partir dos posts dos
perfis que ele acompanha (números reais) e o brief dele. Para cada sinal escreva:
- 'titulo': até 55 caracteres, direto (ex.: "Carrosséis ganhando força", "@conta acelerou as publicações").
- 'detectamos': 1 frase com os números fornecidos (use SÓ os números dados; nunca invente).
- 'por_que_importa': 1 frase ligando ao negócio e ao público DELE (use o brief).
- 'acao': 1 instrução curta e concreta (verbo no imperativo).
- 'tema_para_ideia': um tema curto para gerar uma ideia de conteúdo a partir do sinal.
Seja cauteloso quando a confiança for baixa ("pode indicar", "vale testar").
Se os perfis acompanhados forem de outro nicho, diga o que dá para ADAPTAR, sem fingir que é o mercado dele.
Mantenha a 'chave' exatamente como recebida. Português do Brasil."""


def _entrada_redacao(sinais):
    return "\n\n".join(filter(None, [
        memoria.contexto(),
        "## Perfis acompanhados\n" + ", ".join(f"@{c['conta']} ({c['papel']})" for c in analise.contas(("concorrente", "referencia"))),
        "## Sinais\n" + json.dumps([{k: s[k] for k in ("chave", "tipo", "categoria", "assunto", "direcao", "magnitude", "confianca", "rotulo", "dados")}
                                     for s in sinais], ensure_ascii=False),
        insights.resumo_feedback(),
    ]))


@lote.tipo("redacao", Redacao)
def _aplicar_redacao(r, dados):
    """Registra como insight cada sinal redigido (os sinais vêm em `dados`, calculados na hora do pedido)."""
    pesos = insights.pesos_do_usuario()
    textos = {x.chave: x for x in r.sinais}
    for x in dados["sinais"]:
        t = textos.get(x["chave"])
        if not t:
            continue
        insights.registrar(x["tipo"], x["chave"], t.titulo, t.detectamos,
                           {"categoria": x["categoria"], "direcao": x["direcao"], "rotulo": x["rotulo"], "assunto": x["assunto"],
                            "por_que_importa": t.por_que_importa, "acao_texto": t.acao, "evidencias": x["evidencias"],
                            "estatistica": x["dados"],
                            "acao": {"tipo": "gerar_ideia", "tema": t.tema_para_ideia, "rotulo": "Gerar ideia"}},
                           magnitude=x["magnitude"], confianca=x["confianca"], pesos=pesos)


# ---------------------------------------------------------------- descoberta + auditoria (IA com busca na web)

class Descoberta(BaseModel):
    plataforma: Literal["instagram", "tiktok"]
    conta: str
    nome: str
    tipo: Literal["concorrente", "referencia"]
    categoria: Literal["crescendo", "criativo", "player", "engajamento", "emergente", "mesmo_publico"]
    motivo: str


class ForaDoNicho(BaseModel):
    conta: str
    motivo: str
    sugestao: Literal["referencia", "remover"]


class ResultadoDescoberta(BaseModel):
    sugestoes: list[Descoberta]
    fora_do_nicho: list[ForaDoNicho]


INSTRUCOES_DESCOBERTA = """Você faz a curadoria de perfis para este criador acompanhar (Instagram/TikTok, Brasil).
1) Pesquise na web e sugira até 8 perfis ATIVOS que valham a pena:
   - tipo 'concorrente': disputa o mesmo cliente/mercado;
   - tipo 'referencia': não é concorrente direto, mas tem estratégia, conteúdo, crescimento ou posicionamento
     útil para ele (pode ser de outro mercado, desde que o 'motivo' explique o que aprender).
   Categorias: crescendo, criativo, player (grande/relevante), engajamento (comunidade forte), emergente, mesmo_publico.
   'motivo' em 1 frase específica (o que esse perfil faz bem e por que serve para ELE). Só @ confirmados na pesquisa.
   Não repita perfis já acompanhados nem os descartados. Siga o retorno do usuário sobre sugestões anteriores.
2) Audite os perfis que ele JÁ acompanha como concorrente: liste em 'fora_do_nicho' os que claramente não são do
   mercado dele (com motivo curto). Sugestão 'referencia' se ainda servem de inspiração; 'remover' se não servem.
Português do Brasil."""


def _descobrir():
    marca = memoria.marca()
    proprias = analise.contas(("proprio",))
    acompanhadas = analise.contas(("concorrente", "referencia"))
    descartadas = db.todos("""select conta, tipo, categoria from descobertas where usuario_id = %s and estado in ('ignorada', 'oculta')
                              order by atualizado_em desc limit 30""", ctx.usuario())
    aceitas = db.todos("""select conta, tipo, categoria from descobertas where usuario_id = %s and estado in ('adicionada', 'interessante')
                          order by atualizado_em desc limit 20""", ctx.usuario())
    if not (marca.get("produto") or proprias):
        return None
    texto = "\n".join(filter(None, [
        "Brief: " + json.dumps({k: marca.get(k) for k in ("nome", "produto", "publico", "posicionamento_desejado", "objetivos") if marca.get(k)}, ensure_ascii=False),
        "Perfis dele: " + "; ".join(f"@{c['conta']} ({c['plataforma']}) — {(c['perfil'] or {}).get('bio', '')}" for c in proprias) if proprias else None,
        "Já acompanha: " + "; ".join(f"@{c['conta']} ({c['papel']}, {c['nome'] or ''}, bio: {((c['perfil'] or {}).get('bio') or '')[:80]})" for c in acompanhadas) if acompanhadas else None,
        "Descartou (não sugerir parecidos): " + ", ".join(f"@{d['conta']} ({d['tipo']}/{d['categoria']})" for d in descartadas) if descartadas else None,
        "Aceitou antes (gosta deste tipo): " + ", ".join(f"@{d['conta']} ({d['tipo']}/{d['categoria']})" for d in aceitas) if aceitas else None,
    ]))
    # semanal: luna (6× mais barato que o sol aqui; o custo é o conteúdo das páginas lidas, cobrado como entrada)
    return cliente.com_busca_na_web("criacao", INSTRUCOES_DESCOBERTA, texto, ResultadoDescoberta)


def _validar_instagram(conta):
    """Confirma que o @ existe (e pega seguidores) pela API de dados, se houver. None = não deu para checar."""
    from ..fontes import scrapecreators
    if not scrapecreators.ativo():
        return None
    try:
        p = scrapecreators.perfil_instagram(conta)
        return {"existe": True, "seguidores": p.get("seguidores"), "nome": p.get("nome")}
    except ValueError:
        return {"existe": False}
    except Exception:
        return None


def descoberta_e_auditoria(pesos):
    res = _descobrir()
    if not res:
        return 0
    ja = {(c["plataforma"], c["conta"].lower()) for c in analise.contas(("proprio", "concorrente", "referencia"))}
    novas = 0
    for s in res.sugestoes:
        conta = s.conta.strip().lstrip("@").split("/")[-1].split("?")[0].lower()
        if not conta or (s.plataforma, conta) in ja or novas >= LIMITE_DESCOBERTAS_DIA:
            continue
        if db.um("select 1 from descobertas where usuario_id = %s and plataforma = %s and conta = %s", ctx.usuario(), s.plataforma, conta):
            continue
        info = _validar_instagram(conta) if s.plataforma == "instagram" else None
        if info is not None and not info["existe"]:
            continue
        peso = pesos.get(f"descoberta:{s.categoria}", 1.0) * pesos.get(f"descoberta:{s.tipo}", 1.0)
        db.executar("""insert into descobertas (usuario_id, plataforma, conta, nome, tipo, categoria, motivo, seguidores, relevancia)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s) on conflict do nothing""",
                    ctx.usuario(), s.plataforma, conta, (info or {}).get("nome") or s.nome, s.tipo, s.categoria, s.motivo,
                    (info or {}).get("seguidores"), round(min(1.0, 0.6 * peso), 3))
        novas += 1
    if novas:
        insights.registrar("sistema", f"descoberta:lote:{datetime.now().strftime('%Y%m%d')}",
                           f"Encontramos {novas} {'nova referência' if novas == 1 else 'novas referências'} para você",
                           "Perfis do seu nicho e referências que valem a pena acompanhar.",
                           {"categoria": "descoberta", "acao": {"tipo": "rolar", "alvo": "descobertas", "rotulo": "Ver sugestões"}},
                           magnitude=novas * 10, confianca=0.7, pesos=pesos)
    fora = [f for f in res.fora_do_nicho if f.conta.strip().lstrip("@").lower() in {c["conta"].lower() for c in analise.contas(("concorrente",))}]
    if len(fora) >= 2:
        nomes = ", ".join(f"@{f.conta.strip().lstrip('@')}" for f in fora[:4]) + ("…" if len(fora) > 4 else "")
        insights.registrar("sistema", "auditoria:fora_do_nicho",
                           f"{len(fora)} perfis que você acompanha não parecem ser do seu mercado",
                           f"{nomes}. Eles podem continuar como referência, mas não como concorrentes: as comparações e tendências ficam mais precisas.",
                           {"categoria": "auditoria", "contas": [f.model_dump() for f in fora],
                            "texto_base": ",".join(sorted(f.conta for f in fora)),
                            "acao": {"tipo": "reclassificar", "rotulo": "Marcar como referências"}},
                           magnitude=len(fora) * 8, confianca=0.75, pesos=pesos)
    return novas


# ---------------------------------------------------------------- ideias do dia (IA)

class IdeiaDoDia(BaseModel):
    titulo: str
    formato: Literal["reel", "carrossel", "foto", "story"]
    pilar: str
    gancho: str
    ideia: str
    por_que: str
    base: Literal["seu_historico", "tendencia", "concorrente", "referencia", "estrategia", "publico"]
    evidencias: list[str]


class IdeiasDoDia(BaseModel):
    ideias: list[IdeiaDoDia]


INSTRUCOES_IDEIAS = """Você transforma análise em ação para este criador: proponha 3 ideias de conteúdo para HOJE.
Cada ideia precisa nascer de um DADO fornecido (seu melhor post, um sinal de mercado, um post fora da curva de um
concorrente, uma dúvida do público, a estratégia) — nada genérico que serviria para qualquer empresa.
- 'por_que': 1 ou 2 frases citando o dado que motivou a ideia (com o número quando houver).
- 'base': de onde veio. 'evidencias': ids de posts dos dados (pode ser vazio). Nunca escreva ids no texto.
- Respeite o brief (tom, recursos, restrições) e varie formatos e bases entre as 3.
- Se ele está há muito tempo sem publicar, a primeira ideia deve ser fácil de produzir hoje.
Português do Brasil."""


def _entrada_ideias(perfil, sinais_redigidos):
    est = estrategia.obter()
    destaques = analise.destaques_proprios()
    return "\n\n".join(filter(None, [
        memoria.contexto(),
        "## Seu perfil agora\n" + json.dumps({k: perfil.get(k) for k in ("leitura", "dias_sem_postar", "metricas")}, ensure_ascii=False, default=str),
        "## Seus posts\n" + json.dumps(destaques, ensure_ascii=False),
        "## Sinais do mercado\n" + json.dumps(sinais_redigidos, ensure_ascii=False) if sinais_redigidos else None,
        "## Estratégia\n" + json.dumps({k: est["estrategia"].get(k) for k in ("pilares", "mix_de_formatos", "posicionamento_recomendado")}, ensure_ascii=False) if est else None,
        conteudo._bloco_escolhas(),
        insights.resumo_feedback(),
    ]))


@lote.tipo("ideias", IdeiasDoDia)
def _aplicar_ideias(r, dados=None):
    pesos = insights.pesos_do_usuario()
    hoje = datetime.now().strftime("%Y%m%d")
    for n, i in enumerate(r.ideias[:3]):
        posts = db.todos("select plataforma, codigo, (select conta from contas where id = conta_id) as conta from posts where codigo = any(%s)",
                         db.Lista(i.evidencias[:3])) if i.evidencias else []
        insights.registrar("ideia", f"ideia:{hoje}:{n}", i.titulo, i.ideia,
                           {"categoria": f"ideia:{i.base}", "formato": i.formato, "pilar": i.pilar, "gancho": i.gancho, "por_que": i.por_que,
                            "base": i.base, "evidencias": [{"plataforma": p["plataforma"], "conta": p["conta"], "id": p["codigo"]} for p in posts]},
                           magnitude=40 - n * 5, confianca=0.7, pesos=pesos)
    return len(r.ideias)


# ---------------------------------------------------------------- orquestração

def rotina(progresso=lambda e, f, t: None, em_lote=False):
    """em_lote (cron): as chamadas de IA vão pela Batch API, pela metade do preço, e os resultados chegam
    algumas horas depois (lote.coletar). Quando o usuário está esperando (visita), roda direto."""
    em_lote = em_lote and lote.ativo()
    pesos = insights.pesos_do_usuario()
    resultado, falhas = {}, []
    _gravar_estado(rodando_desde=time.time())

    progresso("Lendo seu perfil", 0, 5)
    perfil = analise.perfil_semana()
    if perfil.get("tem_perfil"):
        acao = {"tipo": "ir", "destino": "criar", "rotulo": "Planejar conteúdo"} if perfil["tom"] == "alerta" and "parado" in perfil["chave"] \
            else {"tipo": "ir", "destino": "meuperfil", "rotulo": "Ver análise"}
        insights.registrar("perfil", perfil["chave"], perfil["leitura"], "", {"categoria": "perfil", "tom": perfil["tom"], "acao": acao},
                           magnitude=perfil["magnitude"], confianca=0.9, pesos=pesos)
        for m in perfil["metricas"]:
            if m["delta"] is not None and abs(m["delta"]) >= 15 and m["chave"] in ("alcance", "engajamento", "seguidores"):
                sinal = "subiu" if m["delta"] > 0 else "caiu"
                insights.registrar("atencao", f"perfil:{m['chave']}:{'alta' if m['delta'] > 0 else 'queda'}",
                                   f"Seu {m['rotulo'].lower()} {sinal} {abs(m['delta']):.0f}%", m.get("comparacao") or "",
                                   {"categoria": "perfil", "direcao": "alta" if m["delta"] > 0 else "queda",
                                    "acao": {"tipo": "ir", "destino": "meuperfil", "rotulo": "Ver análise"}},
                                   magnitude=m["delta"], confianca=0.85, pesos=pesos)

    # quanto a pessoa usa define quanto vale gastar com IA hoje
    visita = _ultima_visita()
    dias_sem_visita = (time.time() - visita) / 86400 if visita else 999
    estado_atual = estado()

    progresso("Observando o mercado", 1, 5)
    try:
        sinais = analise.sinais_mercado()[:8]
        # só vai para a IA o que viraria insight novo (a deduplicação roda ANTES de pagar a redação)
        novos = [x for x in sinais if not insights.repetido(x["tipo"], x["chave"], x["magnitude"])]
        resultado["sinais"], resultado["sinais_novos"] = len(sinais), len(novos)
        if novos and dias_sem_visita <= DIAS_SEM_VISITA_PARA_IA:
            with ctx.em_operacao("rotina:mercado"):
                if em_lote:
                    if not lote.pendente("redacao"):
                        lote.pedir("redacao", "criacao", INSTRUCOES_REDACAO, _entrada_redacao(novos), {"sinais": novos})
                        resultado["em_lote"] = resultado.get("em_lote", 0) + 1
                else:
                    r = cliente.estruturado("criacao", INSTRUCOES_REDACAO, _entrada_redacao(novos), Redacao, esforco="low")
                    _aplicar_redacao(r, {"sinais": novos})
    except Exception as e:
        falhas.append(f"mercado: {e}")
        traceback.print_exc()

    progresso("Procurando referências", 2, 5)
    try:
        ultima_busca = estado_atual.get("ultima_descoberta") or 0
        if dias_sem_visita <= 7 and time.time() - ultima_busca > DIAS_ENTRE_DESCOBERTAS * 86400:
            with ctx.em_operacao("rotina:descoberta"):
                resultado["descobertas"] = descoberta_e_auditoria(pesos)
            _gravar_estado(ultima_descoberta=time.time())
    except Exception as e:
        falhas.append(f"descoberta: {e}")
        traceback.print_exc()

    progresso("Pensando nas ideias de hoje", 3, 5)
    try:
        ideias_vigentes = [i for i in insights.vigentes(["ideia"], limite=3)]
        if (perfil.get("tem_perfil") or memoria.marca().get("produto")) and not ideias_vigentes \
                and dias_sem_visita <= DIAS_SEM_VISITA_PARA_IDEIAS:
            sinais_vigentes = [{"titulo": i["titulo"], "detectamos": i["texto"], "por_que_importa": i["dados"].get("por_que_importa")}
                               for i in insights.vigentes(["mercado", "conta"], limite=6)]
            with ctx.em_operacao("rotina:ideias"):
                if em_lote:
                    if not lote.pendente("ideias"):
                        lote.pedir("ideias", "criacao", INSTRUCOES_IDEIAS, _entrada_ideias(perfil, sinais_vigentes))
                        resultado["em_lote"] = resultado.get("em_lote", 0) + 1
                else:
                    r = cliente.estruturado("criacao", INSTRUCOES_IDEIAS, _entrada_ideias(perfil, sinais_vigentes), IdeiasDoDia, esforco="low")
                    resultado["ideias"] = _aplicar_ideias(r)
    except Exception as e:
        falhas.append(f"ideias: {e}")
        traceback.print_exc()

    if em_lote and resultado.get("em_lote"):
        try:
            resultado["lote"] = lote.enviar(ctx.usuario())
        except Exception as e:
            falhas.append(f"lote: {e}")
            traceback.print_exc()
    progresso("Concluído", 5, 5)
    _gravar_estado(ultima=time.time(), rodando_desde=None, resultado=resultado, falhas=falhas)
    if falhas and not resultado:
        raise RuntimeError("; ".join(falhas))
    return resultado


def usuarios_ativos(dias=14):
    """Quem visitou recentemente (ou acabou de chegar): só para esses vale gastar coleta e IA todo dia."""
    return [r["id"] for r in db.todos("""select id from usuarios where
              coalesce((config->'visita'->>'atual')::float, 0) > extract(epoch from now()) - %s * 86400
              or criado_em > now() - make_interval(days => %s)""", dias, dias)]
