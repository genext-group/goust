"""Criação: calendário editorial, roteiros e sugestão de concorrentes.

O calendário parte da estratégia (pilares, mix de formatos, frequência) e do que performa nos concorrentes.
O roteiro de cada conteúdo usa o brief, o tom e os ganchos que funcionam no mercado.
"""
import json
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel

from .. import db
from .. import contexto as ctx
from . import cliente, estrategia, memoria, perfil

STATUS = ("ideia", "roteiro", "produzindo", "pronto", "publicado")


# ---------------------------------------------------------------- leitura / edição

def _linha(l):
    return {"id": l["id"], "titulo": l["titulo"], "formato": l["formato"], "pilar": l["pilar"],
            "data": l["data"].isoformat() if l["data"] else None, "status": l["status"], "dados": l["dados"] or {},
            "roteiro": l["roteiro"], "atualizado": l["atualizado_em"].isoformat()}


def listar():
    return [_linha(l) for l in db.todos("select * from conteudos where usuario_id = %s order by data nulls last, id",
                                        ctx.usuario())]


def obter(cid):
    l = db.um("select * from conteudos where id = %s and usuario_id = %s", cid, ctx.usuario())
    if not l:
        raise ValueError("Conteúdo não encontrado.")
    return _linha(l)


def criar(dados):
    titulo = (dados.get("titulo") or "").strip()
    if not titulo:
        raise ValueError("Dê um título ao conteúdo.")
    extra = {k: dados[k] for k in ("gancho", "ideia", "objetivo", "cta", "inspirado_em", "roteiro_base") if dados.get(k)}
    r = db.um("""insert into conteudos (usuario_id, titulo, formato, pilar, data, status, dados)
                 values (%s, %s, %s, %s, %s, %s, %s) returning *""",
              ctx.usuario(), titulo[:200], dados.get("formato"), dados.get("pilar"), dados.get("data") or None,
              dados.get("status") if dados.get("status") in STATUS else "ideia", extra)
    return _linha(r)


def atualizar(cid, dados):
    atual = obter(cid)
    campos = {k: dados[k] for k in ("titulo", "formato", "pilar", "data", "status") if k in dados}
    if "status" in campos and campos["status"] not in STATUS:
        raise ValueError("Status inválido.")
    if "dados" in dados:
        campos["dados"] = {**atual["dados"], **dados["dados"]}
    if "roteiro" in dados:
        campos["roteiro"] = dados["roteiro"]
    if not campos:
        return atual
    sets = ", ".join(f"{k} = %s" for k in campos)
    db.executar(f"update conteudos set {sets}, atualizado_em = now() where id = %s and usuario_id = %s",
                *[v if v != "" else None for v in campos.values()], cid, ctx.usuario())
    return obter(cid)


def apagar(cid):
    db.executar("delete from conteudos where id = %s and usuario_id = %s", cid, ctx.usuario())


# ---------------------------------------------------------------- contexto compartilhado

def _contexto_mercado():
    """Estratégia + o que funciona nos concorrentes (compacto)."""
    partes = [memoria.contexto()]
    est = estrategia.obter()
    if est:
        e = est["estrategia"]
        partes.append("## Sua estratégia\n" + json.dumps({k: e.get(k) for k in (
            "posicionamento_recomendado", "pilares", "mix_de_formatos", "tom_de_voz", "frequencia", "metas",
            "espacos_livres", "o_que_adaptar_dos_concorrentes")}, ensure_ascii=False))
    _, concorrentes = estrategia.contas_por_papel()
    blocos = []
    for c in concorrentes:
        r = perfil.obter(c["plataforma"], c["conta"])
        if r:
            rel = r["relatorio"]
            blocos.append(json.dumps({"perfil": f"{c['plataforma']}/{c['conta']}", "ganchos": rel.get("ganchos"),
                                      "o_que_performa": rel.get("o_que_performa"),
                                      "voz_do_publico": rel.get("voz_do_publico")}, ensure_ascii=False))
    if blocos:
        partes.append("## O que funciona nos concorrentes\n" + "\n".join(blocos[:8]))
    return "\n\n".join(partes)


