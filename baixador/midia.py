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
    # na nuvem é chave do Redis; no modo local vira caminho de arquivo (":" não vale no Windows)
    return f"thumb:{plataforma}/{vid}" if NUVEM else f"dados/thumbs/{plataforma}/{vid}.jpg"


def salvar_capa(plataforma, item):
    """Modo nuvem: guarda a capa do vídeo como miniatura (o vídeo em si não é armazenado)."""
    chave = chave_thumb(plataforma, item["id"])
    if armazenamento.imagem_existe(chave):
        return "pulado"
    url = item.get("capa") or item.get("_info", {}).get("thumbnail")
    if url:
        gravar_capa_de_url(chave, url)   # sem capa o post ainda entra no catálogo (e a capa é recuperada depois)
    item.pop("_info", None)
    return "baixado"


def capa_leve(dados):
    """Normaliza a capa: JPEG de até 720 px no lado maior (carrosséis em alta resolução passavam de 1 MB e eram
    descartados; WEBP/PNG viram JPEG). Devolve None se não for uma imagem que o Pillow abra."""
    from io import BytesIO
    from PIL import Image
    try:
        im = Image.open(BytesIO(dados))
        im = im.convert("RGB")
        im.thumbnail((720, 720))
        saida = BytesIO()
        im.save(saida, "JPEG", quality=82, optimize=True)
        return saida.getvalue()
    except Exception:
        return None


def gravar_capa_de_url(chave, url):
    try:
        r = requests.get(url, impersonate="chrome", timeout=30)
        if r.status_code == 200:
            leve = capa_leve(r.content)
            if leve:
                armazenamento.imagem_gravar(chave, leve)
                return leve
    except Exception:
        pass
    return None


def recuperar_capa(plataforma, vid, url_post):
    """Capa que faltou na coleta: Instagram pela API de dados (1 crédito), TikTok pelo yt-dlp (grátis)."""
    chave = chave_thumb(plataforma, vid)
    try:
        if plataforma == "instagram":
            from .fontes import scrapecreators
            imagens = scrapecreators.post_instagram(vid) if scrapecreators.ativo() else []
            return gravar_capa_de_url(chave, imagens[0]) if imagens else None
        from yt_dlp import YoutubeDL
        from yt_dlp.networking.impersonate import ImpersonateTarget
        with YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True,
                        "impersonate": ImpersonateTarget.from_str("chrome")}) as ydl:
            info = ydl.extract_info(url_post, download=False)
        return gravar_capa_de_url(chave, info.get("thumbnail")) if info.get("thumbnail") else None
    except Exception:
        return None


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


__all__ = ["FFMPEG", "NUVEM", "duracao", "rodar_ffmpeg", "salvar_capa", "baixar_temporario", "link_direto", "chave_thumb",
           "capa_leve", "gravar_capa_de_url", "recuperar_capa"]
