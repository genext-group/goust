"""Estilos visuais (referências + guia extraído pela IA) e geração de imagens com GPT Image 2.5.

- Um estilo é um conjunto de imagens de referência (upload ou posts da biblioteca). A IA lê as imagens e
  escreve um guia (paleta, tipografia, composição...). Na geração, o guia vai no prompt e até 4 referências
  vão como imagens de entrada (modelo "sunburst", mais preciso com referências).
- Sem estilo, gera do zero com o modelo "flare" (mais rápido).
- Regra fixa: das referências vem só o ESTILO. Logos, nomes de marca, mascotes e personagens não são copiados.
"""
import base64
import io
import json
import os
import secrets

from pydantic import BaseModel

from .. import armazenamento, catalogo, db
from .. import contexto as ctx
from ..armazenamento import NUVEM
from ..midia import chave_thumb
from . import cliente, memoria

MODELO_LIVRE = os.getenv("IA_MODELO_IMAGEM", "gpt-image-2.5-flare")
MODELO_REFERENCIA = os.getenv("IA_MODELO_IMAGEM_REF", "gpt-image-2.5-sunburst")
MAX_REFS_NA_GERACAO = 4
MAX_REFS_POR_ESTILO = 12

FORMATOS = {  # múltiplos de 16, proporção entre 1:3 e 3:1
    "post": ("1024x1280", "Post do feed 4:5"),
    "quadrado": ("1024x1024", "Quadrado 1:1"),
    "story": ("1088x1920", "Story / capa de Reels 9:16"),
    "paisagem": ("1536x864", "Paisagem 16:9 (thumbnail)"),
}
QUALIDADES = {"rascunho": "low", "padrao": "medium", "alta": "high"}


# ---------------------------------------------------------------- arquivos

def _chave(nome):
    return f"img:{nome}" if NUVEM else f"dados/imagens/{nome}"


def ler_arquivo(nome):
    if not nome or "/" in nome or ".." in nome:
        return None
    return armazenamento.imagem_ler(_chave(nome))


def _normalizar(dados, lado=1024):
    """Qualquer imagem → JPEG RGB com no máximo `lado` px no maior lado."""
    from PIL import Image
    img = Image.open(io.BytesIO(dados))
    img = img.convert("RGB")
    img.thumbnail((lado, lado))
    saida = io.BytesIO()
    img.save(saida, "JPEG", quality=86, optimize=True)
    return saida.getvalue()


def _gravar(dados, ext):
    nome = f"{secrets.token_hex(12)}.{ext}"
    armazenamento.imagem_gravar(_chave(nome), dados)
    return nome


def url(nome):
    return f"/img/{nome}" if nome else None


# ---------------------------------------------------------------- estilos

class Cor(BaseModel):
    hex: str
    uso: str


class GuiaEstilo(BaseModel):
    resumo: str
    paleta: list[Cor]
    tipografia: str
    composicao: str
    fotografia_ou_ilustracao: str
    iluminacao_e_textura: str
    elementos_graficos: list[str]
    clima: str
    regras: list[str]
    evitar: list[str]
    nao_copiar: list[str]  # logos, mascotes, personagens, nomes e slogans das referências (marca de terceiros)
    prompt_base: str


def _estilo(estilo_id):
    r = db.um("select * from estilos where id = %s and usuario_id = %s", estilo_id, ctx.usuario())
    if not r:
        raise ValueError("Estilo não encontrado.")
    return r


def _refs(estilo_id):
    return db.todos("select id, chave, origem, post_id from estilo_refs where estilo_id = %s order by id", estilo_id)


def listar_estilos():
    saida = []
    for e in db.todos("select * from estilos where usuario_id = %s order by id desc", ctx.usuario()):
        refs = _refs(e["id"])
        saida.append({"id": e["id"], "nome": e["nome"], "guia": e["guia"],
                      "refs": [{"id": r["id"], "url": url(r["chave"]), "origem": r["origem"]} for r in refs]})
    return saida


def criar_estilo(nome):
    nome = (nome or "").strip()[:60] or "Meu estilo"
    r = db.um("insert into estilos (usuario_id, nome) values (%s, %s) returning id", ctx.usuario(), nome)
    return r["id"]


def renomear_estilo(estilo_id, nome):
    _estilo(estilo_id)
    db.executar("update estilos set nome = %s where id = %s", nome.strip()[:60], estilo_id)


def apagar_estilo(estilo_id):
    _estilo(estilo_id)
    db.executar("delete from estilos where id = %s", estilo_id)


def _vagas(estilo_id):
    n = db.um("select count(*) as n from estilo_refs where estilo_id = %s", estilo_id)["n"]
    if n >= MAX_REFS_POR_ESTILO:
        raise ValueError(f"Cada estilo aceita até {MAX_REFS_POR_ESTILO} referências.")


