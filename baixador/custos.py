"""Custo real de cada chamada (OpenAI e API de dados), por usuário, dia, operação e modelo.

Toda chamada passa por registrar(); a operação vem do contexto (contexto.operacao(...)), então dá para ver
quanto custa uma análise de perfil, a rotina diária, um roteiro etc. Os preços ficam aqui, num lugar só.
"""
import os
import time

from . import contexto, db

# US$ por 1M tokens (entrada, saída) — tabela oficial OpenAI (out/2026). Ajuste aqui quando mudar.
PRECOS = {
    "gpt-5.5": (5.00, 30.00),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4-nano": (0.20, 1.25),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6-sol": (2.00, 10.00),
    "gpt-6-luna": (0.10, 0.50),
    "gpt-6-astra": (10.00, 50.00),
    "gpt-image-2.5-flare": (5.00, 30.00),      # entrada só texto (sem referência)
    "gpt-image-2.5-sunburst": (8.00, 30.00),   # entrada com imagens de referência
}
TRANSCRICAO_POR_MIN = {"gpt-4o-mini-transcribe": 0.003, "gpt-transcribe": 0.0045, "gpt-4o-transcribe": 0.006}
BUSCA_WEB = 0.010  # US$ por chamada da ferramenta de busca
# API de dados: pacote de US$ 47 por 25 mil créditos (com o cupom de 30%, US$ 32,90)
CREDITO_DADOS = float(os.getenv("CUSTO_CREDITO_DADOS_USD", str(32.90 / 25000)))


def calcular(modelo, entrada=0, saida=0, segundos_audio=0, buscas=0, creditos=0):
    entrada, saida, segundos_audio = float(entrada or 0), float(saida or 0), float(segundos_audio or 0)
    usd = 0.0
    if modelo in TRANSCRICAO_POR_MIN:
        usd += segundos_audio / 60 * TRANSCRICAO_POR_MIN[modelo]
    else:
        base, lote = (modelo[:-5], 0.5) if modelo.endswith(":lote") else (modelo, 1.0)  # Batch API: metade do preço
        if base in PRECOS:
            pe, ps = PRECOS[base]
            usd += (entrada / 1e6 * pe + saida / 1e6 * ps) * lote
    return usd + buscas * BUSCA_WEB + creditos * CREDITO_DADOS


def registrar(modelo, entrada=0, saida=0, segundos_audio=0, buscas=0, creditos=0):
    """Soma no dia/operação do usuário atual. Sem usuário no contexto (ex.: cron sem usuário), não registra."""
    try:
        usuario = contexto.usuario()
    except RuntimeError:
        return 0.0
    usd = calcular(modelo, entrada, saida, segundos_audio, buscas, creditos)
    try:
        db.executar("""insert into custos (usuario_id, dia, operacao, modelo, chamadas, entrada, saida, segundos_audio, buscas, creditos, usd)
                       values (%s, current_date, %s, %s, 1, %s, %s, %s, %s, %s, %s)
                       on conflict (usuario_id, dia, operacao, modelo) do update set
                         chamadas = custos.chamadas + 1, entrada = custos.entrada + excluded.entrada,
                         saida = custos.saida + excluded.saida, segundos_audio = custos.segundos_audio + excluded.segundos_audio,
                         buscas = custos.buscas + excluded.buscas, creditos = custos.creditos + excluded.creditos,
                         usd = custos.usd + excluded.usd""",
                    usuario, contexto.operacao(), modelo, int(entrada or 0), int(saida or 0), int(segundos_audio or 0),
                    int(buscas or 0), int(creditos or 0), round(usd, 6))
    except Exception:
        pass  # registro de custo nunca derruba a operação
    return usd


def do_mes(usuario_id=None):
    """Gasto do mês (US$) do usuário atual, por operação."""
    linhas = db.todos("""select operacao, sum(usd) as usd, sum(chamadas) as chamadas from custos
                         where usuario_id = %s and dia >= date_trunc('month', current_date)
                         group by operacao order by 2 desc""", usuario_id or contexto.usuario())
    return {l["operacao"]: {"usd": float(l["usd"]), "chamadas": int(l["chamadas"])} for l in linhas}


def resumo_geral(dias=30):
    """Para o dono: custo por usuário e por operação nos últimos dias."""
    por_usuario = db.todos("""select u.email, c.usuario_id, sum(c.usd) as usd from custos c join usuarios u on u.id = c.usuario_id
                              where c.dia > current_date - %s group by 1, 2 order by 3 desc""", dias)
    por_operacao = db.todos("""select operacao, sum(usd) as usd, sum(chamadas) as chamadas, count(distinct usuario_id) as usuarios
                               from custos where dia > current_date - %s group by 1 order by 2 desc""", dias)
    return {"dias": dias, "gerado": time.time(),
            "por_usuario": [{**l, "usd": float(l["usd"])} for l in por_usuario],
            "por_operacao": [{**l, "usd": float(l["usd"])} for l in por_operacao]}
