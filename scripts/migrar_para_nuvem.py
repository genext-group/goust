"""Copia os dados do app local para o Redis da versão online.

Uso (na raiz do projeto):
    vercel env pull .env.nuvem --yes
    python scripts/migrar_para_nuvem.py

Copia: contas, perfis e fotos, o catálogo de cada conta (métricas e legendas) com as miniaturas,
as análises de IA (vídeos, relatórios, panorama), marca, aprendizados, feedbacks e uso.
Os arquivos de vídeo NÃO são copiados (a versão online toca pelo player oficial).
"""
import csv
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import dotenv_values

RAIZ = Path(__file__).resolve().parent.parent
for k, v in dotenv_values(RAIZ / ".env.nuvem").items():
    if v:
        os.environ.setdefault(k, v)
os.environ["ARMAZENAMENTO"] = "nuvem"
sys.path.insert(0, str(RAIZ))

from baixador import armazenamento  # noqa: E402
from baixador.midia import chave_thumb, rodar_ffmpeg  # noqa: E402

DOWNLOADS = RAIZ / "downloads"
DADOS = RAIZ / "dados"


def rel(p):
    return str(p.relative_to(RAIZ)).replace("\\", "/")


def json_local(p):
    import json
    return json.loads(p.read_text(encoding="utf-8"))


def migrar_json(p):
    armazenamento.gravar_json(rel(p), json_local(p))


def main():
    tarefas = []

    # contas, perfis, monitoramento, fotos de perfil
    for p in [RAIZ / "contas.json", DADOS / "perfis.json", DADOS / "monitoramento.json"]:
        if p.exists():
            tarefas.append(lambda p=p: migrar_json(p))
    for foto in (DADOS / "avatares").glob("*.jpg"):
        tarefas.append(lambda f=foto: armazenamento.imagem_gravar(rel(f), f.read_bytes()))

    # catálogo + miniaturas
    n_videos = 0
    for csv_ in DOWNLOADS.glob("*/*/_videos.csv"):
        plataforma, conta = csv_.parent.parent.name, csv_.parent.name
        with open(csv_, encoding="utf-8-sig", newline="") as f:
            linhas = list(csv.DictReader(f, delimiter=";"))
        for r in linhas:
            video = next(csv_.parent.glob(f"*_{r['id']}.mp4"), None)
            if not video:
                continue
            n_videos += 1
            linha = {**r, "arquivo": ""}

            def um(plataforma=plataforma, conta=conta, r=linha, video=video):
                armazenamento.dic_gravar(f"meta:{plataforma}/{conta}", r["id"], r)
                thumb = video.parent / ".thumbs" / (video.stem + ".jpg")
                if not thumb.exists():
                    thumb.parent.mkdir(exist_ok=True)
                    rodar_ffmpeg("-ss", "0.8", "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "5", thumb)
                if thumb.exists():
                    armazenamento.imagem_gravar(chave_thumb(plataforma, r["id"]), thumb.read_bytes())
            tarefas.append(um)

    # IA
    ia = DADOS / "ia"
    for p in list(ia.glob("*.json")) + list(ia.glob("videos/*.json")) + list(ia.glob("relatorios/*/*.json")) + list(ia.glob("mercado/*.json")):
        tarefas.append(lambda p=p: migrar_json(p))
    feedback = ia / "feedback.jsonl"
    if feedback.exists() and not armazenamento.lista_ler(rel(feedback)):
        import json
        for linha in feedback.read_text(encoding="utf-8").splitlines():
            if linha.strip():
                armazenamento.lista_adicionar(rel(feedback), json.loads(linha))

    print(f"Migrando {len(tarefas)} itens ({n_videos} vídeos no catálogo)...")
    feitos = 0
    with ThreadPoolExecutor(12) as ex:
        for _ in ex.map(lambda f: f(), tarefas):
            feitos += 1
            if feitos % 200 == 0:
                print(f"  {feitos}/{len(tarefas)}")
    print("Pronto.")


if __name__ == "__main__":
    main()