def adicionar_upload(estilo_id, dados):
    _estilo(estilo_id)
    _vagas(estilo_id)
    try:
        jpg = _normalizar(dados)
    except Exception:
        raise ValueError("Não consegui ler essa imagem. Use JPG, PNG ou WEBP.")
    nome = _gravar(jpg, "jpg")
    db.executar("insert into estilo_refs (estilo_id, chave, origem) values (%s, %s, 'upload')", estilo_id, nome)
    db.executar("update estilos set guia = null where id = %s", estilo_id)  # o guia precisa ser refeito


def adicionar_post(estilo_id, plataforma, codigo):
    """Usa a imagem do post (primeiro slide em boa resolução, se a API de dados estiver ativa; senão a capa)."""
    _estilo(estilo_id)
    _vagas(estilo_id)
    pid = catalogo.post_id(plataforma, codigo)
    if not pid:
        raise ValueError("Post não encontrado.")
    dados = None
    if plataforma == "instagram":
        from ..fontes import scrapecreators
        if scrapecreators.ativo():
            try:
                from curl_cffi import requests
                urls = scrapecreators.post_instagram(codigo)
                if urls:
                    r = requests.get(urls[0], impersonate="chrome", timeout=30)
                    if r.status_code == 200:
                        dados = r.content
            except Exception:
                dados = None
    dados = dados or armazenamento.imagem_ler(chave_thumb(plataforma, codigo))
    if not dados:
        raise ValueError("Esse post não tem imagem disponível.")
    nome = _gravar(_normalizar(dados), "jpg")
    db.executar("insert into estilo_refs (estilo_id, chave, origem, post_id) values (%s, %s, 'post', %s)",
                estilo_id, nome, pid)
    db.executar("update estilos set guia = null where id = %s", estilo_id)


def remover_ref(estilo_id, ref_id):
    _estilo(estilo_id)
    db.executar("delete from estilo_refs where id = %s and estilo_id = %s", ref_id, estilo_id)
    db.executar("update estilos set guia = null where id = %s", estilo_id)


INSTRUCOES_GUIA = """Você é diretor de arte. Leia as imagens de referência e descreva o ESTILO VISUAL que elas
têm em comum, de forma que um gerador de imagens consiga reproduzi-lo em peças novas.
- 'paleta': 4 a 7 cores em HEX, com o papel de cada uma (fundo, destaque, texto...).
- 'tipografia': família aparente (serifada, grotesca, geométrica, manuscrita), peso, caixa, hierarquia.
- 'composicao': grid, margens, onde fica o título, proporção texto/imagem, respiro.
- 'regras': 5 a 8 regras objetivas ("título ocupa o terço superior", "fundo sempre chapado"...).
- 'evitar': o que quebraria o estilo.
- 'prompt_base': um parágrafo em português descrevendo o estilo para o gerador de imagens.
Descreva SÓ o estilo. Em 'nao_copiar' liste, um por item e de forma reconhecível, tudo o que pertence à marca
das referências: logotipos, nomes, mascotes/personagens (ex.: "dinossauro verde 3D usado como mascote"), selos,
slogans e assinaturas. Esses itens NÃO podem aparecer nas regras, no prompt_base nem na composição: se as referências
usam um personagem, descreva apenas "ilustração 3D cartunesca" como linguagem visual, sem o personagem.
Português do Brasil, concreto."""


def analisar_estilo(estilo_id, progresso=lambda e, f, t: None):
    e = _estilo(estilo_id)
    refs = _refs(estilo_id)
    if len(refs) < 1:
        raise ValueError("Adicione pelo menos uma imagem de referência.")
    progresso("Lendo as referências", 0, 1)
    imagens = [ler_arquivo(r["chave"]) for r in refs[:10]]
    conteudo = [{"role": "user", "content": [
        {"type": "input_text", "text": f"Estilo '{e['nome']}': {len(imagens)} referências."}] + [
        {"type": "input_image", "image_url": "data:image/jpeg;base64," + base64.b64encode(i).decode(), "detail": "low"}
        for i in imagens if i]}]
    guia = cliente.estruturado("relatorio", INSTRUCOES_GUIA, conteudo, GuiaEstilo, esforco="low")
    db.executar("update estilos set guia = %s where id = %s", guia.model_dump(), estilo_id)
    progresso("Concluído", 1, 1)
    return guia.model_dump()


# ---------------------------------------------------------------- geração

