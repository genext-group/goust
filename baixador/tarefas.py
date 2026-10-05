"""Fila de downloads: um trabalhador por plataforma (TikTok e Instagram rodam juntos),
com alguns downloads em paralelo dentro de cada conta."""
import itertools
import json
import queue
import re
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget

from . import biblioteca, instagram, tiktok
from .filtros import (PASTA_DADOS, Cancelado, aplicar_filtro, ler_planilha, nome_arquivo,
                      pasta_conta, salvar_planilha)

PLATAFORMAS = {"tiktok": tiktok, "instagram": instagram}
PARALELO = {"tiktok": 3, "instagram": 2}  # o Instagram é mais sensível a rajadas
ARQ_HISTORICO = PASTA_DADOS / "historico.json"
FINAIS = ("concluído", "erro", "cancelado")

_filas = {p: queue.Queue() for p in PLATAFORMAS}
tarefas = {}


class Tarefa:
    def __init__(self, plataforma, conta, opcoes, id=None):
        self.id = id or next(_contador)
        self.plataforma = plataforma
        self.conta = conta
        self.opcoes = opcoes
        self.status = "na fila"
        self.total = self.baixados = self.pulados = self.erros = 0
        self.logs = []
        self.cancelar = False
        self.criada = time.time()
        self.fim = None

    def log(self, msg):
        self.logs.append(f"{time.strftime('%H:%M:%S')} {msg}")
        self.logs = self.logs[-80:]

    def como_dict(self):
        return {k: getattr(self, k) for k in ("id", "plataforma", "conta", "opcoes", "status", "total",
                                              "baixados", "pulados", "erros", "logs", "criada", "fim")}


# ---------------------------------------------------------------- histórico

def _carregar_historico():
    if not ARQ_HISTORICO.exists():
        return
    for d in json.loads(ARQ_HISTORICO.read_text(encoding="utf-8")):
        t = Tarefa(d["plataforma"], d["conta"], d["opcoes"], id=d["id"])
        for k in ("status", "total", "baixados", "pulados", "erros", "logs", "criada", "fim"):
            setattr(t, k, d.get(k))
        if t.status not in FINAIS:  # o app foi fechado no meio
            t.status = "cancelado"
        tarefas[t.id] = t


def salvar_historico():
    PASTA_DADOS.mkdir(exist_ok=True)
    finais = sorted((t for t in tarefas.values() if t.status in FINAIS), key=lambda t: t.id)[-100:]
    ARQ_HISTORICO.write_text(json.dumps([t.como_dict() for t in finais], ensure_ascii=False), encoding="utf-8")


_carregar_historico()
_contador = itertools.count(max(tarefas, default=0) + 1)


# ---------------------------------------------------------------- execução

def enfileirar(plataforma, conta, opcoes):
    t = Tarefa(plataforma, conta, opcoes)
    tarefas[t.id] = t
    _filas[plataforma].put(t)
    return t


def enfileirar_link(url):
    plataforma = "instagram" if "instagram.com" in url else "tiktok" if "tiktok.com" in url else None
    if not plataforma:
        raise ValueError("Cole um link do TikTok ou do Instagram.")
    m = re.search(r"tiktok\.com/@([\w.\-]+)", url)
    return enfileirar(plataforma, m.group(1) if m else "…", {"modo": "link", "link": url})


def _baixar_itens(t, mod, itens, pasta):
    """Baixa em paralelo e grava a planilha a cada vídeo (nada se perde se o app fechar)."""
    def um(item):
        if t.cancelar:
            return
        try:
            r = mod.baixar(item, pasta, lambda: t.cancelar)
            if r == "pulado":
                t.pulados += 1
            else:
                t.baixados += 1
            salvar_planilha(pasta, [item])
        except Cancelado:
            pass
        except Exception as e:
            t.erros += 1
            t.log(f"Erro em {item['url']}: {str(e)[:200]}")

    with ThreadPoolExecutor(PARALELO[t.plataforma]) as ex:
        list(ex.map(um, itens))
    if t.cancelar:
        raise Cancelado()


def _executar(t):
    mod = PLATAFORMAS[t.plataforma]
    if t.opcoes.get("modo") == "link":
        return _executar_link(t, mod)

    biblioteca.atualizar_perfil(t.plataforma, t.conta)
    t.status = "listando"
    t.log(f"Listando vídeos de @{t.conta}...")
    pasta = pasta_conta(t.plataforma, t.conta)
    conhecidos = set(ler_planilha(pasta)) | {p.stem.split("_", 1)[-1] for p in pasta.glob("*.mp4")}
    conhecido = (lambda i: str(i) in conhecidos) if t.opcoes.get("modo") == "novos" else (lambda i: False)

    itens = mod.listar(t.conta, t.opcoes, t.log, lambda: t.cancelar, conhecido)
    selecionados = aplicar_filtro(itens, t.opcoes)
    if t.opcoes.get("modo") == "novos":
        selecionados = [i for i in selecionados if str(i["id"]) not in conhecidos]
    t.total = len(selecionados)
    t.log(f"{len(itens)} vídeos listados, {t.total} selecionados.")

    t.status = "baixando"
    _baixar_itens(t, mod, selecionados, pasta)
    t.status = "concluído"
    t.log(f"Fim: {t.baixados} baixados, {t.pulados} já existiam, {t.erros} erros.")


def _executar_link(t, mod):
    t.status = "listando"
    t.log("Lendo o link...")
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    if t.plataforma == "tiktok":
        opts["impersonate"] = ImpersonateTarget.from_str("chrome")
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(t.opcoes["link"], download=False)
    t.conta = info.get("uploader") or info.get("channel") or t.conta
    item = {
        "id": info.get("display_id") if t.plataforma == "instagram" else info["id"],
        "url": info.get("webpage_url") or t.opcoes["link"],
        "timestamp": info.get("timestamp"),
        "views": info.get("view_count"),
        "likes": info.get("like_count"),
        "comentarios": info.get("comment_count"),
        "duracao": info.get("duration"),
        "legenda": info.get("description") or info.get("title"),
    }
    t.total = 1
    t.status = "baixando"
    _baixar_itens(t, mod, [item], pasta_conta(t.plataforma, t.conta))
    t.status = "concluído" if not t.erros else "erro"
    t.log(f"Salvo como {nome_arquivo(item)}" if not t.erros else "Não foi possível baixar.")


def _trabalhador(plataforma):
    while True:
        t = _filas[plataforma].get()
        if t.cancelar:
            t.status = "cancelado"
        else:
            try:
                _executar(t)
            except Cancelado:
                t.status = "cancelado"
                t.log("Cancelado.")
            except (instagram.SessaoInvalida, ValueError, RuntimeError) as e:
                t.status = "erro"
                t.log(f"Erro: {e}")
            except Exception as e:
                t.status = "erro"
                t.log(f"Erro: {e}")
                traceback.print_exc()
        t.fim = time.time()
        salvar_historico()


for _p in PLATAFORMAS:
    threading.Thread(target=_trabalhador, args=(_p,), daemon=True).start()