# ---------------------------------------------------------------- calendário

class ItemCalendario(BaseModel):
    data: str  # AAAA-MM-DD
    formato: Literal["reel", "carrossel", "foto", "story"]
    pilar: str
    titulo: str
    gancho: str
    objetivo: Literal["alcance", "engajamento", "conversao", "autoridade", "relacionamento"]
    ideia: str
    cta: str
    inspirado_em: list[str]


class Calendario(BaseModel):
    racional: str
    itens: list[ItemCalendario]


INSTRUCOES_CALENDARIO = """Você é o editor-chefe de conteúdo deste criador (Instagram/TikTok, Brasil).
Monte o calendário editorial do período pedido.
- Respeite a frequência POSSÍVEL do brief e o mix de formatos da estratégia (se não houver estratégia, use o brief).
- Distribua os pilares conforme a participação da estratégia; varie objetivo (alcance, engajamento, conversão...).
- Use os melhores dias da semana quando houver dado; não repita temas já planejados.
- 'titulo' curto (como o criador anotaria); 'gancho' = a primeira frase/tela, forte e específica.
- 'ideia' em 2 ou 3 frases: o que mostrar e por que vai funcionar para o público.
- 'inspirado_em': ids de posts de concorrentes que aparecem nos dados (pode ser vazio). Nunca escreva ids no texto.
- Datas no formato AAAA-MM-DD, dentro do período.
Português do Brasil."""


def gerar_calendario(semanas=2, inicio=None, progresso=lambda e, f, t: None):
    semanas = max(1, min(int(semanas or 2), 6))
    inicio = date.fromisoformat(inicio) if inicio else date.today() + timedelta(days=1)
    fim = inicio + timedelta(days=7 * semanas - 1)
    progresso("Lendo sua estratégia e o mercado", 0, 2)
    ja = db.todos("select titulo, data from conteudos where usuario_id = %s and (data is null or data >= %s)",
                  ctx.usuario(), date.today())
    entrada = "\n\n".join([
        f"## Período\nDe {inicio.isoformat()} ({inicio.strftime('%A')}) até {fim.isoformat()} — {semanas} semana(s).",
        _contexto_mercado(),
        _bloco_escolhas() or "",
        "## Já planejado (não repita)\n" + "\n".join(f"- {j['titulo']}" for j in ja) if ja else "",
    ])
    progresso("Montando o calendário", 1, 2)
    cal = cliente.estruturado("relatorio", INSTRUCOES_CALENDARIO, entrada, Calendario, esforco="low")
    novos = 0
    for it in cal.itens:
        try:
            d = date.fromisoformat(it.data)
        except ValueError:
            continue
        if not inicio <= d <= fim:
            continue
        criar({"titulo": it.titulo, "formato": it.formato, "pilar": it.pilar, "data": d.isoformat(),
               "gancho": it.gancho, "ideia": it.ideia, "objetivo": it.objetivo, "cta": it.cta,
               "inspirado_em": it.inspirado_em})
        novos += 1
    progresso("Concluído", 2, 2)
    return {"racional": cal.racional, "novos": novos}


# ---------------------------------------------------------------- roteiro

class Gancho(BaseModel):
    texto: str
    estilo: str


class Cena(BaseModel):
    tempo: str
    fala: str
    visual: str
    texto_na_tela: str


class Slide(BaseModel):
    titulo: str
    texto: str
    visual: str


class Roteiro(BaseModel):
    ganchos: list[Gancho]
    duracao_segundos: int
    cenas: list[Cena]
    slides: list[Slide]
    legenda: str
    hashtags: list[str]
    cta: str
    dicas_de_gravacao: list[str]
    por_que_vai_funcionar: str
    prompt_da_capa: str
    referencias: list[str]


