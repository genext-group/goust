"""Tarefas de download: listar a conta, filtrar e baixar/catalogar cada vídeo.

O estado fica no armazenamento (arquivo local ou Redis), então a tarefa pode ser retomada por
outra execução: na nuvem cada mensagem da fila trabalha por alguns minutos e passa o bastão.
"""
import re
import time
from concurrent.futures import ThreadPoolExecutor

from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget

from . import armazenamento, biblioteca, execucao, instagram, tiktok
from .armazenamento import NUVEM
from .filtros import Cancelado, aplicar_filtro, ler_metadados, pasta_conta, salvar_metadados

PLATAFORMAS = {"tiktok": tiktok, "instagram": instagram}
PARALELO = {"tiktok": 3, "instagram": 2}  # o Instagram é mais sensível a rajadas
FINAIS = ("concluído", "erro", "cancelado")
CHAVE = "dados/tarefas"            # dicionário id -> estado
CHAVE_ITENS = "dados/tarefas_itens/"  # itens que ainda faltam baixar, por tarefa
MAX_HISTORICO = 100


# ---------------------------------------------------------------- estado

def _ler(tid):
    return armazenamento.dic_ler_campo(CHAVE, str(tid))


def _gravar(t):
    armazenamento.dic_gravar(CHAVE, str(t["id"]), t)


def _log(t, msg):
    t["logs"] = (t.get("logs") or [])[-79:] + [f"{time.strftime('%H:%M:%S')} {msg}"]


def listar():
    return sorted(armazenamento.dic_ler(CHAVE).values(), key=lambda t: t["id"], reverse=True)


def cancelar(tid):
    t = _ler(tid)
    if t and t["status"] not in FINAIS:
        t["cancelar"] = True
        if t["status"] == "na fila" and not NUVEM:
            pass  # o trabalhador local vê a flag quando pegar a tarefa
        _gravar(t)


def limpar():
    for t in listar():
        if t["status"] in FINAIS:
            armazenamento.dic_apagar(CHAVE, str(t["id"]))
            armazenamento.apagar(f"{CHAVE_ITENS}{t['id']}.json")


def _podar_historico():
    finais = [t for t in listar() if t["status"] in FINAIS]
    for t in finais[MAX_HISTORICO:]:
        armazenamento.dic_apagar(CHAVE, str(t["id"]))


def enfileirar(plataforma, conta, opcoes):
    t = {
        "id": armazenamento.contador("dados/tarefas_contador"),
        "plataforma": plataforma, "conta": conta, "opcoes": opcoes,
        "status": "na fila", "total": 0, "baixados": 0, "pulados": 0, "erros": 0,
        "logs": [], "cancelar": False, "criada": time.time(), "fim": None,
    }
    _gravar(t)
    execucao.despachar("download", t["id"], faixa=f"download:{plataforma}")
    return t


def enfileirar_link(url):
    plataforma = "instagram" if "instagram.com" in url else "tiktok" if "tiktok.com" in url else None
    if not plataforma:
        raise ValueError("Cole um link do TikTok ou do Instagram.")
    m = re.search(r"tiktok\.com/@([\w.\-]+)", url)
    return enfileirar(plataforma, m.group(1) if m else "…", {"modo": "link", "link": url})


# ---------------------------------------------------------------- execução

def executar(tid, prazo=None):
    """Roda (ou continua) a tarefa. Com prazo, devolve True se ainda faltar trabalho."""
    t = _ler(tid)
    if not t or t["status"] in FINAIS:
        return False
    try:
        if t.get("cancelar"):
            raise Cancelado()
        if t["status"] == "na fila":
            _listar(t)
        falta = _baixar_pendentes(t, prazo)
        if falta:
            return True
        t["status"] = "concluído"
        if t["opcoes"].get("modo") != "link":
            _log(t, f"Fim: {t['baixados']} novos, {t['pulados']} já existiam, {t['erros']} erros.")
        _depois(t)
    except Cancelado:
        t["status"] = "cancelado"
        _log(t, "Cancelado.")
    except (instagram.SessaoInvalida, ValueError, RuntimeError) as e:
        t["status"] = "erro"
        _log(t, f"Erro: {e}")
    except Exception as e:
        t["status"] = "erro"
        _log(t, f"Erro inesperado: {e}")
    t["fim"] = time.time()
    _gravar(t)
    armazenamento.apagar(f"{CHAVE_ITENS}{t['id']}.json")
    _podar_historico()
    return False


