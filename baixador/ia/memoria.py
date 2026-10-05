"""O que a IA sabe sobre você e o que aprendeu com seus feedbacks.

Tudo por usuário, no banco:
- documento "marca": seu negócio, público e objetivos, para que os insights sejam sobre VOCÊ.
- tabela feedbacks: cada 👍/👎 (com comentário opcional) dado a um insight.
- documento "aprendizados": regras destiladas dos feedbacks (e as que você escreveu à mão),
  injetadas em todos os prompts. A cada N feedbacks novos a destilação roda sozinha.
"""
import threading
import time
import uuid

from pydantic import BaseModel

from .. import contexto as ctx
from .. import db, execucao
from . import cliente

DESTILAR_A_CADA = 5
_trava = threading.Lock()

CAMPOS_MARCA = ["nome", "produto", "publico", "dores_do_publico", "objetivos", "metas", "onde_quer_chegar",
                "posicionamento_desejado", "tom", "diferenciais", "frequencia_possivel", "recursos_producao",
                "restricoes", "site", "observacoes"]
NOMES_CAMPOS = {
    "nome": "marca", "produto": "o que vende (oferta, preço, como funciona)", "publico": "público-alvo",
    "dores_do_publico": "dores e desejos do público", "objetivos": "objetivo principal com conteúdo",
    "metas": "metas em números e prazo", "onde_quer_chegar": "onde quer chegar (visão de 6 a 12 meses)",
    "posicionamento_desejado": "como quer ser percebido", "tom": "tom de voz", "diferenciais": "diferenciais",
    "frequencia_possivel": "frequência de postagem possível", "recursos_producao": "recursos de produção",
    "restricoes": "o que não faz / limites", "site": "site", "observacoes": "observações",
}


# ---------------------------------------------------------------- marca

def ler_documento(tipo, padrao=None):
    r = db.um("select dados from documentos where usuario_id = %s and tipo = %s", ctx.usuario(), tipo)
    return r["dados"] if r else padrao


def gravar_documento(tipo, dados):
    db.executar("""insert into documentos (usuario_id, tipo, dados) values (%s, %s, %s)
                   on conflict (usuario_id, tipo) do update set dados = excluded.dados, atualizado_em = now()""",
                ctx.usuario(), tipo, dados)


def marca():
    return {c: "" for c in CAMPOS_MARCA} | (ler_documento("marca") or {})


def salvar_marca(dados):
    m = {c: (dados.get(c) or "").strip() for c in CAMPOS_MARCA}
    gravar_documento("marca", m)
    return m


# ---------------------------------------------------------------- feedback

def feedbacks():
    linhas = db.todos("""select id, extract(epoch from ts) as ts, alvo, ref, secao, item, voto, comentario
                         from feedbacks where usuario_id = %s order by ts""", ctx.usuario())
    return [{**r, "ts": float(r["ts"]), "comentario": r["comentario"] or ""} for r in linhas]


def registrar_feedback(fb):
    """fb: {alvo, ref, secao, item, voto (+1/-1), comentario}"""
    registro = {
        "alvo": fb.get("alvo"),
        "ref": fb.get("ref"),
        "secao": fb.get("secao"),
        "item": (fb.get("item") or "")[:1500],
        "voto": 1 if fb.get("voto", 0) > 0 else -1,
        "comentario": (fb.get("comentario") or "").strip()[:1000],
    }
    db.executar("""insert into feedbacks (usuario_id, alvo, ref, secao, item, voto, comentario)
                   values (%s, %s, %s, %s, %s, %s, %s)""", ctx.usuario(), registro["alvo"], registro["ref"],
                registro["secao"], registro["item"], registro["voto"], registro["comentario"])
    if len(feedbacks()) - aprendizados().get("feedbacks_processados", 0) >= DESTILAR_A_CADA:
        execucao.despachar("destilar", ctx.usuario())
    return registro


def votos_por_ref(ref):
    """Último voto de cada item de um relatório, para o painel mostrar o estado dos botões."""
    estado = {}
    for f in feedbacks():
        if f.get("ref") == ref:
            estado[f"{f['secao']}::{f['item']}"] = f["voto"]
    return estado


# ---------------------------------------------------------------- aprendizados

def aprendizados():
    return ler_documento("aprendizados") or {"versao": 0, "regras": [], "feedbacks_processados": 0, "atualizado": None}


def _salvar_aprendizados(a):
    a["atualizado"] = time.time()
    gravar_documento("aprendizados", a)


