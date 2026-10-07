"""Tarefas de download: listar a conta, filtrar e catalogar/baixar cada vídeo.

O estado fica no banco (tabela tarefas), então a tarefa pode ser retomada por outra execução:
na nuvem cada mensagem da fila trabalha por alguns minutos e passa o bastão.
"""
import re
import time
from concurrent.futures import ThreadPoolExecutor

from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget

from . import biblioteca, catalogo, contexto, db, execucao, instagram, tiktok
from .fontes import scrapecreators
from .armazenamento import NUVEM
from .filtros import Cancelado, aplicar_filtro, ler_metadados, pasta_conta, salvar_metadados

PLATAFORMAS = {"tiktok": tiktok, "instagram": instagram}
PARALELO = {"tiktok": 3, "instagram": 2}  # o Instagram é mais sensível a rajadas
FINAIS = ("concluído", "erro", "cancelado")
MAX_HISTORICO = 100


# ---------------------------------------------------------------- estado

def _ler(tid):
    r = db.um("select id, usuario_id, dados from tarefas where id = %s and tipo = 'download'", tid)
    return {**r["dados"], "id": r["id"], "usuario_id": r["usuario_id"]} if r else None


def _gravar(t):
    db.executar("update tarefas set status = %s, dados = %s, fim = to_timestamp(%s) where id = %s",
                t["status"], {k: v for k, v in t.items() if k not in ("id", "usuario_id")}, t.get("fim"), t["id"])


def _log(t, msg):
    t["logs"] = (t.get("logs") or [])[-79:] + [f"{time.strftime('%H:%M:%S')} {msg}"]


def listar():
    linhas = db.todos("""select id, dados from tarefas where usuario_id = %s and tipo = 'download'
                         order by id desc limit %s""", contexto.usuario(), MAX_HISTORICO)
    return [{**{k: v for k, v in r["dados"].items() if not k.startswith("_")}, "id": r["id"]} for r in linhas]


def cancelar(tid):
    t = _ler(tid)
    if t and t["usuario_id"] == contexto.usuario() and t["status"] not in FINAIS:
        t["cancelar"] = True
        _gravar(t)


def limpar():
    db.executar("delete from tarefas where usuario_id = %s and tipo = 'download' and status = any(%s)",
                contexto.usuario(), db.Lista(FINAIS))


def enfileirar(plataforma, conta, opcoes, usuario_id=None):
    dados = {"plataforma": plataforma, "conta": conta, "opcoes": opcoes, "status": "na fila", "total": 0,
             "baixados": 0, "pulados": 0, "erros": 0, "logs": [], "cancelar": False, "criada": time.time(), "fim": None}
    r = db.um("insert into tarefas (usuario_id, tipo, status, dados) values (%s, 'download', 'na fila', %s) returning id",
              usuario_id or contexto.usuario(), dados)
    execucao.despachar("download", r["id"], faixa=f"download:{plataforma}")
    return {**dados, "id": r["id"]}


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
    contexto.definir(t["usuario_id"])
    contexto.definir_operacao("coleta")
    try:
        if t.get("cancelar"):
            raise Cancelado()
        if t["status"] == "na fila":
            _listar(t)
        falta = _baixar_pendentes(t, prazo)
        if falta or _coletar_comentarios(t, prazo):
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
    t.pop("_pendentes", None)
    _gravar(t)
    try:  # piloto automático da primeira configuração (estratégia e calendário quando tudo terminar)
        from .ia import tarefas_ia
        tarefas_ia.encadear()
    except Exception:
        pass
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

        opcoes = dict(t["opcoes"])
        if novos:
            r = db.um("""select max(p.publicado_em) as m from posts p join contas c on c.id = p.conta_id
                         where c.plataforma = %s and c.conta = %s""", t["plataforma"], t["conta"])
            if r and r["m"]:
                opcoes["_desde_ts"] = r["m"].timestamp() - 14 * 86400
        listados = mod.listar(t["conta"], opcoes, log, lambda: _cancelado(t), conhecido)
        itens = aplicar_filtro(listados, t["opcoes"])
        if novos:
            itens = [i for i in itens if str(i["id"]) not in conhecidos]
        _log(t, f"{len(listados)} vídeos listados, {len(itens)} selecionados.")
    t["total"] = len(itens)
    t["status"] = "baixando"
    t["_pendentes"] = itens
    _gravar(t)


def _item_do_link(t):
    _log(t, "Lendo o link...")
    opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    if t["plataforma"] == "tiktok":
        opts["impersonate"] = ImpersonateTarget.from_str("chrome")
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(t["opcoes"]["link"], download=False)
    t["conta"] = info.get("uploader") or info.get("channel") or t["conta"]
    acompanhar(t["plataforma"], t["conta"], so_se_novo=True)  # para o vídeo aparecer na biblioteca (sem mudar papel)
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
    itens = t.get("_pendentes") or []
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
            t["_pendentes"] = itens
            _gravar(t)
            if prazo and itens and time.time() > prazo:
                return True
    if t["opcoes"].get("modo") == "link" and t["baixados"] + t["pulados"]:
        _log(t, "Vídeo salvo na biblioteca.")
    return False


POSTS_COM_COMENTARIOS = 15  # por conta: os posts com mais comentários
COMENTARIOS_POR_POST = 40


