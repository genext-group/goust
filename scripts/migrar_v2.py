"""Migra os dados da versão 1 (Redis) para o Postgres multi-tenant, no usuário provisório "dono".

No primeiro login do dono (e-mail em DONO_EMAIL) o usuário "dono" vira o id do Clerk, levando tudo.
Idempotente: pode rodar de novo sem duplicar (relatórios/panoramas são pulados se a versão já existir).

    vercel env pull .env.nuvem --yes
    python scripts/migrar_v2.py
"""
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
os.environ["ARMAZENAMENTO"] = "nuvem"
from dotenv import dotenv_values  # noqa: E402

for k, v in dotenv_values(RAIZ / ".env.nuvem").items():
    if v:
        os.environ.setdefault(k, v)

from baixador import armazenamento as kv  # noqa: E402
from baixador import catalogo, contexto, db  # noqa: E402
from baixador.auth import DONO_PROVISORIO  # noqa: E402

DONO = DONO_PROVISORIO


def ts_iso(texto):
    """'2026-10-02 21:21' -> timestamp UTC."""
    if not texto:
        return None
    try:
        return datetime.strptime(texto[:16], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return datetime.strptime(texto[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def main():
    db.executar("insert into usuarios (id, nome) values (%s, 'Dono') on conflict (id) do nothing", DONO)
    contexto.definir(DONO)

    # contas acompanhadas
    contas = kv.ler_json("contas.json", []) or []
    for c in contas:
        cid = catalogo.conta_id(c["plataforma"], c["conta"])
        db.executar("""insert into acompanhamentos (usuario_id, conta_id, papel, nome) values (%s, %s, 'concorrente', %s)
                       on conflict do nothing""", DONO, cid, c.get("nome"))
    print(f"contas acompanhadas: {len(contas)}")

    # perfis (nome, seguidores, versão da foto)
    for chave, p in (kv.ler_json("dados/perfis.json", {}) or {}).items():
        plataforma, conta = chave.split("/", 1)
        versao = None
        if p.get("foto"):
            versao = num((parse_qs(urlparse(p["foto"]).query).get("v") or [None])[0]) or int(time.time())
        catalogo.atualizar_perfil(plataforma, conta, nome=p.get("nome"), seguidores=num(p.get("seguidores")), foto_versao=versao)

    # catálogo de posts
    n_posts = 0
    for chave in kv.listar("meta:"):
        plataforma, conta = chave.split(":", 1)[1].split("/", 1)
        itens = []
        for vid, r in kv.dic_ler(chave).items():
            itens.append({"id": vid, "url": r.get("url"), "timestamp": ts_iso(r.get("data")), "legenda": r.get("legenda"),
                          "duracao": num(r.get("duracao_s")), "views": num(r.get("views")), "likes": num(r.get("likes")),
                          "comentarios": num(r.get("comentarios"))})
        catalogo.salvar_posts(plataforma, conta, itens)
        n_posts += len(itens)
    print(f"posts: {n_posts}")

    # análises de vídeo (compartilhadas)
    n = 0
    for chave in kv.listar("dados/ia/videos/"):
        a = kv.ler_json(chave)
        pid = a and catalogo.post_id(a["plataforma"], a["id"])
        if pid:
            db.executar("""insert into analises_video (post_id, versao, dados) values (%s, %s, %s)
                           on conflict (post_id) do nothing""", pid, a.get("versao", 1), a)
            n += 1
    print(f"análises de vídeo: {n}")

    # relatórios e panoramas do dono
    n = 0
    for chave in kv.listar("dados/ia/relatorios/"):
        r = kv.ler_json(chave)
        cid = catalogo.conta_id(r["plataforma"], r["conta"])
        if not db.um("select 1 from relatorios where usuario_id = %s and conta_id = %s and versao = %s", DONO, cid, r["versao"]):
            db.executar("insert into relatorios (usuario_id, conta_id, versao, gerado_em, dados) values (%s, %s, %s, %s, %s)",
                        DONO, cid, r["versao"], datetime.fromisoformat(r["gerado"]), r)
            n += 1
    print(f"relatórios: {n}")
    for chave in kv.listar("dados/ia/mercado/"):
        r = kv.ler_json(chave)
        if not db.um("select 1 from panoramas where usuario_id = %s and versao = %s", DONO, r["versao"]):
            db.executar("insert into panoramas (usuario_id, versao, gerado_em, dados) values (%s, %s, %s, %s)",
                        DONO, r["versao"], datetime.fromisoformat(r["gerado"]), r)
            print("panorama:", r["versao"])

    # marca, aprendizados, feedbacks, monitoramento
    for tipo in ("marca", "aprendizados"):
        d = kv.ler_json(f"dados/ia/{tipo}.json")
        if d:
            db.executar("""insert into documentos (usuario_id, tipo, dados) values (%s, %s, %s)
                           on conflict (usuario_id, tipo) do nothing""", DONO, tipo, d)
            print("documento:", tipo)
    if not db.um("select 1 from feedbacks where usuario_id = %s", DONO):
        fbs = kv.lista_ler("dados/ia/feedback.jsonl")
        for f in fbs:
            db.executar("""insert into feedbacks (usuario_id, ts, alvo, ref, secao, item, voto, comentario)
                           values (%s, to_timestamp(%s), %s, %s, %s, %s, %s, %s)""", DONO, f.get("ts", time.time()),
                        f.get("alvo"), f.get("ref"), f.get("secao"), f.get("item"), f.get("voto"), f.get("comentario"))
        print(f"feedbacks: {len(fbs)}")
    mon = kv.ler_json("dados/monitoramento.json")
    if mon:
        db.executar("update usuarios set config = jsonb_set(config, '{monitoramento}', %s) where id = %s", mon, DONO)
    print("Pronto.")


if __name__ == "__main__":
    main()
