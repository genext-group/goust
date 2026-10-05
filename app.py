"""Painel local para baixar vídeos de contas do TikTok e Reels do Instagram.

Rode:  python app.py   (ou dê dois cliques em iniciar.bat) e abra http://127.0.0.1:5000
A interface (React + HeroUI) fica em web/ e é servida já compilada de web/dist.
"""
import json
import os
import subprocess
import threading
import webbrowser

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

from baixador import biblioteca, instagram, tarefas
from baixador.filtros import PASTA_DADOS, PASTA_DOWNLOADS, RAIZ, normalizar_conta
from baixador.ia import chat as ia_chat
from baixador.ia import cliente as ia_cliente
from baixador.ia import memoria as ia_memoria
from baixador.ia import mercado as ia_mercado
from baixador.ia import perfil as ia_perfil
from baixador.ia import tarefas_ia as ia_tarefas
from baixador.ia import video as ia_video

DIST = RAIZ / "web" / "dist"
app = Flask(__name__, static_folder=None)
ARQ_CONTAS = RAIZ / "contas.json"
estado_login = {"status": "", "rodando": False}


def ler_contas():
    if ARQ_CONTAS.exists():
        return json.loads(ARQ_CONTAS.read_text(encoding="utf-8"))
    return []


def gravar_contas(contas):
    ARQ_CONTAS.write_text(json.dumps(contas, ensure_ascii=False, indent=2), encoding="utf-8")


def contas_completas():
    """Contas salvas + foto/seguidores + quantos vídeos já foram baixados."""
    resumo, perfis = biblioteca.resumo_por_conta(), biblioteca.perfis()
    saida = []
    for c in ler_contas():
        k = f"{c['plataforma']}/{c['conta']}"
        saida.append({**c, "perfil": perfis.get(k), **resumo.get(k, {"videos": 0, "views": 0, "ultimo": ""})})
    return saida


# ---------------------------------------------------------------- contas

@app.get("/api/contas")
def api_contas():
    return jsonify(contas_completas())


@app.post("/api/contas")
def api_adicionar_conta():
    d = request.json
    try:
        plataforma, conta = normalizar_conta(d["conta"], d.get("plataforma"))
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    contas = ler_contas()
    if not any(c["plataforma"] == plataforma and c["conta"] == conta for c in contas):
        nova = {"nome": d.get("nome") or conta, "plataforma": plataforma, "conta": conta}
        perfil = biblioteca.atualizar_perfil(plataforma, conta)
        if perfil and perfil.get("nome") and not d.get("nome"):
            nova["nome"] = perfil["nome"]
        contas.append(nova)
        gravar_contas(contas)
    return jsonify(contas_completas())


@app.delete("/api/contas/<plataforma>/<conta>")
def api_remover_conta(plataforma, conta):
    gravar_contas([c for c in ler_contas() if not (c["plataforma"] == plataforma and c["conta"] == conta)])
    return jsonify(contas_completas())


@app.get("/avatar/<plataforma>/<arquivo>")
def avatar(plataforma, arquivo):
    caminho = PASTA_DADOS / "avatares" / f"{plataforma}_{arquivo}"
    if not caminho.exists():
        abort(404)
    return send_file(caminho, max_age=86400)


# ---------------------------------------------------------------- downloads

@app.post("/api/baixar")
def api_baixar():
    d = request.json
    criadas = []
    for alvo in d["contas"]:
        try:
            plataforma, conta = normalizar_conta(alvo["conta"], alvo.get("plataforma"))
        except ValueError as e:
            return jsonify(erro=str(e)), 400
        criadas.append(tarefas.enfileirar(plataforma, conta, d["opcoes"]).id)
    return jsonify(criadas=criadas)


@app.post("/api/baixar-link")
def api_baixar_link():
    try:
        t = tarefas.enfileirar_link(request.json["url"].strip())
    except ValueError as e:
        return jsonify(erro=str(e)), 400
    return jsonify(criadas=[t.id])


@app.get("/api/tarefas")
def api_tarefas():
    lista = sorted(tarefas.tarefas.values(), key=lambda t: t.id, reverse=True)
    return jsonify([t.como_dict() for t in lista])


@app.post("/api/tarefas/<int:tid>/cancelar")
def api_cancelar(tid):
    t = tarefas.tarefas.get(tid)
    if t:
        t.cancelar = True
    return jsonify(ok=True)


@app.post("/api/tarefas/limpar")
def api_limpar():
    for tid, t in list(tarefas.tarefas.items()):
        if t.status in tarefas.FINAIS:
            del tarefas.tarefas[tid]
    tarefas.salvar_historico()
    return jsonify(ok=True)


# ---------------------------------------------------------------- biblioteca

@app.get("/api/biblioteca")
def api_biblioteca():
    return jsonify(biblioteca.videos())


@app.get("/media/<plataforma>/<conta>/<arquivo>")
def media(plataforma, conta, arquivo):
    return send_from_directory(PASTA_DOWNLOADS / plataforma / conta, arquivo, conditional=True)


