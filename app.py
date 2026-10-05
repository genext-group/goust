"""Referências: baixa e analisa vídeos de concorrentes no TikTok e no Instagram.

Local:  python app.py   (ou iniciar.bat) e abra http://127.0.0.1:5000
Nuvem:  publicado na Vercel; dados no Redis, tarefas longas pelas Vercel Queues (ver fila.py).
A interface (React + HeroUI) fica em web/ e é compilada para public/.
"""
import os
import subprocess
import threading
import webbrowser
from functools import wraps

from curl_cffi import requests as http
from flask import (Flask, Response, abort, jsonify, request, send_file, send_from_directory,
                   stream_with_context)

from baixador import auth, biblioteca, contexto, db, instagram, midia, pastas, tarefas
from baixador.armazenamento import NUVEM, RAIZ
from baixador.filtros import PASTA_DOWNLOADS, normalizar_conta
from baixador.ia import chat as ia_chat
from baixador.ia import cliente as ia_cliente
from baixador.ia import memoria as ia_memoria
from baixador.ia import mercado as ia_mercado
from baixador.ia import perfil as ia_perfil
from baixador.ia import tarefas_ia as ia_tarefas
from baixador.ia import conteudo as ia_conteudo
from baixador.ia import imagens as ia_imagens
from baixador.ia import video as ia_video

PUBLICO = RAIZ / "public"
CLERK = bool(auth.chave_publica_clerk()) and NUVEM

app = Flask(__name__, static_folder=None)
estado_login = {"status": "", "rodando": False}


# ---------------------------------------------------------------- acesso

def _token():
    cab = request.headers.get("Authorization", "")
    if cab.startswith("Bearer "):
        return cab[7:]
    return request.args.get("t") or request.cookies.get("__session")


def protegido(f):
    """Nuvem: exige login do Clerk e define o usuário da requisição. Local: usuário do dono."""
    @wraps(f)
    def envolto(*a, **kw):
        if CLERK:
            usuario = auth.validar_token(_token() or "")
            if not usuario:
                return jsonify(erro="Faça login."), 401
            auth.garantir_usuario(usuario)
        elif NUVEM:
            return jsonify(erro="Login não configurado (Clerk)."), 503
        else:
            usuario = auth.usuario_local()
        contexto.definir(usuario)
        return f(*a, **kw)
    return envolto


def so_local(f):
    @wraps(f)
    def envolto(*a, **kw):
        if NUVEM:
            return jsonify(erro="Disponível só no app local (iniciar.bat)."), 400
        return f(*a, **kw)
    return envolto


@app.get("/api/ambiente")
def api_ambiente():
    return jsonify(nuvem=NUVEM, clerk=auth.chave_publica_clerk() if CLERK else None)


@app.get("/api/eu")
@protegido
def api_eu():
    u = db.um("select id, email, nome, config from usuarios where id = %s", contexto.usuario())
    config = u.pop("config") or {}
    return jsonify({**u, "onboarding": bool(config.get("onboarding")), "piloto": config.get("piloto") or {}})


# ---------------------------------------------------------------- contas

def ler_contas():
    """Contas que o usuário atual acompanha (as dele e as dos concorrentes)."""
    return db.todos("""select c.plataforma, c.conta, coalesce(a.nome, c.nome, c.conta) as nome, a.papel
                       from acompanhamentos a join contas c on c.id = a.conta_id
                       where a.usuario_id = %s order by a.criado_em""", contexto.usuario())


def contas_completas():
    """Contas salvas + foto/seguidores + quantos vídeos já foram catalogados."""
    resumo, perfis = biblioteca.resumo_por_conta(), biblioteca.perfis()
    saida = []
    for c in ler_contas():
        k = f"{c['plataforma']}/{c['conta']}"
        saida.append({**c, "perfil": perfis.get(k), **resumo.get(k, {"videos": 0, "views": 0, "ultimo": ""})})
    return saida


@app.get("/api/contas")
@protegido
def api_contas():
    return jsonify(contas_completas())


