"""Caderno de ideias: anotações soltas do dia a dia que a IA ajuda a transformar em conteúdo.

Fluxo: anotar rápido (texto, tipo, #tags, post de referência) → a IA "destrincha" uma nota com perguntas e
ângulos, organiza o caderno em temas e desenvolve notas em ideias prontas → a ideia vira conteúdo no
calendário (com roteiro, se quiser), sempre ligada às notas de origem, que ficam marcadas como usadas.

A IA trabalha SEMPRE a partir do que a pessoa escreveu: preserva o insight e a voz dela, não troca por ideia genérica.
Modelo "criacao" (barato); contexto enxuto (brief + estratégia), sem os relatórios inteiros.
"""
import hashlib
import json
import re
from typing import Literal

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db
from . import cliente, conteudo, estrategia, memoria

TIPOS = ("ideia", "observacao", "frase", "bastidor", "pergunta", "referencia")
ESTADOS = ("solta", "usada", "arquivada")
LIMITE_TEXTO = 4000


# ---------------------------------------------------------------- CRUD

def _linha(l):
    return {"id": l["id"], "texto": l["texto"], "tipo": l["tipo"], "tags": l["tags"] or [], "ref": l["ref"],
            "fixada": l["fixada"], "estado": l["estado"], "conteudo_id": l["conteudo_id"],
            "criado": l["criado_em"].isoformat(), "atualizado": l["atualizado_em"].isoformat()}


def _tags_do_texto(texto):
    return sorted({t.lower() for t in re.findall(r"#([\wÀ-ÿ-]{2,30})", texto or "")})


def listar():
    return [_linha(l) for l in db.todos("""select * from notas where usuario_id = %s and estado <> 'arquivada'
                                           order by fixada desc, criado_em desc limit 500""", ctx.usuario())]


def _obter(nid):
    l = db.um("select * from notas where id = %s and usuario_id = %s", nid, ctx.usuario())
    if not l:
        raise ValueError("Nota não encontrada.")
    return l


def criar(d):
    texto = (d.get("texto") or "").strip()[:LIMITE_TEXTO]
    if not texto and not d.get("ref"):
        raise ValueError("Escreva alguma coisa na nota.")
    tipo = d.get("tipo") if d.get("tipo") in TIPOS else "ideia"
    tags = sorted(set(_tags_do_texto(texto)) | {t.lower().lstrip("#") for t in (d.get("tags") or []) if t})[:12]
    r = db.um("""insert into notas (usuario_id, texto, tipo, tags, ref) values (%s, %s, %s, %s, %s) returning *""",
              ctx.usuario(), texto, tipo, tags, d.get("ref"))
    return _linha(r)


def atualizar(nid, d):
    atual = _obter(nid)
    texto = (d["texto"].strip()[:LIMITE_TEXTO] if "texto" in d else atual["texto"])
    tipo = d["tipo"] if d.get("tipo") in TIPOS else atual["tipo"]
    estado = d["estado"] if d.get("estado") in ESTADOS else atual["estado"]
    tags = sorted(set(_tags_do_texto(texto)) | set(d.get("tags", atual["tags"] or [])))[:12]
    r = db.um("""update notas set texto = %s, tipo = %s, tags = %s, fixada = %s, estado = %s, atualizado_em = now()
                 where id = %s and usuario_id = %s returning *""",
              texto, tipo, tags, bool(d.get("fixada", atual["fixada"])), estado, nid, ctx.usuario())
    return _linha(r)


def apagar(nid):
    db.executar("delete from notas where id = %s and usuario_id = %s", nid, ctx.usuario())


def _notas(ids):
    ids = [int(i) for i in ids or []][:30]
    if not ids:
        return []
    return db.todos("select * from notas where usuario_id = %s and id = any(%s) order by criado_em", ctx.usuario(), db.Lista(ids))


def _bloco_notas(linhas):
    return "\n".join(f"[nota {l['id']} · {l['tipo']}{' · ' + ' '.join('#' + t for t in l['tags']) if l['tags'] else ''}] "
                     f"{l['texto']}" + (f" (referência: @{l['ref'].get('conta')} — {l['ref'].get('legenda', '')[:160]})"
                                        if l.get("ref") else "") for l in linhas)