INSTRUCOES_ROTEIRO = """Você é roteirista de conteúdo curto (Reels/TikTok/carrossel) deste criador.
Escreva um roteiro pronto para gravar/produzir, no tom de voz do brief.
- 'ganchos': 3 opções diferentes (pergunta, número, quebra de crença, cena...) com o estilo de cada.
- Reel/vídeo: 'cenas' com tempo (ex.: 0–3s), fala exata, o que aparece e o texto na tela; 'slides' vazio.
  Duração entre 20 e 60s, a não ser que o formato peça outra coisa.
- Carrossel: 'slides' (6 a 10) com título, texto e visual; 'cenas' vazio; duracao_segundos = 0.
- Foto: 1 slide descrevendo a peça.
- Respeite recursos de produção e restrições do brief. CTA coerente com o objetivo.
- 'prompt_da_capa': descrição da capa/primeira tela para um gerador de imagens (o que mostrar e o texto).
- 'referencias': ids de posts dos dados que inspiraram (pode ser vazio). Nunca escreva ids no texto.
Português do Brasil, falado, natural."""


def gerar_roteiro(cid, pedido_extra="", progresso=lambda e, f, t: None):
    c = obter(cid)
    progresso("Escrevendo o roteiro", 0, 1)
    entrada = "\n\n".join(filter(None, [
        "## Conteúdo\n" + json.dumps({"titulo": c["titulo"], "formato": c["formato"], "pilar": c["pilar"],
                                      **c["dados"]}, ensure_ascii=False),
        f"## Pedido do criador\n{pedido_extra}" if pedido_extra else None,
        _contexto_mercado(),
    ]))
    r = cliente.estruturado("relatorio", INSTRUCOES_ROTEIRO, entrada, Roteiro, esforco="low")
    roteiro = {**r.model_dump(), "gerado": datetime.now().isoformat(timespec="seconds")}
    atualizar(cid, {"roteiro": roteiro, **({"status": "roteiro"} if c["status"] == "ideia" else {})})
    progresso("Concluído", 1, 1)
    return roteiro


# ---------------------------------------------------------------- ideias sob demanda (criador guiado e sessão de escolha)

class IdeiaConteudo(BaseModel):
    titulo: str
    formato: Literal["reel", "carrossel", "foto", "story"]
    pilar: str
    objetivo: Literal["alcance", "engajamento", "conversao", "autoridade", "relacionamento"]
    gancho: str
    ideia: str
    cta: str
    por_que: str
    inspirado_em: list[str]


class Ideias(BaseModel):
    ideias: list[IdeiaConteudo]


INSTRUCOES_IDEIAS = """Você é o editor de conteúdo deste criador (Instagram/TikTok, Brasil).
Proponha ideias de conteúdo DIFERENTES entre si (ângulo, formato de gancho, emoção), prontas para virar post.
- Respeite as restrições pedidas (pilar, formato, objetivo, tema) quando houver.
- Use o que funciona nos concorrentes e o que o público pede, adaptado ao tom e ao brief do criador.
- Aprenda com as escolhas anteriores: repita o que ele aceitou, evite o padrão do que ele recusou.
- Não repita títulos já planejados.
- 'gancho' = a primeira frase/tela, específica e forte. 'ideia' em 2 frases. 'por_que' em 1 frase (por que vai funcionar).
- 'inspirado_em': ids de posts dos dados (pode ser vazio). Nunca escreva ids no texto.
Português do Brasil."""


def _escolhas():
    return memoria.ler_documento("ideias_escolhas", {"itens": []})["itens"]


def registrar_escolha(ideia, aceita):
    """Guarda as últimas decisões (aceitou/recusou) para as próximas ideias acertarem mais."""
    itens = _escolhas()
    itens.append({"titulo": ideia.get("titulo", "")[:160], "gancho": ideia.get("gancho", "")[:200],
                  "formato": ideia.get("formato"), "pilar": ideia.get("pilar"), "aceita": bool(aceita)})
    memoria.gravar_documento("ideias_escolhas", {"itens": itens[-60:]})