def salvar_regras(regras):
    """Edição manual pelo painel: o usuário manda a lista inteira."""
    with _trava:
        a = aprendizados()
        a["regras"] = [
            {"id": r.get("id") or uuid.uuid4().hex[:8], "texto": r["texto"].strip(), "origem": r.get("origem", "manual")}
            for r in regras if r.get("texto", "").strip()
        ]
        a["versao"] += 1
        _salvar_aprendizados(a)
        return a


class _Regras(BaseModel):
    regras: list[str]
    resumo_da_mudanca: str


def destilar():
    """Transforma os feedbacks em regras curtas e gerais (mantém as regras manuais)."""
    with _trava:
        a = aprendizados()
        fbs = feedbacks()
        if not fbs or not cliente.configurada():
            return a
        manuais = [r for r in a["regras"] if r.get("origem") == "manual"]
        automaticas = [r["texto"] for r in a["regras"] if r.get("origem") != "manual"]
        linhas = [
            f"[{'👍' if f['voto'] > 0 else '👎'}] seção={f['secao']} | insight: {f['item'][:400]}"
            + (f" | comentário: {f['comentario']}" if f["comentario"] else "")
            for f in fbs[-120:]
        ]
        conteudo = (
            "Regras atuais aprendidas:\n" + ("\n".join(f"- {r}" for r in automaticas) or "(nenhuma)")
            + "\n\nRegras escritas pelo usuário (não mexa, só evite contradizê-las):\n"
            + ("\n".join(f"- {r['texto']}" for r in manuais) or "(nenhuma)")
            + "\n\nFeedbacks (mais recentes por último):\n" + "\n".join(linhas)
        )
        try:
            r = cliente.estruturado(
                "relatorio",
                "Você mantém a memória de preferências de um analista de conteúdo de concorrentes. "
                "A partir dos feedbacks do usuário sobre insights gerados por IA, escreva no máximo 12 regras "
                "curtas, gerais e acionáveis (em português) sobre COMO gerar insights que ele valoriza: nível de "
                "detalhe, tipo de recomendação, o que evitar, o que priorizar. Generalize padrões; não copie "
                "insights específicos. Mantenha regras atuais que continuam válidas, reescreva as que os novos "
                "feedbacks contradizem e descarte as fracas.",
                conteudo, _Regras, esforco="medium",
            )
        except Exception:
            return a
        a["regras"] = manuais + [{"id": uuid.uuid4().hex[:8], "texto": t, "origem": "feedback"} for t in r.regras]
        a["versao"] += 1
        a["feedbacks_processados"] = len(fbs)
        a["ultima_mudanca"] = r.resumo_da_mudanca
        _salvar_aprendizados(a)
        return a


# ---------------------------------------------------------------- contexto para os prompts

def contexto():
    """Bloco de texto com marca + aprendizados + exemplos, colado nos prompts."""
    m = marca()
    partes = []
    if any(m.values()):
        partes.append("## Brief do usuário (quem vai usar os insights)\n" + "\n".join(
            f"- {NOMES_CAMPOS.get(k, k)}: {v}" for k, v in m.items() if v))
    else:
        partes.append("## Sobre o usuário\nCriador/empresa que monitora concorrentes. Ainda não descreveu a própria marca; "
                      "faça recomendações úteis para quem compete nesse mesmo mercado.")
    regras = aprendizados()["regras"]
    if regras:
        partes.append("## Preferências aprendidas com o feedback do usuário (siga à risca)\n"
                      + "\n".join(f"- {r['texto']}" for r in regras))
    fbs = feedbacks()
    bons = [f for f in fbs if f["voto"] > 0][-5:]
    ruins = [f for f in fbs if f["voto"] < 0][-5:]
    if bons:
        partes.append("## Exemplos de insights que o usuário aprovou\n" + "\n".join(
            f"- ({f['secao']}) {f['item'][:300]}" + (f" — motivo: {f['comentario']}" if f["comentario"] else "") for f in bons))
    if ruins:
        partes.append("## Exemplos que o usuário reprovou (não repita esse estilo)\n" + "\n".join(
            f"- ({f['secao']}) {f['item'][:300]}" + (f" — motivo: {f['comentario']}" if f["comentario"] else "") for f in ruins))
    return "\n\n".join(partes)


def _destilar_tarefa(usuario_id, _prazo):
    ctx.definir(usuario_id)
    destilar()
    return False


execucao.registrar("destilar", _destilar_tarefa)