@app.post("/api/contas")
@protegido
def api_adicionar_conta():
    d = request.json
    try:
        plataforma, conta = normalizar_conta(d["conta"], d.get("plataforma"))
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    tarefas.acompanhar(plataforma, conta, d.get("papel") or "concorrente", d.get("nome"))
    biblioteca.atualizar_perfil(plataforma, conta)
    return jsonify(contas_completas())


@app.put("/api/contas/<plataforma>/<conta>/papel")
@protegido
def api_papel_conta(plataforma, conta):
    papel = "proprio" if (request.json or {}).get("papel") == "proprio" else "concorrente"
    db.executar("""update acompanhamentos set papel = %s where usuario_id = %s and conta_id =
                   (select id from contas where plataforma = %s and conta = %s)""", papel, contexto.usuario(), plataforma, conta)
    return jsonify(contas_completas())


@app.delete("/api/contas/<plataforma>/<conta>")
@protegido
def api_remover_conta(plataforma, conta):
    db.executar("""delete from acompanhamentos where usuario_id = %s and conta_id =
                   (select id from contas where plataforma = %s and conta = %s)""", contexto.usuario(), plataforma, conta)
    return jsonify(contas_completas())


@app.get("/avatar/<plataforma>/<arquivo>")
def avatar(plataforma, arquivo):
    from baixador import armazenamento
    dados = armazenamento.imagem_ler(biblioteca.chave_avatar(plataforma, arquivo.removesuffix(".jpg")))
    if not dados:
        abort(404)
    return Response(dados, mimetype="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# ---------------------------------------------------------------- downloads

@app.post("/api/baixar")
@protegido
def api_baixar():
    d = request.json
    criadas = []
    for alvo in d["contas"]:
        try:
            plataforma, conta = normalizar_conta(alvo["conta"], alvo.get("plataforma"))
        except ValueError as e:
            return jsonify(erro=str(e)), 400
        criadas.append(tarefas.enfileirar(plataforma, conta, d["opcoes"])["id"])
    return jsonify(criadas=criadas)


@app.post("/api/baixar-link")
@protegido
def api_baixar_link():
    try:
        t = tarefas.enfileirar_link(request.json["url"].strip())
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    return jsonify(criadas=[t["id"]])


@app.get("/api/tarefas")
@protegido
def api_tarefas():
    return jsonify(tarefas.listar())


@app.post("/api/tarefas/<int:tid>/cancelar")
@protegido
def api_cancelar(tid):
    tarefas.cancelar(tid)
    return jsonify(ok=True)


@app.post("/api/tarefas/limpar")
@protegido
def api_limpar():
    tarefas.limpar()
    return jsonify(ok=True)


# ---------------------------------------------------------------- biblioteca

@app.get("/api/biblioteca")
@protegido
def api_biblioteca():
    return jsonify(biblioteca.videos())


@app.get("/api/comentarios/<plataforma>/<vid>")
@protegido
def api_comentarios(plataforma, vid):
    from baixador import catalogo
    return jsonify([{**c, "publicado_em": c["publicado_em"].isoformat() if c["publicado_em"] else None}
                    for c in catalogo.comentarios(plataforma, vid)])


@app.get("/media/<plataforma>/<conta>/<arquivo>")
@so_local
def media(plataforma, conta, arquivo):
    return send_from_directory(PASTA_DOWNLOADS / plataforma / conta, arquivo, conditional=True)


@app.get("/thumb/<plataforma>/<conta>/<vid>")
def thumb(plataforma, conta, vid):
    if ".." in plataforma + conta + vid:
        abort(400)
    dados = biblioteca.miniatura(plataforma, conta, vid.removesuffix(".mp4").split("_")[-1] if vid.endswith(".mp4") else vid)
    if not dados:
        abort(404)
    return Response(dados, mimetype="image/jpeg", headers={"Cache-Control": "public, max-age=604800, immutable"})


@app.get("/api/arquivo/<plataforma>/<conta>/<vid>")
@protegido
def api_arquivo(plataforma, conta, vid):
    """Botão Baixar: local entrega o arquivo; na nuvem busca na plataforma e repassa em streaming."""
    v = next((x for x in biblioteca.videos(plataforma, conta) if x["id"] == vid), None)
    if not v:
        abort(404)
    nome = f"{conta}_{(v['data'] or 'sem-data')[:10]}_{vid}.mp4"
    if not NUVEM:
        return send_file(PASTA_DOWNLOADS / plataforma / conta / v["arquivo"], as_attachment=True, download_name=nome)
    try:
        url, cabecalhos = midia.link_direto(v["url"], plataforma)
        r = http.get(url, headers=cabecalhos, impersonate="chrome", stream=True, timeout=120)
        r.raise_for_status()
    except Exception as e:
        return jsonify(erro=f"Não foi possível buscar o vídeo agora: {e}"), 502
    return Response(stream_with_context(r.iter_content()), mimetype="video/mp4",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@app.post("/api/abrir-pasta")
@protegido
@so_local
def api_abrir_pasta():
    d = request.json or {}
    pasta = PASTA_DOWNLOADS
    if d.get("plataforma") and d.get("conta"):
        pasta = pasta / d["plataforma"] / d["conta"]
    pasta.mkdir(parents=True, exist_ok=True)
    if d.get("arquivo"):
        subprocess.Popen(["explorer", f"/select,{pasta / d['arquivo']}"])
    else:
        os.startfile(pasta)
    return jsonify(ok=True)


# ---------------------------------------------------------------- instagram (login opcional, só local)

@app.get("/api/instagram")
@protegido
def api_instagram_status():
    return jsonify(usuario=None if NUVEM else instagram.sessao_ativa(), nuvem=NUVEM, **estado_login)


@app.post("/api/instagram/conectar")
@protegido
@so_local
def api_instagram_conectar():
    if estado_login["rodando"]:
        return jsonify(ok=True)

    def rodar():
        estado_login.update(rodando=True, status="Aguardando login na janela do navegador...")
        try:
            instagram.conectar(lambda m: estado_login.update(status=m))
            estado_login["status"] = ""
        except Exception as e:
            estado_login["status"] = f"Falhou: {e}"
        finally:
            estado_login["rodando"] = False

    threading.Thread(target=rodar, daemon=True).start()
    return jsonify(ok=True)


@app.post("/api/instagram/desconectar")
@protegido
@so_local
def api_instagram_desconectar():
    instagram.desconectar()
    return jsonify(ok=True)


# ---------------------------------------------------------------- inteligência (IA)

@app.get("/api/ia/status")
@protegido
def api_ia_status():
    return jsonify(configurada=ia_cliente.configurada(), modelos=ia_cliente.MODELOS, uso=ia_cliente.uso(),
                   aprendizados=ia_memoria.aprendizados(), feedbacks=len(ia_memoria.feedbacks()),
                   monitoramento=ia_tarefas.config(), nuvem=NUVEM)


@app.get("/api/ia/marca")
@protegido
def api_ia_marca():
    return jsonify(ia_memoria.marca())


@app.put("/api/ia/marca")
@protegido
def api_ia_salvar_marca():
    return jsonify(ia_memoria.salvar_marca(request.json))


@app.put("/api/ia/aprendizados")
@protegido
def api_ia_salvar_regras():
    return jsonify(ia_memoria.salvar_regras(request.json["regras"]))


@app.post("/api/ia/aprendizados/destilar")
@protegido
def api_ia_destilar():
    return jsonify(ia_memoria.destilar())


@app.post("/api/ia/feedback")
@protegido
def api_ia_feedback():
    return jsonify(ia_memoria.registrar_feedback(request.json))


@app.get("/api/ia/votos/<path:ref>")
@protegido
def api_ia_votos(ref):
    return jsonify(ia_memoria.votos_por_ref(ref))


@app.post("/api/ia/analisar")
@protegido
def api_ia_analisar():
    if not ia_cliente.configurada():
        return jsonify(erro="Defina OPENAI_API_KEY nas variáveis de ambiente."), 400
    d = request.json or {}
    if d.get("tipo") in ("mercado", "estrategia"):
        t = ia_tarefas.enfileirar(d["tipo"])
    else:
        t = ia_tarefas.enfileirar("perfil", d["plataforma"], d["conta"])
    return jsonify(t)


@app.get("/api/ia/tarefas")
@protegido
def api_ia_tarefas():
    return jsonify(ia_tarefas.listar())


@app.get("/api/ia/relatorios")
@protegido
def api_ia_relatorios():
    return jsonify(ia_perfil.resumo_todos())


@app.get("/api/ia/relatorio/<plataforma>/<conta>")
@protegido
def api_ia_relatorio(plataforma, conta):
    r = ia_perfil.obter(plataforma, conta, request.args.get("versao"))
    return jsonify(relatorio=r, versoes=ia_perfil.versoes(plataforma, conta))


@app.get("/api/ia/mercado")
@protegido
def api_ia_mercado():
    return jsonify(panorama=ia_mercado.obter(request.args.get("versao")), versoes=ia_mercado.versoes())


@app.get("/api/ia/estrategia")
@protegido
def api_ia_estrategia():
    from baixador.ia import estrategia
    proprias, concorrentes = estrategia.contas_por_papel()
    return jsonify(estrategia=estrategia.obter(request.args.get("versao")), versoes=estrategia.versoes(),
                   proprias=len(proprias), concorrentes=len(concorrentes))


@app.post("/api/ia/brief/rascunho")
@protegido
def api_ia_rascunho_brief():
    from baixador.ia import estrategia
    try:
        return jsonify(estrategia.rascunhar_brief((request.json or {}).get("site") or None))
    except ValueError as e:
        return jsonify(erro=str(e)), 400


@app.get("/api/ia/video/<plataforma>/<vid>")
@protegido
def api_ia_video(plataforma, vid):
    return jsonify(ia_video.obter(plataforma, vid))


@app.post("/api/ia/video/<plataforma>/<vid>")
@protegido
def api_ia_analisar_video(plataforma, vid):
    todos = biblioteca.videos()
    v = next((x for x in todos if x["plataforma"] == plataforma and x["id"] == vid), None)
    if not v:
        return jsonify(erro="Vídeo não encontrado."), 404
    da_conta = [x for x in todos if x["plataforma"] == plataforma and x["conta"] == v["conta"]]
    try:
        return jsonify(ia_video.analisar(v, ia_perfil.metricas(da_conta)))
    except Exception as e:
        return jsonify(erro=str(e)), 500


@app.post("/api/ia/chat")
@protegido
def api_ia_chat():
    d = request.json
    try:
        return jsonify(resposta=ia_chat.responder(d["escopo"], d["mensagens"]))
    except Exception as e:
        return jsonify(erro=str(e)), 500


@app.put("/api/ia/monitoramento")
@protegido
def api_ia_monitoramento():
    return jsonify(ia_tarefas.salvar_config(request.json))


@app.post("/api/ia/monitoramento/agora")
@protegido
def api_ia_monitorar_agora():
    ia_tarefas.executar_monitoramento(ler_contas())
    return jsonify(ok=True)


@app.get("/api/cron/monitorar")
def api_cron_monitorar():
    """Chamado pelo cron diário da Vercel (vercel.json). Só roda se o monitoramento estiver ligado."""
    if request.headers.get("Authorization") != f"Bearer {os.getenv('CRON_SECRET', '')}" or not os.getenv("CRON_SECRET"):
        return jsonify(erro="não autorizado"), 401
    ia_tarefas.monitorar_todos(ler_contas)
    return jsonify(ok=True)


# ---------------------------------------------------------------- pastas e favoritos (biblioteca)

def _erro(f, *a, **k):
    try:
        return jsonify(f(*a, **k))
    except ValueError as e:
        return jsonify(erro=str(e)), 400


@app.get("/api/pastas")
@protegido
def api_pastas():
    return jsonify(pastas=pastas.listar(), mapa=pastas.mapa_do_usuario())


@app.post("/api/pastas")
@protegido
def api_criar_pasta():
    d = request.json or {}
    return _erro(pastas.criar, d.get("nome"), d.get("cor"))


@app.put("/api/pastas/<int:pid>")
@protegido
def api_renomear_pasta(pid):
    d = request.json or {}
    return _erro(pastas.renomear, pid, d.get("nome", ""), d.get("cor"))


@app.delete("/api/pastas/<int:pid>")
@protegido
def api_apagar_pasta(pid):
    return _erro(pastas.apagar, pid)


@app.post("/api/pastas/<int:pid>/posts")
@protegido
def api_pasta_post(pid):
    d = request.json or {}
    return _erro(lambda: (pastas.colocar(pid, d["plataforma"], d["id"], d.get("dentro", True)), True)[1])


@app.post("/api/favorito")
@protegido
def api_favorito():
    d = request.json or {}
    return _erro(lambda: (pastas.favoritar(d["plataforma"], d["id"], d.get("favorito", True)), True)[1])


# ---------------------------------------------------------------- criação: estilos visuais e imagens

@app.get("/img/<nome>")
def img(nome):
    """Imagens geradas e referências de estilo (o nome é aleatório e longo: funciona como link privado)."""
    dados = ia_imagens.ler_arquivo(nome)
    if not dados:
        abort(404)
    tipo = "image/webp" if nome.endswith(".webp") else "image/jpeg"
    return Response(dados, mimetype=tipo, headers={"Cache-Control": "private, max-age=31536000, immutable"})


@app.get("/api/estilos")
@protegido
def api_estilos():
    return jsonify(estilos=ia_imagens.listar_estilos(), formatos=ia_imagens.formatos())


@app.post("/api/estilos")
@protegido
def api_criar_estilo():
    return jsonify(id=ia_imagens.criar_estilo((request.json or {}).get("nome")), estilos=ia_imagens.listar_estilos())


@app.put("/api/estilos/<int:eid>")
@protegido
def api_renomear_estilo(eid):
    return _erro(lambda: (ia_imagens.renomear_estilo(eid, (request.json or {}).get("nome", "")), ia_imagens.listar_estilos())[1])


@app.delete("/api/estilos/<int:eid>")
@protegido
def api_apagar_estilo(eid):
    return _erro(lambda: (ia_imagens.apagar_estilo(eid), ia_imagens.listar_estilos())[1])


@app.post("/api/estilos/<int:eid>/refs")
@protegido
def api_ref_estilo(eid):
    """Upload (multipart 'arquivo', vários) ou post da biblioteca (JSON {plataforma, id})."""
    def fazer():
        if request.files:
            arquivos = request.files.getlist("arquivo")
            for a in arquivos:
                ia_imagens.adicionar_upload(eid, a.read())
        else:
            d = request.json or {}
            if d.get("imagem_id"):
                ia_imagens.imagem_para_referencia(d["imagem_id"], eid)
            else:
                ia_imagens.adicionar_post(eid, d["plataforma"], d["id"])
        return ia_imagens.listar_estilos()
    return _erro(fazer)


@app.delete("/api/estilos/<int:eid>/refs/<int:rid>")
@protegido
def api_remover_ref(eid, rid):
    return _erro(lambda: (ia_imagens.remover_ref(eid, rid), ia_imagens.listar_estilos())[1])


@app.post("/api/estilos/<int:eid>/analisar")
@protegido
def api_analisar_estilo(eid):
    return jsonify(ia_tarefas.enfileirar("estilo", params={"alvo": eid}))


@app.get("/api/imagens")
@protegido
def api_imagens():
    return jsonify(ia_imagens.listar_imagens())


@app.post("/api/imagens")
@protegido
def api_gerar_imagem():
    d = request.json or {}
    if not (d.get("pedido") or "").strip():
        return jsonify(erro="Descreva a imagem que você quer."), 400
    params = {k: d.get(k) for k in ("pedido", "estilo_id", "formato", "qualidade", "conteudo_id")}
    quantidade = max(1, min(int(d.get("quantidade") or 1), 4))
    return jsonify([ia_tarefas.enfileirar("imagem", params=params) for _ in range(quantidade)])


@app.put("/api/imagens/<int:iid>")
@protegido
def api_favoritar_imagem(iid):
    ia_imagens.favoritar_imagem(iid, (request.json or {}).get("favorita"))
    return jsonify(ok=True)


@app.delete("/api/imagens/<int:iid>")
@protegido
def api_apagar_imagem(iid):
    ia_imagens.apagar_imagem(iid)
    return jsonify(ok=True)


# ---------------------------------------------------------------- criação: calendário e roteiros

@app.get("/api/conteudos")
@protegido
def api_conteudos():
    return jsonify(ia_conteudo.listar())


@app.post("/api/conteudos")
@protegido
def api_criar_conteudo():
    return _erro(ia_conteudo.criar, request.json or {})


@app.put("/api/conteudos/<int:cid>")
@protegido
def api_atualizar_conteudo(cid):
    return _erro(ia_conteudo.atualizar, cid, request.json or {})


@app.delete("/api/conteudos/<int:cid>")
@protegido
def api_apagar_conteudo(cid):
    ia_conteudo.apagar(cid)
    return jsonify(ok=True)


@app.post("/api/conteudos/calendario")
@protegido
def api_gerar_calendario():
    d = request.json or {}
    return jsonify(ia_tarefas.enfileirar("calendario", params={"semanas": d.get("semanas", 2), "inicio": d.get("inicio")}))


@app.post("/api/conteudos/ideias")
@protegido
def api_gerar_ideias():
    d = request.json or {}
    try:
        return jsonify(ia_conteudo.gerar_ideias(d.get("qtd", 4), d.get("pilar"), d.get("formato"), d.get("objetivo"), d.get("tema")))
    except Exception as e:
        return jsonify(erro=f"Não deu para gerar ideias: {e}"), 500


@app.post("/api/conteudos/ideias/escolha")
@protegido
def api_escolha_ideia():
    d = request.json or {}
    ia_conteudo.registrar_escolha(d.get("ideia") or {}, d.get("aceita", False))
    return jsonify(ok=True)


@app.post("/api/conteudos/<int:cid>/roteiro")
@protegido
def api_gerar_roteiro(cid):
    return jsonify(ia_tarefas.enfileirar("roteiro", params={"alvo": cid, "pedido": (request.json or {}).get("pedido", "")}))


# ---------------------------------------------------------------- primeira configuração

@app.post("/api/ia/sugerir-concorrentes")
@protegido
def api_sugerir_concorrentes():
    try:
        return jsonify(ia_conteudo.sugerir_concorrentes((request.json or {}).get("descricao", "")))
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    except Exception as e:
        return jsonify(erro=f"A pesquisa falhou: {e}"), 500


@app.post("/api/piloto")
@protegido
def api_piloto():
    d = request.json or {}
    ia_tarefas.ligar_piloto(d.get("estrategia", True), d.get("calendario", True))
    return jsonify(ok=True)


@app.put("/api/eu/config")
@protegido
def api_eu_config():
    """Preferências simples do usuário (ex.: onboarding concluído)."""
    d = {k: v for k, v in (request.json or {}).items() if k in ("onboarding",)}
    if d:
        db.executar("update usuarios set config = config || %s where id = %s", d, contexto.usuario())
    return jsonify(ok=True)


# ---------------------------------------------------------------- interface (modo local; na nuvem o CDN serve public/)

@app.get("/")
@app.get("/<path:caminho>")
def interface(caminho="index.html"):
    if not PUBLICO.exists():
        return "Interface não compilada. Rode iniciar.bat (ou: cd web && npm install && npm run build).", 500
    if (PUBLICO / caminho).is_file():
        return send_from_directory(PUBLICO, caminho)
    return send_from_directory(PUBLICO, "index.html")


if __name__ == "__main__":
    contexto.definir(auth.usuario_local())
    biblioteca.atualizar_perfis_em_segundo_plano(ler_contas())
    ia_tarefas.iniciar_agendador(auth.usuario_local(), ler_contas)
    threading.Timer(1.2, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