def _bloco_escolhas():
    itens = _escolhas()[-30:]
    if not itens:
        return None
    aceitas = [f"- {i['titulo']} ({i.get('formato')}, {i.get('pilar')})" for i in itens if i["aceita"]]
    recusadas = [f"- {i['titulo']} ({i.get('formato')}, {i.get('pilar')})" for i in itens if not i["aceita"]]
    return ("## Escolhas anteriores do criador\nAceitou:\n" + ("\n".join(aceitas) or "(nenhuma)")
            + "\nRecusou:\n" + ("\n".join(recusadas) or "(nenhuma)"))


def gerar_ideias(qtd=4, pilar=None, formato=None, objetivo=None, tema=None):
    qtd = max(1, min(int(qtd or 4), 12))
    pedido = [f"Quantidade: {qtd} ideias."]
    if pilar:
        pedido.append(f"Pilar: {pilar}")
    if formato:
        pedido.append(f"Formato: {formato}")
    if objetivo:
        pedido.append(f"Objetivo: {objetivo}")
    if tema:
        pedido.append(f"Tema ou pedido do criador: {tema}")
    ja = db.todos("select titulo from conteudos where usuario_id = %s order by id desc limit 60", ctx.usuario())
    entrada = "\n\n".join(filter(None, [
        "## Pedido\n" + "\n".join(pedido),
        _contexto_mercado(),
        _bloco_escolhas(),
        "## Já planejado (não repita)\n" + "\n".join(f"- {j['titulo']}" for j in ja) if ja else None,
    ]))
    r = cliente.estruturado("relatorio", INSTRUCOES_IDEIAS, entrada, Ideias, esforco="low")
    return [i.model_dump() for i in r.ideias[:qtd]]


# ---------------------------------------------------------------- concorrentes sugeridos

class Sugestao(BaseModel):
    plataforma: Literal["instagram", "tiktok"]
    conta: str
    nome: str
    por_que: str


class Sugestoes(BaseModel):
    sugestoes: list[Sugestao]


def sugerir_concorrentes(descricao=""):
    """Pesquisa na web perfis do mesmo nicho (concorrentes diretos e referências de conteúdo)."""
    marca = memoria.marca()
    proprias, concorrentes = estrategia.contas_por_papel()
    base = descricao.strip() or " · ".join(filter(None, [marca.get("produto"), marca.get("publico"), marca.get("nome")]))
    if not base and not proprias:
        raise ValueError("Conte em uma frase o que você faz para a IA procurar concorrentes.")
    texto = "\n".join(filter(None, [
        f"O que o criador faz: {base}" if base else None,
        "Perfis dele: " + ", ".join(f"@{c['conta']} ({c['plataforma']}) — {(c['perfil'] or {}).get('bio', '')}" for c in proprias) if proprias else None,
        "Já acompanha (não repita): " + ", ".join(f"@{c['conta']}" for c in concorrentes) if concorrentes else None,
    ]))
    r = cliente.cliente().responses.parse(
        model=cliente.MODELOS["relatorio"], reasoning={"effort": "low"}, tools=[{"type": "web_search"}],
        instructions="Pesquise na web e indique de 6 a 8 perfis de Instagram ou TikTok, ATIVOS, do mesmo nicho no "
                     "Brasil: concorrentes diretos e criadores que são referência de conteúdo para esse público. "
                     "Só @ que você confirmou na pesquisa (sem inventar). 'conta' sem @. 'por_que' em uma frase.",
        input=texto, text_format=Sugestoes)
    cliente.registrar_uso(cliente.MODELOS["relatorio"], r.usage.input_tokens, r.usage.output_tokens)
    if not r.output_parsed:
        return []
    ja = {c["conta"].lower() for c in proprias + concorrentes}
    vistos, saida = set(), []
    for s in r.output_parsed.sugestoes:
        conta = s.conta.strip().lstrip("@").split("/")[-1].lower()
        if conta and conta not in ja and conta not in vistos:
            vistos.add(conta)
            saida.append({**s.model_dump(), "conta": conta})
    return saida
