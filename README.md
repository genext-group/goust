# Referências — baixador de TikTok e Reels

App local para baixar e estudar vídeos de contas do TikTok e do Instagram.
Interface em React + [HeroUI v3](https://heroui.com) e backend em Python (Flask + yt-dlp).

## Como usar

1. Dê dois cliques em `iniciar.bat`. Ele instala as dependências, compila a interface na
   primeira vez e abre http://127.0.0.1:5000.
2. **Contas**: cole um `@`, o link de um perfil ou o link de um vídeo. Link de vídeo baixa na hora;
   perfil vira um cartão. Selecione os cartões e clique em **Baixar…**.
3. **Biblioteca**: veja tudo o que já foi baixado, com busca na legenda, filtro por conta,
   ordenação por views, curtidas ou engajamento, e o player embutido.
4. **Downloads**: fila com progresso. TikTok e Instagram rodam em paralelo.

### Filtros de download
Mais recentes (N) · Mais vistos (N) · Só os novos (desde o último download) · Mais antigos (N) ·
Por período (de/até) · Tudo. Opcional: mínimo de visualizações e, no Instagram, só Reels.

## Inteligência (IA)

A aba **Inteligência** transforma os vídeos baixados em análise estratégica (OpenAI; chave em `.env`):

- **Por vídeo** (em cache): transcrição da fala, 6 quadros (2 do gancho), legenda e métricas relativas à
  conta → gancho, formato, pilar, mensagem, dores, promessa, provas, CTA, tom e hipótese de desempenho.
  Também dá para analisar um vídeo avulso no player da Biblioteca.
- **Por perfil**: posicionamento, o que a marca diz, pilares e formatos (com desempenho), ganchos, o que
  performa e o que não, pontos fortes e fracos, **oportunidades para você**, ideias de conteúdo com roteiro
  e notas. Cada afirmação mostra os vídeos que a sustentam. O histórico de versões mostra o que mudou.
- **Mercado**: comparativo entre os concorrentes, narrativas saturadas, espaços em branco e benchmarks.
- **Pergunte à IA**: chat sobre um perfil ou sobre o mercado inteiro.
- **Aprendizado**: avalie qualquer insight com 👍/👎 (e um porquê opcional). A cada 5 feedbacks a IA
  destila regras ("O que a IA aprendeu"), que você pode editar, e elas entram em todas as análises, junto
  com exemplos do que você aprovou ou reprovou e o perfil de **Minha marca**.
- **Monitoramento automático**: a cada N horas baixa o que é novo e reanalisa quem publicou.

Modelos (trocáveis no `.env`): `IA_MODELO_RELATORIO=gpt-5.5`, `IA_MODELO_VIDEO=gpt-5.4-mini`,
`IA_MODELO_TRANSCRICAO=gpt-4o-mini-transcribe`. O consumo aparece em *Minha marca e aprendizados*.

## Instagram sem login

O padrão é **sem login**:

1. A página pública `/<conta>/reels/` traz os 12 Reels mais recentes, com views. Sem sessão, o
   Instagram bloqueia a paginação.
2. **Descoberta ampliada**: buscadores (Yahoo e DuckDuckGo) indexam URLs `instagram.com/<conta>/reel/<código>`,
   e a página pública de cada Reel lista outros posts do perfil. Cada código é datado sem nenhuma requisição
   (o código é o id da mídia, que guarda o horário de criação) e depois validado com o yt-dlp, que confirma o
   dono e traz curtidas, comentários e legenda. Na prática, isso rende de 3 a 4 vezes mais Reels que os 12.
   Os Reels descobertos assim vêm sem número de views.

Para o histórico completo, com views de tudo, conecte uma conta pelo indicador do Instagram no topo,
de preferência secundária. É opcional.

## Onde ficam os arquivos

```
downloads/<plataforma>/<conta>/AAAA-MM-DD_<id>.mp4
downloads/<plataforma>/<conta>/_videos.csv   ← data, link, views, likes, comentários, legenda (Excel)
downloads/<plataforma>/<conta>/.thumbs/      ← capas geradas para a biblioteca
dados/                                       ← perfis, fotos, histórico e sessão opcional do Instagram
```

Vídeos já baixados são pulados, e a planilha é gravada a cada vídeo.

## Desenvolvimento

```
python app.py                 # backend na porta 5000
cd web && npm run dev         # interface com hot reload (proxy para o Flask)
cd web && npm run build       # gera web/dist, servido pelo Flask
```

Se o TikTok ou o Instagram mudarem algo e parar de funcionar, atualize o yt-dlp:
`python -m pip install -U yt-dlp`.
