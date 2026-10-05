"""ffmpeg embutido, capas/miniaturas e download temporário de vídeos (modo nuvem)."""
import re
import shutil
import subprocess
import uuid

from curl_cffi import requests

from . import armazenamento
from .armazenamento import NUVEM, PASTA_TEMP

SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _ffmpeg():
    """ffmpeg do sistema no modo local; o binário do imageio-ffmpeg na nuvem (não há ffmpeg lá)."""
    if shutil.which("ffmpeg"):
        return shutil.which("ffmpeg")
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


FFMPEG = _ffmpeg()


def rodar_ffmpeg(*args):
    return subprocess.run([FFMPEG, "-y", "-loglevel", "error", *map(str, args)],
                          capture_output=True, creationflags=SEM_JANELA)


def duracao(video):
    """Duração em segundos (sem depender do ffprobe, que o imageio-ffmpeg não traz)."""
    r = subprocess.run([FFMPEG, "-i", str(video)], capture_output=True, text=True, creationflags=SEM_JANELA)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0


def chave_thumb(plataforma, vid):
    return f"thumb:{plataforma}/{vid}"


def salvar_capa(plataforma, item):
    """Modo nuvem: guarda a capa do vídeo como miniatura (o vídeo em si não é armazenado)."""
    chave = chave_thumb(plataforma, item["id"])
    if armazenamento.imagem_existe(chave):
        return "pulado"
    url = item.get("capa") or item.get("_info", {}).get("thumbnail")
    if url:
        try:
            r = requests.get(url, impersonate="chrome", timeout=30)
            if r.status_code == 200 and len(r.content) < 900_000:
                armazenamento.imagem_gravar(chave, r.content)
        except Exception:
            pass  # sem capa o vídeo ainda entra no catálogo
    item.pop("_info", None)
    return "baixado"


def baixar_temporario(url, plataforma):
    """Baixa um vídeo para um arquivo temporário (a IA analisa e depois ele é apagado)."""
    from yt_dlp import YoutubeDL
    from yt_dlp.networking.impersonate import ImpersonateTarget

    pasta = PASTA_TEMP / "ia"
    pasta.mkdir(parents=True, exist_ok=True)
    base = pasta / uuid.uuid4().hex
    opts = {"quiet": True, "no_warnings": True, "noprogress": True, "outtmpl": str(base) + ".%(ext)s",
            "format": "b[ext=mp4]/b", "ffmpeg_location": FFMPEG, "retries": 3}
    if plataforma == "tiktok":
        opts["impersonate"] = ImpersonateTarget.from_str("chrome")
    with YoutubeDL(opts) as ydl:
        ydl.download([url])
    feitos = list(pasta.glob(base.name + ".*"))
    if not feitos:
        raise RuntimeError("Não foi possível baixar o vídeo.")
    return feitos[0]


def link_direto(url, plataforma):
    """URL do arquivo de vídeo na CDN da plataforma + cabeçalhos necessários (botão Baixar online)."""
    from yt_dlp import YoutubeDL
    from yt_dlp.networking.impersonate import ImpersonateTarget

    opts = {"quiet": True, "no_warnings": True, "format": "b[ext=mp4]/b"}
    if plataforma == "tiktok":
        opts["impersonate"] = ImpersonateTarget.from_str("chrome")
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        cookies = ydl.cookiejar.get_cookie_header(info["url"])
    cab = dict(info.get("http_headers") or {})
    if cookies:
        cab["Cookie"] = cookies
    return info["url"], cab


__all__ = ["FFMPEG", "NUVEM", "duracao", "rodar_ffmpeg", "salvar_capa", "baixar_temporario", "link_direto", "chave_thumb"]
