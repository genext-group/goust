"""O que a IA sabe sobre você e o que aprendeu com seus feedbacks.

- marca.json: seu negócio, público e objetivos, para que os insights sejam sobre VOCÊ.
- feedback.jsonl: cada 👍/👎 (com comentário opcional) dado a um insight.
- aprendizados.json: regras destiladas dos feedbacks (e as que você escreveu à mão),
  injetadas em todos os prompts. A cada N feedbacks novos a destilação roda sozinha.
"""
import json
import threading
import time
import uuid

from pydantic import BaseModel

from . import cliente
from .cliente import PASTA_IA

ARQ_MARCA = PASTA_IA / "marca.json"
ARQ_FEEDBACK = PASTA_IA / "feedback.jsonl"
ARQ_APRENDIZADOS = PASTA_IA / "aprendizados.json"
DESTILAR_A_CADA = 5
_trava = threading.Lock()

CAMPOS_MARCA = ["nome", "produto", "publico", "objetivos", "tom", "diferenciais", "observacoes"]


# ---------------------------------------------------------------- marca

def marca():
    if ARQ_MARCA.exists():
        return json.loads(ARQ_MARCA.read_text(encoding="utf-8"))
    return {c: "" for c in CAMPOS_MARCA}


def salvar_marca(dados):
    m = {c: (dados.get(c) or "").strip() for c in CAMPOS_MARCA}
    ARQ_MARCA.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    return m


# ---------------------------------------------------------------- feedback

def feedbacks():
    if not ARQ_FEEDBACK.exists():
        return []
    return [json.loads(l) for l in ARQ_FEEDBACK.read_text(encoding="utf-8").splitlines() if l.strip()]


def registrar_feedback(fb):
    """fb: {alvo, ref, secao, item, voto (+1/-1), comentario}"""
    registro = {
        "id": uuid.uuid4().hex[:10],
        "ts": time.time(),
        "alvo": fb.get("alvo"),
        "ref": fb.get("ref"),
        "secao": fb.get("secao"),
        "item": (fb.get("item") or "")[:1500],
        "voto": 1 if fb.get("voto", 0) > 0 else -1,
        "comentario": (fb.get("comentario") or "").strip()[:1000],
    }
    with _trava:
        with open(ARQ_FEEDBACK, "a", encoding="utf-8") as f:
            f.write(json.dumps(registro, ensure_ascii=False) + "\n")
    if len(feedbacks()) - aprendizados().get("feedbacks_processados", 0) >= DESTILAR_A_CADA:
        threading.Thread(target=destilar, daemon=True).start()
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
    if ARQ_APRENDIZADOS.exists():
        return json.loads(ARQ_APRENDIZADOS.read_text(encoding="utf-8"))
    return {"versao": 0, "regras": [], "feedbacks_processados": 0, "atualizado": None}


def _salvar_aprendizados(a):
    a["atualizado"] = time.time()
    ARQ_APRENDIZADOS.write_text(json.dumps(a, ensure_ascii=False, indent=1), encoding="utf-8")


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
        partes.append("## Sobre o usuário (quem vai usar os insights)\n" + "\n".join(
            f"- {k}: {v}" for k, v in m.items() if v))
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