def _prompt_final(pedido, guia, marca):
    partes = [pedido.strip()]
    if guia:
        partes.append("ESTILO VISUAL (siga à risca):\n" + guia["prompt_base"]
                      + "\nPaleta: " + ", ".join(f"{c['hex']} ({c['uso']})" for c in guia["paleta"])
                      + "\nTipografia: " + guia["tipografia"] + "\nComposição: " + guia["composicao"]
                      + "\nRegras: " + "; ".join(guia["regras"]) + "\nEvite: " + "; ".join(guia["evitar"]))
        if guia.get("nao_copiar"):
            partes.append("PROIBIDO na imagem (pertence a outra marca): " + "; ".join(guia["nao_copiar"])
                          + ". Se a peça pedir um personagem, crie um ORIGINAL, claramente diferente.")
    if marca.get("nome"):
        partes.append(f"Marca: {marca['nome']}. Se a peça precisar de assinatura ou nome de marca, use '{marca['nome']}'.")
    partes.append("Regras fixas: das imagens de referência use SOMENTE o estilo (cores, tipografia, composição, "
                  "acabamento). NÃO reproduza logotipos, nomes de marca, mascotes, personagens, rostos, selos ou textos das "
                  "referências. Todo texto na imagem em português do Brasil, com acentuação correta e sem erros. "
                  "Texto curto e legível no celular.")
    return "\n\n".join(partes)


def gerar(pedido, estilo_id=None, formato="post", qualidade="padrao", conteudo_id=None,
          progresso=lambda e, f, t: None):
    if not (pedido or "").strip():
        raise ValueError("Descreva a imagem que você quer.")
    tamanho = FORMATOS.get(formato, FORMATOS["post"])[0]
    q = QUALIDADES.get(qualidade, "medium")
    guia, refs = None, []
    if estilo_id:
        e = _estilo(estilo_id)
        if not e["guia"]:
            progresso("Entendendo o estilo das referências", 0, 2)
            e["guia"] = analisar_estilo(estilo_id)
        guia = e["guia"]
        refs = [ler_arquivo(r["chave"]) for r in _refs(estilo_id)[-MAX_REFS_NA_GERACAO:]]
        refs = [r for r in refs if r]
    prompt = _prompt_final(pedido, guia, memoria.marca())
    progresso("Criando a imagem", 1, 2)
    c = cliente.cliente()
    if refs:
        modelo = MODELO_REFERENCIA
        arquivos = [(f"ref{i}.jpg", io.BytesIO(r), "image/jpeg") for i, r in enumerate(refs)]
        r = c.images.edit(model=modelo, image=arquivos, prompt=prompt, size=tamanho, quality=q, output_format="webp")
    else:
        modelo = MODELO_LIVRE
        r = c.images.generate(model=modelo, prompt=prompt, size=tamanho, quality=q, output_format="webp")
    u = getattr(r, "usage", None)
    cliente.registrar_uso(modelo, getattr(u, "input_tokens", 0) or 0, getattr(u, "output_tokens", 0) or 0)
    nome = _gravar(base64.b64decode(r.data[0].b64_json), "webp")
    linha = db.um("""insert into imagens (usuario_id, chave, prompt, estilo_id, conteudo_id, formato, qualidade, modelo)
                     values (%s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                  ctx.usuario(), nome, pedido.strip(), estilo_id, conteudo_id, formato, qualidade, modelo)
    progresso("Concluído", 2, 2)
    return linha["id"]


def listar_imagens(limite=120):
    linhas = db.todos("""select i.*, e.nome as estilo from imagens i left join estilos e on e.id = i.estilo_id
                         where i.usuario_id = %s order by i.id desc limit %s""", ctx.usuario(), limite)
    return [{"id": l["id"], "url": url(l["chave"]), "prompt": l["prompt"], "estilo_id": l["estilo_id"],
             "estilo": l["estilo"], "conteudo_id": l["conteudo_id"], "formato": l["formato"],
             "qualidade": l["qualidade"], "favorita": l["favorita"], "criado": l["criado_em"].isoformat()}
            for l in linhas]


def favoritar_imagem(imagem_id, favorita):
    db.executar("update imagens set favorita = %s where id = %s and usuario_id = %s", bool(favorita), imagem_id, ctx.usuario())


def apagar_imagem(imagem_id):
    db.executar("delete from imagens where id = %s and usuario_id = %s", imagem_id, ctx.usuario())


def imagem_para_referencia(imagem_id, estilo_id):
    """Uma imagem gerada que ficou boa vira referência do estilo (o estilo vai se refinando)."""
    _estilo(estilo_id)
    _vagas(estilo_id)
    l = db.um("select chave from imagens where id = %s and usuario_id = %s", imagem_id, ctx.usuario())
    if not l:
        raise ValueError("Imagem não encontrada.")
    dados = ler_arquivo(l["chave"])
    nome = _gravar(_normalizar(dados), "jpg")
    db.executar("insert into estilo_refs (estilo_id, chave, origem) values (%s, %s, 'gerada')", estilo_id, nome)
    db.executar("update estilos set guia = null where id = %s", estilo_id)


def formatos():
    return [{"id": k, "tamanho": v[0], "nome": v[1]} for k, v in FORMATOS.items()]


def _json(x):
    return json.dumps(x, ensure_ascii=False)