def _coletar_comentarios(t, prazo):
    """Voz do público: comentários dos posts mais comentados da conta (só com a API de dados)."""
    if not scrapecreators.ativo() or t["opcoes"].get("modo") == "link":
        return False
    cid = catalogo.conta_id(t["plataforma"], t["conta"], criar=False)
    ja = db.um("select count(*) as n from posts where conta_id = %s and extra ? 'comentarios_coletados'", cid)["n"]
    faltam = db.todos("""select codigo, url from posts where conta_id = %s and coalesce(comentarios, 0) > 0
                         and not (extra ? 'comentarios_coletados') order by comentarios desc limit %s""",
                      cid, max(0, POSTS_COM_COMENTARIOS - ja))
    if faltam and t["status"] != "comentários":
        t["status"] = "comentários"
        _log(t, f"Coletando comentários de {len(faltam)} posts...")
        _gravar(t)
    for p in faltam:
        if _cancelado(t):
            raise Cancelado()
        try:
            n = catalogo.salvar_comentarios(t["plataforma"], p["codigo"],
                                            scrapecreators.comentarios(t["plataforma"], p["url"], COMENTARIOS_POR_POST))
            t["comentarios"] = t.get("comentarios", 0) + n
        except Exception as e:
            catalogo.salvar_comentarios(t["plataforma"], p["codigo"], [])  # marca para não tentar de novo
            _log(t, f"Sem comentários de {p['codigo']}: {str(e)[:120]}")
        _gravar(t)
        if prazo and time.time() > prazo:
            return True
    if faltam:
        _log(t, f"{t.get('comentarios', 0)} comentários coletados.")
    return False


def _depois(t):
    """Monitoramento: depois de baixar o que é novo, reanalisa a conta com IA (se pedido)."""
    from .ia import perfil as ia_perfil, tarefas_ia
    if t["opcoes"].get("analisar_ao_fim") and (t["baixados"] + t["pulados"]) > 0:
        # fluxo "coletar e analisar" (ex.: ao adicionar o seu perfil): a análise começa sozinha
        tarefas_ia.enfileirar("perfil", t["plataforma"], t["conta"])
    elif t["opcoes"].get("analisar_depois") and t["baixados"] > 0:
        if ia_perfil.versoes(t["plataforma"], t["conta"]):
            tarefas_ia.enfileirar("perfil", t["plataforma"], t["conta"])


class PerfilProprio(ValueError):
    """Tentativa de usar o perfil principal da conta como concorrente/referência."""


def perfil_proprio_igual(usuario_id, plataforma, conta):
    """O perfil principal com esse @ (em qualquer plataforma: é a mesma marca), se houver."""
    return db.um("""select c.plataforma, c.conta from acompanhamentos a join contas c on c.id = a.conta_id
                    where a.usuario_id = %s and a.papel = 'proprio' and lower(c.conta) = lower(%s)
                    order by (c.plataforma = %s) desc limit 1""", usuario_id, conta, plataforma)


def validar_papel(usuario_id, plataforma, conta, papel):
    """Regra de negócio: o perfil principal da conta nunca vira concorrente/referência de si mesmo."""
    if papel == "proprio":
        return
    p = perfil_proprio_igual(usuario_id, plataforma, conta)
    if p:
        raise PerfilProprio(f"@{p['conta']} é o perfil principal da sua conta e não pode ser "
                            f"adicionado como {'referência' if papel == 'referencia' else 'concorrente'}.")


def acompanhar(plataforma, conta, papel="concorrente", nome=None, usuario_id=None, so_se_novo=False, aspectos=None, nota=None):
    """Marca que o usuário acompanha a conta (cria a conta no catálogo compartilhado se preciso).
    `so_se_novo`: só cria o vínculo, sem mudar o papel de quem já existe (ex.: baixar um vídeo avulso)."""
    usuario_id = usuario_id or contexto.usuario()
    if so_se_novo:
        cid = catalogo.conta_id(plataforma, conta)
        db.executar("""insert into acompanhamentos (usuario_id, conta_id, papel, nome) values (%s, %s, %s, %s)
                       on conflict (usuario_id, conta_id) do nothing""",
                    usuario_id, cid, "proprio" if perfil_proprio_igual(usuario_id, plataforma, conta) else papel, nome)
        return cid
    validar_papel(usuario_id, plataforma, conta, papel)
    cid = catalogo.conta_id(plataforma, conta)
    db.executar("""insert into acompanhamentos (usuario_id, conta_id, papel, nome, aspectos, nota) values (%s, %s, %s, %s, %s, %s)
                   on conflict (usuario_id, conta_id) do update set papel = excluded.papel,
                   nome = coalesce(excluded.nome, acompanhamentos.nome),
                   aspectos = case when %s then excluded.aspectos else acompanhamentos.aspectos end,
                   nota = coalesce(excluded.nota, acompanhamentos.nota)""",
                usuario_id, cid, papel, nome, aspectos or [], (nota or "").strip()[:1000] or None, aspectos is not None)
    return cid


def definir_contexto(plataforma, conta, papel, aspectos, nota, usuario_id=None):
    """Atualiza como o usuário vê o perfil (papel, o que interessa nele e a anotação livre)."""
    usuario_id = usuario_id or contexto.usuario()
    validar_papel(usuario_id, plataforma, conta, papel)
    db.executar("""update acompanhamentos set papel = %s, aspectos = %s, nota = %s
                   where usuario_id = %s and conta_id = (select id from contas where plataforma = %s and conta = %s)""",
                papel, list(aspectos or [])[:12], (nota or "").strip()[:1000] or None, usuario_id, plataforma, conta)


execucao.registrar("download", executar)