def _listar(t):
    mod = PLATAFORMAS[t["plataforma"]]
    t["status"] = "listando"
    _gravar(t)
    if t["opcoes"].get("modo") == "link":
        itens = [_item_do_link(t)]
    else:
        biblioteca.atualizar_perfil(t["plataforma"], t["conta"])
        _log(t, f"Listando vídeos de @{t['conta']}...")
        conhecidos = set(ler_metadados(t["plataforma"], t["conta"]))
        if not NUVEM:
            conhecidos |= {p.stem.split("_", 1)[-1] for p in pasta_conta(t["plataforma"], t["conta"]).glob("*.mp4")}
        novos = t["opcoes"].get("modo") == "novos"
        conhecido = (lambda i: str(i) in conhecidos) if novos else (lambda i: False)

        def log(msg):
            _log(t, msg)
            _gravar(t)

        listados = mod.listar(t["conta"], t["opcoes"], log, lambda: _cancelado(t), conhecido)
        itens = aplicar_filtro(listados, t["opcoes"])
        if novos:
            itens = [i for i in itens if str(i["id"]) not in conhecidos]
        _log(t, f"{len(listados)} vídeos listados, {len(itens)} selecionados.")
    t["total"] = len(itens)
    t["status"] = "baixando"
    armazenamento.gravar_json(f"{CHAVE_ITENS}{t['id']}.json", itens)
    _gravar(t)


def _item_do_link(t):
    _log(t, "Lendo o link...")
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    if t["plataforma"] == "tiktok":
        opts["impersonate"] = ImpersonateTarget.from_str("chrome")
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(t["opcoes"]["link"], download=False)
    t["conta"] = info.get("uploader") or info.get("channel") or t["conta"]
    return {
        "id": info.get("display_id") if t["plataforma"] == "instagram" else info["id"],
        "url": info.get("webpage_url") or t["opcoes"]["link"],
        "timestamp": info.get("timestamp"),
        "views": info.get("view_count"), "likes": info.get("like_count"), "comentarios": info.get("comment_count"),
        "duracao": info.get("duration"), "legenda": info.get("description") or info.get("title"),
        "capa": info.get("thumbnail"),
    }


def _cancelado(t):
    atual = _ler(t["id"])
    return bool(atual and atual.get("cancelar"))


def _baixar_pendentes(t, prazo):
    """Baixa em lotes paralelos; a cada lote grava o progresso e confere o prazo."""
    mod = PLATAFORMAS[t["plataforma"]]
    pasta = pasta_conta(t["plataforma"], t["conta"])
    itens = armazenamento.ler_json(f"{CHAVE_ITENS}{t['id']}.json", []) or []
    lote = PARALELO[t["plataforma"]] * 2

    def um(item):
        try:
            r = mod.baixar(item, pasta, lambda: False)
            item.pop("_info", None)
            salvar_metadados(t["plataforma"], t["conta"], [item])
            return r
        except Cancelado:
            raise
        except Exception as e:
            return f"erro: {str(e)[:200]} ({item['url']})"

    with ThreadPoolExecutor(PARALELO[t["plataforma"]]) as ex:
        while itens:
            if _cancelado(t):
                raise Cancelado()
            atual, itens = itens[:lote], itens[lote:]
            for r in ex.map(um, atual):
                if r == "pulado":
                    t["pulados"] += 1
                elif r == "baixado":
                    t["baixados"] += 1
                else:
                    t["erros"] += 1
                    _log(t, r)
            armazenamento.gravar_json(f"{CHAVE_ITENS}{t['id']}.json", itens)
            _gravar(t)
            if prazo and itens and time.time() > prazo:
                return True
    if t["opcoes"].get("modo") == "link" and t["baixados"] + t["pulados"]:
        _log(t, "Vídeo salvo na biblioteca.")
    return False


def _depois(t):
    """Monitoramento: depois de baixar o que é novo, reanalisa a conta com IA (se pedido)."""
    if t["opcoes"].get("analisar_depois") and t["baixados"] > 0:
        from .ia import perfil as ia_perfil, tarefas_ia
        if ia_perfil.versoes(t["plataforma"], t["conta"]):
            tarefas_ia.enfileirar("perfil", t["plataforma"], t["conta"])


execucao.registrar("download", executar)