@app.get("/thumb/<plataforma>/<conta>/<arquivo>")
def thumb(plataforma, conta, arquivo):
    if ".." in plataforma + conta + arquivo:
        abort(400)
    caminho = biblioteca.miniatura(plataforma, conta, arquivo)
    if not caminho:
        abort(404)
    return send_file(caminho, max_age=604800)


@app.post("/api/abrir-pasta")
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


# ---------------------------------------------------------------- instagram (login opcional)

@app.get("/api/instagram")
def api_instagram_status():
    return jsonify(usuario=instagram.sessao_ativa(), **estado_login)


@app.post("/api/instagram/conectar")
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
def api_instagram_desconectar():
    instagram.desconectar()
    return jsonify(ok=True)


# ---------------------------------------------------------------- inteligência (IA)

@app.get("/api/ia/status")
def api_ia_status():
    return jsonify(configurada=ia_cliente.configurada(), modelos=ia_cliente.MODELOS, uso=ia_cliente.uso(),
                   aprendizados=ia_memoria.aprendizados(), feedbacks=len(ia_memoria.feedbacks()),
                   monitoramento=ia_tarefas.config())


@app.get("/api/ia/marca")
def api_ia_marca():
    return jsonify(ia_memoria.marca())


@app.put("/api/ia/marca")
def api_ia_salvar_marca():
    return jsonify(ia_memoria.salvar_marca(request.json))


@app.put("/api/ia/aprendizados")
def api_ia_salvar_regras():
    return jsonify(ia_memoria.salvar_regras(request.json["regras"]))


@app.post("/api/ia/aprendizados/destilar")
def api_ia_destilar():
    return jsonify(ia_memoria.destilar())


@app.post("/api/ia/feedback")
def api_ia_feedback():
    return jsonify(ia_memoria.registrar_feedback(request.json))


@app.get("/api/ia/votos/<path:ref>")
def api_ia_votos(ref):
    return jsonify(ia_memoria.votos_por_ref(ref))


@app.post("/api/ia/analisar")
def api_ia_analisar():
    if not ia_cliente.configurada():
        return jsonify(erro="Defina OPENAI_API_KEY no arquivo .env."), 400
    d = request.json or {}
    if d.get("tipo") == "mercado":
        t = ia_tarefas.enfileirar("mercado")
    else:
        t = ia_tarefas.enfileirar("perfil", d["plataforma"], d["conta"])
    return jsonify(t.como_dict())


@app.get("/api/ia/tarefas")
def api_ia_tarefas():
    return jsonify([t.como_dict() for t in sorted(ia_tarefas.tarefas.values(), key=lambda t: t.id, reverse=True)])


@app.get("/api/ia/relatorios")
def api_ia_relatorios():
    return jsonify(ia_perfil.resumo_todos())


@app.get("/api/ia/relatorio/<plataforma>/<conta>")
def api_ia_relatorio(plataforma, conta):
    r = ia_perfil.obter(plataforma, conta, request.args.get("versao"))
    return jsonify(relatorio=r, versoes=ia_perfil.versoes(plataforma, conta))


@app.get("/api/ia/mercado")
def api_ia_mercado():
    return jsonify(panorama=ia_mercado.obter(request.args.get("versao")), versoes=ia_mercado.versoes())


@app.get("/api/ia/video/<plataforma>/<vid>")
def api_ia_video(plataforma, vid):
    return jsonify(ia_video.obter(plataforma, vid))


@app.post("/api/ia/video/<plataforma>/<vid>")
def api_ia_analisar_video(plataforma, vid):
    v = next((x for x in biblioteca.videos() if x["plataforma"] == plataforma and x["id"] == vid), None)
    if not v:
        return jsonify(erro="Vídeo não encontrado."), 404
    todos = [x for x in biblioteca.videos() if x["plataforma"] == plataforma and x["conta"] == v["conta"]]
    try:
        return jsonify(ia_video.analisar(v, ia_perfil.metricas(todos)))
    except Exception as e:
        return jsonify(erro=str(e)), 500


@app.post("/api/ia/chat")
def api_ia_chat():
    d = request.json
    try:
        return jsonify(resposta=ia_chat.responder(d["escopo"], d["mensagens"]))
    except Exception as e:
        return jsonify(erro=str(e)), 500


@app.put("/api/ia/monitoramento")
def api_ia_monitoramento():
    return jsonify(ia_tarefas.salvar_config(request.json))


@app.post("/api/ia/monitoramento/agora")
def api_ia_monitorar_agora():
    threading.Thread(target=ia_tarefas.executar_monitoramento, args=(ler_contas(),), daemon=True).start()
    return jsonify(ok=True)


# ---------------------------------------------------------------- interface

@app.get("/")
@app.get("/<path:caminho>")
def interface(caminho="index.html"):
    if not DIST.exists():
        return "Interface não compilada. Rode iniciar.bat (ou: cd web && npm install && npm run build).", 500
    if (DIST / caminho).is_file():
        return send_from_directory(DIST, caminho)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    biblioteca.atualizar_perfis_em_segundo_plano(ler_contas())
    ia_tarefas.iniciar_agendador(ler_contas)
    threading.Timer(1.2, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