def _contexto():
    """Brief + o essencial da estratégia (enxuto: o caderno é sobre as ideias da pessoa, não sobre o mercado)."""
    partes = [memoria.contexto()]
    est = estrategia.obter()
    if est:
        e = est["estrategia"]
        partes.append("## Estratégia (resumo)\n" + json.dumps({
            "posicionamento": e.get("posicionamento_recomendado"), "pilares": [p.get("nome") for p in e.get("pilares", [])],
            "tom_de_voz": e.get("tom_de_voz"), "mix_de_formatos": e.get("mix_de_formatos")}, ensure_ascii=False))
    return "\n\n".join(partes)


# ---------------------------------------------------------------- IA: destrinchar uma nota

class Provocacao(BaseModel):
    leitura: str                 # o que há de forte na nota, em 1 frase
    perguntas: list[str]         # 3 perguntas para a pessoa aprofundar (respostas viram novas notas)
    angulos: list[str]           # 3 ângulos de conteúdo possíveis, cada um em 1 frase


INSTRUCOES_PROVOCAR = """Você é um parceiro de brainstorm deste criador. Recebe UMA anotação crua dele.
- 'leitura': em 1 frase, o que há de mais forte ou original ali (o insight, não um resumo).
- 'perguntas': 3 perguntas curtas e específicas que façam ele lembrar de detalhes, histórias, números ou opiniões
  que deixariam o conteúdo melhor (nada genérico como "qual seu objetivo?").
- 'angulos': 3 formas diferentes de transformar isso em conteúdo (ex.: história pessoal, erro comum, antes e depois,
  opinião polêmica, tutorial), cada uma em 1 frase concreta e ligada ao negócio dele.
Preserve a voz e a ideia dele. Português do Brasil, frases curtas."""


def provocar(nid):
    l = _obter(nid)
    entrada = _contexto() + "\n\n## A anotação\n" + _bloco_notas([l])
    r = cliente.estruturado("criacao", INSTRUCOES_PROVOCAR, entrada, Provocacao, esforco="low")
    return r.model_dump()


# ---------------------------------------------------------------- IA: desenvolver notas em ideias

class IdeiaDasNotas(conteudo.IdeiaConteudo):
    origem: list[int]            # ids das notas que sustentam a ideia


class IdeiasDasNotas(BaseModel):
    ideias: list[IdeiaDasNotas]


INSTRUCOES_DESENVOLVER = """Você é o editor de conteúdo deste criador (Instagram/TikTok, Brasil). Ele juntou anotações
do dia a dia e quer transformar em conteúdo. Proponha ideias prontas para virar post:
- PARTA DAS ANOTAÇÕES: cada ideia precisa usar o insight, a história, a frase ou a observação dele (cite os ids em
  'origem'). Não substitua por uma ideia genérica do nicho. Pode combinar notas que conversam entre si.
- Encaixe nos pilares e no tom da estratégia quando fizer sentido; respeite restrições e recursos do brief.
- Ideias DIFERENTES entre si (formato, ângulo, emoção). 'gancho' = primeira frase/tela, específica.
  'ideia' em 2 frases. 'por_que' em 1 frase. 'inspirado_em' pode ficar vazio.
- Siga o pedido extra do criador, se houver. Português do Brasil."""


