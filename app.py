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

from baixador import auth, biblioteca, contexto, db, instagram, midia, tarefas
from baixador.armazenamento import NUVEM, RAIZ
from baixador.filtros import PASTA_DOWNLOADS, normalizar_conta
from baixador.ia import chat as ia_chat
from baixador.ia import cliente as ia_cliente
from baixador.ia import memoria as ia_memoria
from baixador.ia import mercado as ia_mercado
from baixador.ia import perfil as ia_perfil
from baixador.ia import tarefas_ia as ia_tarefas
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
    return jsonify(db.um("select id, email, nome from usuarios where id = %s", contexto.usuario()))


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
