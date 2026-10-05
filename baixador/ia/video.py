"""Análise de um vídeo: transcrição do áudio + quadros-chave + legenda + métricas → JSON."""
import base64
import tempfile
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from .. import armazenamento, midia
from ..filtros import PASTA_DOWNLOADS
from . import cliente
from .cliente import PREFIXO_IA

VERSAO = 1  # suba quando mudar o schema/prompt para reanalisar


class Gancho(BaseModel):
    tipo: Literal["pergunta", "dor", "promessa_de_resultado", "curiosidade", "polemica", "humor",
                  "identificacao", "prova_social", "tutorial_direto", "noticia", "outro"]
    descricao: str
    frase_ou_texto: str


class AnaliseVideo(BaseModel):
    resumo: str
    gancho: Gancho
    formato: Literal["talking_head", "tutorial_tela", "demonstracao_produto", "depoimento", "esquete_humor",
                     "trend_meme", "bastidores", "storytelling", "lista_dicas", "entrevista_podcast",
                     "anuncio_produzido", "ugc_influenciador", "slides_texto", "outro"]
    pilar: str
    tema: str
    mensagem_central: str
    dores_ou_desejos: list[str]
    promessa: str
    provas_ou_argumentos: list[str]
    cta: str
    tom: str
    publico_aparente: str
    texto_na_tela: list[str]
    elementos_visuais: list[str]
    qualidade_producao: int
    pontos_fortes: list[str]
    pontos_fracos: list[str]
    hipotese_desempenho: str


INSTRUCOES = """Você é um estrategista de conteúdo para vídeos curtos (TikTok/Reels) no mercado brasileiro.
Analise UM vídeo de uma marca concorrente a partir da transcrição, dos quadros-chave (em ordem; os dois
primeiros mostram o gancho dos primeiros segundos), da legenda e das métricas.
Regras:
- Português do Brasil, frases curtas e específicas. Nada genérico ("conteúdo de qualidade", "engajador").
- 'pilar' é um rótulo curto e reutilizável do assunto macro (ex.: "controle de gastos", "prova social",
  "lançamento de produto", "educação financeira"), para agrupar vídeos depois.
- 'qualidade_producao' de 1 (amador) a 5 (produção profissional).
- 'hipotese_desempenho': explique por que o vídeo foi acima ou abaixo da média da conta, usando as métricas
  relativas fornecidas. Se não houver métricas, diga o que provavelmente ajudaria ou atrapalharia.
- Se algo não existir (ex.: sem CTA), escreva "nenhum"."""


def _caminho_cache(plataforma, vid):
    return f"{PREFIXO_IA}videos/{plataforma}_{vid}.json"


def obter(plataforma, vid):
    return armazenamento.ler_json(_caminho_cache(plataforma, vid))


def _quadros(video, duracao, pasta):
    """Dois quadros do gancho e quatro ao longo do vídeo, em JPEG pequeno."""
    marcas = [0.5, 2.0] + [duracao * f for f in (0.3, 0.5, 0.7, 0.9)] if duracao > 4 else [0.3, duracao / 2 or 1]
    saida = []
    for i, t in enumerate(marcas):
        destino = Path(pasta) / f"q{i}.jpg"
        midia.rodar_ffmpeg("-ss", f"{max(0, t):.2f}", "-i", video, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "5", destino)
        if destino.exists():
            saida.append(base64.b64encode(destino.read_bytes()).decode())
    return saida


def _transcricao(video, duracao, pasta):
    audio = Path(pasta) / "audio.mp3"
    midia.rodar_ffmpeg("-i", video, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-t", "900", audio)
    if not audio.exists() or audio.stat().st_size < 2000:
        return ""
    try:
        return cliente.transcrever(audio, duracao)
    except Exception:
        return ""


def analisar(v, metricas_conta=None, forcar=False):
    """v: item da biblioteca (dict de biblioteca.videos()). Devolve a análise (com cache)."""
    existente = obter(v["plataforma"], v["id"])
    if existente and not forcar and existente.get("versao") == VERSAO:
        return existente

    # local: o arquivo baixado; nuvem: baixa só para analisar e apaga em seguida
    local = PASTA_DOWNLOADS / v["plataforma"] / v["conta"] / v["arquivo"] if v.get("arquivo") else None
    video = local if local and local.exists() else midia.baixar_temporario(v["url"], v["plataforma"])
    try:
        with tempfile.TemporaryDirectory(dir=midia.PASTA_TEMP if midia.NUVEM else None) as tmp:
            duracao = midia.duracao(video)
            transcricao = (existente or {}).get("transcricao") or _transcricao(video, duracao, tmp)
            quadros = _quadros(video, duracao, tmp)
    finally:
        if video != local:
            Path(video).unlink(missing_ok=True)

    rel = ""
    if metricas_conta and v.get("views") and metricas_conta.get("mediana_views"):
        rel = f"\nViews = {v['views'] / metricas_conta['mediana_views']:.1f}x a mediana da conta."
    if metricas_conta and v.get("engajamento") is not None and metricas_conta.get("mediana_engajamento"):
        rel += f" Engajamento = {v['engajamento']:.2f}% (mediana da conta {metricas_conta['mediana_engajamento']:.2f}%)."
    texto = (
        f"Conta: @{v['conta']} ({v['plataforma']}) · publicado em {v['data'] or 'data desconhecida'} · "
        f"duração {round(duracao)}s\nViews: {v.get('views')} · curtidas: {v.get('likes')} · comentários: {v.get('comentarios')}{rel}\n\n"
        f"Legenda:\n{(v.get('legenda') or '(sem legenda)')[:2000]}\n\n"
        f"Transcrição do áudio:\n{(transcricao or '(sem fala detectada)')[:6000]}"
    )
    conteudo = [{"role": "user", "content": [{"type": "input_text", "text": texto}] + [
        {"type": "input_image", "image_url": f"data:image/jpeg;base64,{q}", "detail": "low"} for q in quadros]}]
    analise = cliente.estruturado("video", INSTRUCOES, conteudo, AnaliseVideo, esforco="low")

    resultado = {
        "versao": VERSAO,
        "plataforma": v["plataforma"],
        "conta": v["conta"],
        "id": v["id"],
        "duracao": round(duracao),
        "transcricao": transcricao,
        **analise.model_dump(),
    }
    armazenamento.gravar_json(_caminho_cache(v["plataforma"], v["id"]), resultado)
    return resultado