def desenvolver(ids, pedido="", qtd=3):
    linhas = _notas(ids)
    if not linhas:
        linhas = db.todos("""select * from notas where usuario_id = %s and estado = 'solta'
                             order by fixada desc, criado_em desc limit 12""", ctx.usuario())
    if not linhas:
        raise ValueError("Anote alguma coisa primeiro: a IA desenvolve a partir das suas notas.")
    ja = db.todos("select titulo from conteudos where usuario_id = %s order by id desc limit 40", ctx.usuario())
    entrada = "\n\n".join(filter(None, [
        _contexto(),
        "## Anotações\n" + _bloco_notas(linhas),
        conteudo._bloco_escolhas(),
        "## Já planejado (não repita)\n" + "\n".join(f"- {j['titulo']}" for j in ja) if ja else None,
        f"## Pedido\nQuantidade: {max(1, min(int(qtd), 5))} ideias." + (f"\nDireção do criador: {pedido.strip()[:500]}" if pedido.strip() else ""),
    ]))
    r = cliente.estruturado("criacao", INSTRUCOES_DESENVOLVER, entrada, IdeiasDasNotas, esforco="low")
    validos = {l["id"] for l in linhas}
    saida = []
    for i in r.ideias[:qtd]:
        d = i.model_dump()
        d["origem"] = [n for n in d["origem"] if n in validos] or [linhas[0]["id"]]
        saida.append(d)
    return saida


def virar_conteudo(ideia, data=None):
    """Ideia aceita → conteúdo no calendário, ligado às notas de origem (que passam a 'usada')."""
    origem = [int(n) for n in ideia.get("origem") or []]
    c = conteudo.criar({**ideia, "data": data, "status": "ideia"})
    conteudo.atualizar(c["id"], {"dados": {"notas": origem, "por_que": ideia.get("por_que")}})
    if origem:
        db.executar("""update notas set estado = 'usada', conteudo_id = %s, atualizado_em = now()
                       where usuario_id = %s and id = any(%s)""", c["id"], ctx.usuario(), db.Lista(origem))
    conteudo.registrar_escolha(ideia, True)
    return conteudo.obter(c["id"])


# ---------------------------------------------------------------- IA: organizar o caderno em temas

class Tema(BaseModel):
    nome: str
    resumo: str
    notas: list[int]
    potencial: Literal["alto", "medio", "baixo"]
    proximo_passo: str


class Organizacao(BaseModel):
    temas: list[Tema]
    observacao: str              # 1 frase sobre o caderno como um todo (padrão, lacuna, oportunidade)


INSTRUCOES_ORGANIZAR = """Você organiza o caderno de ideias deste criador. Agrupe as anotações em 2 a 6 TEMAS que
conversam entre si (cada nota em no máximo 1 tema; notas sem par podem ficar de fora).
- 'nome' curto (até 4 palavras); 'resumo' em 1 frase; 'notas' = ids.
- 'potencial' para virar conteúdo que ajude o negócio dele (alto/medio/baixo), pensando nos pilares da estratégia.
- 'proximo_passo': 1 ação concreta (ex.: "juntar as 3 histórias num carrossel de erros comuns").
- 'observacao': 1 frase sobre o caderno (um padrão que se repete, um pilar esquecido, uma mina de ouro).
Português do Brasil."""


def organizar(forcar=False):
    linhas = db.todos("""select * from notas where usuario_id = %s and estado = 'solta'
                         order by criado_em desc limit 80""", ctx.usuario())
    if len(linhas) < 3:
        raise ValueError("Com pelo menos 3 notas soltas a IA consegue achar temas.")
    assinatura = hashlib.sha1(json.dumps([[l["id"], l["atualizado_em"].isoformat()] for l in linhas]).encode()).hexdigest()
    guardado = memoria.ler_documento("notas_temas", {})
    if not forcar and guardado.get("assinatura") == assinatura:
        return guardado["resultado"]   # nada mudou: não gasta outra chamada
    entrada = _contexto() + "\n\n## Anotações soltas\n" + _bloco_notas(linhas)
    r = cliente.estruturado("criacao", INSTRUCOES_ORGANIZAR, entrada, Organizacao, esforco="low")
    validos = {l["id"] for l in linhas}
    resultado = r.model_dump()
    for t in resultado["temas"]:
        t["notas"] = [n for n in t["notas"] if n in validos]
    resultado["temas"] = [t for t in resultado["temas"] if t["notas"]]
    memoria.gravar_documento("notas_temas", {"assinatura": assinatura, "resultado": resultado})
    return resultado


def temas_guardados():
    return (memoria.ler_documento("notas_temas", {}) or {}).get("resultado")
