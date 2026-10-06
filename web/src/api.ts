export type Plataforma = 'tiktok' | 'instagram'

export interface Perfil {
  nome: string | null
  foto: string | null
  seguidores: number | null
}

export interface Conta {
  papel?: 'proprio' | 'concorrente' | 'referencia'
  nome: string
  plataforma: Plataforma
  conta: string
  perfil?: Perfil | null
  videos: number
  views: number
  ultimo: string
}

export type Modo = 'recentes' | 'antigos' | 'mais_vistos' | 'periodo' | 'novos' | 'todos' | 'link'

export interface Opcoes {
  modo: Modo
  quantidade?: number
  data_inicio?: string | null
  data_fim?: string | null
  min_views?: number
  somente_reels?: boolean
  analisar_ao_fim?: boolean
  link?: string
}

export interface Tarefa {
  id: number
  plataforma: Plataforma
  conta: string
  opcoes: Opcoes
  status: 'na fila' | 'listando' | 'baixando' | 'comentários' | 'concluído' | 'erro' | 'cancelado'
  comentarios?: number
  total: number
  baixados: number
  pulados: number
  erros: number
  logs: string[]
  criada: number
  fim: number | null
}

export interface Video {
  plataforma: Plataforma
  conta: string
  id: string
  arquivo: string
  data: string
  url: string
  views: number | null
  likes: number | null
  comentarios: number | null
  engajamento: number | null
  duracao: number | null
  legenda: string
  tamanho: number
  url_thumb: string
  url_video: string | null
  tipo?: 'reel' | 'video' | 'carrossel' | 'foto'
}

export interface Comentario { texto: string; likes: number | null; respostas: number | null; publicado_em: string | null }

export interface StatusInstagram {
  nuvem?: boolean
  usuario: string | null
  rodando: boolean
  status: string
}

/** Na versão online, cada chamada leva o token de sessão do Clerk (definido pelo App ao logar). */
let obterToken: (() => Promise<string | null>) | null = null
export const definirObtencaoToken = (f: (() => Promise<string | null>) | null) => { obterToken = f }

async function req<T>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = obterToken ? await obterToken() : null
  const r = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 && !url.startsWith('/api/login')) window.dispatchEvent(new Event('precisa-login'))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j as T
}

export interface Ambiente { nuvem: boolean; clerk: string | null }

export const api = {
  ambiente: () => req<Ambiente>('/api/ambiente'),
  contas: () => req<Conta[]>('/api/contas'),
  adicionarConta: (conta: string, plataforma?: Plataforma, papel: 'proprio' | 'concorrente' = 'concorrente') =>
    req<Conta[]>('/api/contas', { body: { conta, plataforma, papel } }),
  papelConta: (c: Pick<Conta, 'plataforma' | 'conta'>, papel: 'proprio' | 'concorrente' | 'referencia') =>
    req<Conta[]>(`/api/contas/${c.plataforma}/${encodeURIComponent(c.conta)}/papel`, { method: 'PUT', body: { papel } }),
  removerConta: (c: Pick<Conta, 'plataforma' | 'conta'>) =>
    req<Conta[]>(`/api/contas/${c.plataforma}/${encodeURIComponent(c.conta)}`, { method: 'DELETE' }),
  baixar: (contas: Pick<Conta, 'plataforma' | 'conta'>[], opcoes: Opcoes) =>
    req<{ criadas: number[] }>('/api/baixar', { body: { contas, opcoes } }),
  baixarLink: (url: string) => req<{ criadas: number[] }>('/api/baixar-link', { body: { url } }),
  tarefas: () => req<Tarefa[]>('/api/tarefas'),
  cancelar: (id: number) => req(`/api/tarefas/${id}/cancelar`, { method: 'POST' }),
  limpar: () => req('/api/tarefas/limpar', { method: 'POST' }),
  biblioteca: () => req<Video[]>('/api/biblioteca'),
  comentarios: (p: Plataforma, id: string) => req<Comentario[]>(`/api/comentarios/${p}/${encodeURIComponent(id)}`),
  abrirPasta: (alvo: { plataforma?: string; conta?: string; arquivo?: string } = {}) =>
    req('/api/abrir-pasta', { body: alvo }),
  instagram: () => req<StatusInstagram>('/api/instagram'),
  conectarInstagram: () => req('/api/instagram/conectar', { method: 'POST' }),
  desconectarInstagram: () => req('/api/instagram/desconectar', { method: 'POST' }),
}

export const urlThumb = (v: Video) => v.url_thumb
/** Download do vídeo: o token vai na URL porque a navegação do navegador não leva o cabeçalho. */
export async function baixarArquivo(v: Video) {
  const token = obterToken ? await obterToken() : null
  const url = `/api/arquivo/${v.plataforma}/${encodeURIComponent(v.conta)}/${encodeURIComponent(v.id)}`
  window.location.href = token ? `${url}?t=${encodeURIComponent(token)}` : url
}
/** Player oficial da plataforma, usado quando o vídeo não está guardado (versão online). */
export const urlEmbed = (v: Video) =>
  v.plataforma === 'tiktok'
    ? `https://www.tiktok.com/player/v1/${v.id}?autoplay=1&rel=0&description=0&music_info=0`
    : `https://www.instagram.com/p/${v.id}/embed/`

/** Interpreta o que o usuário colou: vídeo avulso, perfil ou @. */
export function interpretarEntrada(texto: string): { tipo: 'video' | 'perfil' | 'arroba'; plataforma?: Plataforma } {
  const t = texto.trim()
  if (/tiktok\.com\/.+\/video\/|vm\.tiktok\.com|vt\.tiktok\.com/.test(t)) return { tipo: 'video', plataforma: 'tiktok' }
  if (/instagram\.com\/(reel|reels|p)\//.test(t)) return { tipo: 'video', plataforma: 'instagram' }
  if (/tiktok\.com\/@/.test(t)) return { tipo: 'perfil', plataforma: 'tiktok' }
  if (/instagram\.com\//.test(t)) return { tipo: 'perfil', plataforma: 'instagram' }
  return { tipo: 'arroba' }
}

// ---------------------------------------------------------------- inteligência (IA)

export type Desempenho = 'acima' | 'na_media' | 'abaixo' | 'sem_dados'
export interface Item { texto: string; videos: string[] }
export interface Oportunidade { titulo: string; descricao: string; acao_concreta: string; prioridade: 'alta' | 'media' | 'baixa'; videos: string[] }
export interface Ideia { titulo: string; gancho: string; formato: string; roteiro: string[]; inspirado_em: string[] }

export interface Relatorio {
  resumo_executivo: string
  perfil_e_bio?: Item[]
  cadencia?: { resumo: string; melhores_dias: string[]; melhores_horarios: string[]; frequencia_recomendada: string }
  voz_do_publico?: { sentimento_geral: string; duvidas: Item[]; objecoes: Item[]; pedidos: Item[]; elogios: Item[] }
  posicionamento: { proposta_de_valor: string; publico_alvo: string; categoria_percebida: string; diferenciais: string[]; tom_de_voz: string; arquetipo: string }
  mensagens_centrais: Item[]
  dores_e_desejos: Item[]
  provas_e_argumentos: Item[]
  ctas: Item[]
  pilares: { nome: string; descricao: string; participacao_pct: number; desempenho: Desempenho; videos: string[] }[]
  formatos: { formato: string; participacao_pct: number; desempenho: Desempenho; observacao: string }[]
  ganchos: { padrao: string; exemplo: string; por_que_funciona: string; videos: string[] }[]
  o_que_performa: Item[]
  o_que_nao_performa: Item[]
  pontos_fortes: Item[]
  pontos_fracos: Item[]
  oportunidades_para_voce: Oportunidade[]
  ideias_de_conteudo: Ideia[]
  mudancas_desde_ultima_analise: Item[]
  notas: { consistencia: number; ganchos: number; clareza_da_mensagem: number; producao: number; engajamento: number; justificativa: string }
}

export interface Metricas {
  videos: number
  periodo: string | null
  posts_por_semana: number | null
  mediana_views: number | null
  media_views: number | null
  mediana_likes: number | null
  mediana_engajamento: number | null
  duracao_mediana_s: number | null
}

export interface RegistroRelatorio {
  versao: string
  gerado: string
  plataforma: Plataforma
  conta: string
  metricas: Metricas
  videos_analisados: string[]
  relatorio: Relatorio
}

export interface Panorama {
  resumo_do_mercado: string
  concorrentes: { perfil: string; posicionamento_curto: string; publico: string; tom: string; forca_principal: string; fraqueza_principal: string; nivel_de_ameaca: 'alto' | 'medio' | 'baixo' }[]
  narrativas_dominantes: Item[]
  temas_saturados: Item[]
  espacos_em_branco: Oportunidade[]
  tendencias: Item[]
  benchmarks: { metrica: string; lider: string; valor: string; comentario: string }[]
  recomendacoes_para_voce: Oportunidade[]
  ideias_de_conteudo: Ideia[]
}

export interface RegistroPanorama { versao: string; gerado: string; perfis: string[]; panorama: Panorama }

export interface AnaliseVideo {
  resumo: string
  gancho: { tipo: string; descricao: string; frase_ou_texto: string }
  formato: string
  pilar: string
  tema: string
  mensagem_central: string
  dores_ou_desejos: string[]
  promessa: string
  provas_ou_argumentos: string[]
  cta: string
  tom: string
  publico_aparente: string
  texto_na_tela: string[]
  qualidade_producao: number
  pontos_fortes: string[]
  pontos_fracos: string[]
  hipotese_desempenho: string
  transcricao: string
}

export interface TarefaIA {
  id: number
  tipo: 'perfil' | 'mercado' | 'estrategia' | 'imagem' | 'estilo' | 'calendario' | 'roteiro' | 'inteligencia'
  params?: Record<string, unknown>
  resultado?: Record<string, unknown> | null
  plataforma: Plataforma | null
  conta: string | null
  status: 'na fila' | 'rodando' | 'concluído' | 'erro'
  etapa: string
  feito: number
  total: number
  erro: string | null
  criada?: number
  fim?: number | null
}

export interface Regra { id?: string; texto: string; origem: 'manual' | 'feedback' }
export interface Aprendizados { versao: number; regras: Regra[]; feedbacks_processados: number; atualizado: number | null; ultima_mudanca?: string }
export type Marca = Record<string, string>
export interface Monitoramento { ativo: boolean; intervalo_horas: number; reanalisar: boolean; ultima_execucao: number | null; proxima: number | null }

export interface StatusIA {
  configurada: boolean
  modelos: Record<string, string>
  uso: Record<string, { chamadas: number; entrada: number; saida: number; segundos_audio: number } | number>
  aprendizados: Aprendizados
  feedbacks: number
  monitoramento: Monitoramento
}

export interface ResumoRelatorio { versao: string; gerado: string; notas: Relatorio['notas']; resumo: string; metricas: Metricas }

export interface Feedback { alvo: string; ref: string; secao: string; item: string; voto: 1 | -1; comentario?: string }

export const ia = {
  status: () => req<StatusIA>('/api/ia/status'),
  relatorios: () => req<Record<string, ResumoRelatorio>>('/api/ia/relatorios'),
  relatorio: (p: Plataforma, c: string, versao?: string) =>
    req<{ relatorio: RegistroRelatorio | null; versoes: string[] }>(`/api/ia/relatorio/${p}/${encodeURIComponent(c)}${versao ? `?versao=${versao}` : ''}`),
  mercado: (versao?: string) => req<{ panorama: RegistroPanorama | null; versoes: string[] }>(`/api/ia/mercado${versao ? `?versao=${versao}` : ''}`),
  analisar: (alvo: { tipo: 'perfil'; plataforma: Plataforma; conta: string } | { tipo: 'mercado' | 'estrategia' }) => req<TarefaIA>('/api/ia/analisar', { body: alvo }),
  estrategia: (versao?: string) =>
    req<{ estrategia: RegistroEstrategia | null; versoes: string[]; proprias: number; concorrentes: number }>(`/api/ia/estrategia${versao ? `?versao=${versao}` : ''}`),
  rascunharBrief: (site?: string) => req<Marca>('/api/ia/brief/rascunho', { body: { site } }),
  tarefas: () => req<TarefaIA[]>('/api/ia/tarefas'),
  video: (p: Plataforma, id: string) => req<AnaliseVideo | null>(`/api/ia/video/${p}/${encodeURIComponent(id)}`),
  analisarVideo: (p: Plataforma, id: string) => req<AnaliseVideo>(`/api/ia/video/${p}/${encodeURIComponent(id)}`, { method: 'POST' }),
  feedback: (f: Feedback) => req('/api/ia/feedback', { body: f }),
  votos: (ref: string) => req<Record<string, number>>(`/api/ia/votos/${ref}`),
  marca: () => req<Marca>('/api/ia/marca'),
  salvarMarca: (m: Marca) => req<Marca>('/api/ia/marca', { method: 'PUT', body: m }),
  salvarRegras: (regras: Regra[]) => req<Aprendizados>('/api/ia/aprendizados', { method: 'PUT', body: { regras } }),
  destilar: () => req<Aprendizados>('/api/ia/aprendizados/destilar', { method: 'POST' }),
  chat: (escopo: { tipo: 'perfil'; plataforma: Plataforma; conta: string } | { tipo: 'mercado' }, mensagens: { papel: 'usuario' | 'ia'; texto: string }[]) =>
    req<{ resposta: string }>('/api/ia/chat', { body: { escopo, mensagens } }),
  salvarMonitoramento: (m: Partial<Monitoramento>) => req<Monitoramento>('/api/ia/monitoramento', { method: 'PUT', body: m }),
  monitorarAgora: () => req('/api/ia/monitoramento/agora', { method: 'POST' }),
}

export interface Estrategia {
  resumo: string
  benchmark: { metrica: string; voce: string; media_concorrentes: string; melhor: string; leitura: string }[]
  onde_voce_esta_atras: Item[]
  onde_voce_ganha: Item[]
  o_que_adaptar_dos_concorrentes: Oportunidade[]
  espacos_livres: Oportunidade[]
  posicionamento_recomendado: { frase: string; para_quem: string; contra_quem: string; por_que_voce: string }
  pilares: { nome: string; objetivo: string; participacao_pct: number; formatos: string[]; temas: string[] }[]
  mix_de_formatos: { formato: string; por_semana: number; por_que: string }[]
  tom_de_voz: string
  frequencia: string
  metas: { metrica: string; atual: string; meta_90_dias: string; como: string }[]
  prioridades_90_dias: Oportunidade[]
  primeiras_ideias: Ideia[]
  nivel_de_confianca: 'alto' | 'medio' | 'baixo'
  o_que_falta_para_melhorar: string[]
}

export interface RegistroEstrategia {
  versao: string
  gerado: string
  perfis_proprios: string[]
  concorrentes: string[]
  estrategia: Estrategia
}

// ---------------------------------------------------------------- pastas, criação e primeira configuração

export interface Pasta { id: number; nome: string; sistema: string | null; cor: string | null; posts: number }
export interface Cor { hex: string; uso: string }
export interface GuiaEstilo {
  resumo: string; paleta: Cor[]; tipografia: string; composicao: string; fotografia_ou_ilustracao: string
  iluminacao_e_textura: string; elementos_graficos: string[]; clima: string; regras: string[]; evitar: string[]; nao_copiar?: string[]; prompt_base: string
}
export interface Estilo { id: number; nome: string; guia: GuiaEstilo | null; refs: { id: number; url: string; origem: string }[] }
export interface FormatoImagem { id: string; tamanho: string; nome: string }
export interface Imagem {
  id: number; url: string; prompt: string; estilo_id: number | null; estilo: string | null; conteudo_id: number | null
  formato: string; qualidade: string; favorita: boolean; criado: string
}
export type StatusConteudo = 'ideia' | 'roteiro' | 'produzindo' | 'pronto' | 'publicado'
export interface Roteiro {
  ganchos: { texto: string; estilo: string }[]; duracao_segundos: number
  cenas: { tempo: string; fala: string; visual: string; texto_na_tela: string }[]
  slides: { titulo: string; texto: string; visual: string }[]
  legenda: string; hashtags: string[]; cta: string; dicas_de_gravacao: string[]; por_que_vai_funcionar: string
  prompt_da_capa: string; referencias: string[]; gerado: string
}
export interface Conteudo {
  id: number; titulo: string; formato: string | null; pilar: string | null; data: string | null; status: StatusConteudo
  dados: { gancho?: string; ideia?: string; objetivo?: string; cta?: string; inspirado_em?: string[]; notas?: string }
  roteiro: Roteiro | null; atualizado: string
}
export interface IdeiaGerada {
  titulo: string; formato: 'reel' | 'carrossel' | 'foto' | 'story'; pilar: string
  objetivo: 'alcance' | 'engajamento' | 'conversao' | 'autoridade' | 'relacionamento'
  gancho: string; ideia: string; cta: string; por_que: string; inspirado_em: string[]
}
export interface Sugestao { plataforma: Plataforma; conta: string; nome: string; por_que: string }
export interface Eu { id: string; email: string | null; nome: string | null; onboarding: boolean; piloto: { estrategia?: boolean; calendario?: boolean } }

async function enviarArquivos<T>(url: string, arquivos: File[]): Promise<T> {
  const token = obterToken ? await obterToken() : null
  const form = new FormData()
  arquivos.forEach((a) => form.append('arquivo', a))
  const r = await fetch(url, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
  return j as T
}

export const pastas = {
  listar: () => req<{ pastas: Pasta[]; mapa: Record<string, number[]> }>('/api/pastas'),
  criar: (nome: string) => req<Pasta[]>('/api/pastas', { body: { nome } }),
  renomear: (id: number, nome: string) => req<Pasta[]>(`/api/pastas/${id}`, { method: 'PUT', body: { nome } }),
  apagar: (id: number) => req<Pasta[]>(`/api/pastas/${id}`, { method: 'DELETE' }),
  colocar: (id: number, v: Pick<Video, 'plataforma' | 'id'>, dentro: boolean) =>
    req(`/api/pastas/${id}/posts`, { body: { plataforma: v.plataforma, id: v.id, dentro } }),
  favoritar: (v: Pick<Video, 'plataforma' | 'id'>, favorito: boolean) =>
    req('/api/favorito', { body: { plataforma: v.plataforma, id: v.id, favorito } }),
}

export const criacao = {
  estilos: () => req<{ estilos: Estilo[]; formatos: FormatoImagem[] }>('/api/estilos'),
  criarEstilo: (nome: string) => req<{ id: number; estilos: Estilo[] }>('/api/estilos', { body: { nome } }),
  renomearEstilo: (id: number, nome: string) => req<Estilo[]>(`/api/estilos/${id}`, { method: 'PUT', body: { nome } }),
  apagarEstilo: (id: number) => req<Estilo[]>(`/api/estilos/${id}`, { method: 'DELETE' }),
  enviarRefs: (id: number, arquivos: File[]) => enviarArquivos<Estilo[]>(`/api/estilos/${id}/refs`, arquivos),
  refDoPost: (id: number, v: Pick<Video, 'plataforma' | 'id'>) => req<Estilo[]>(`/api/estilos/${id}/refs`, { body: { plataforma: v.plataforma, id: v.id } }),
  refDaImagem: (id: number, imagem_id: number) => req<Estilo[]>(`/api/estilos/${id}/refs`, { body: { imagem_id } }),
  removerRef: (id: number, ref: number) => req<Estilo[]>(`/api/estilos/${id}/refs/${ref}`, { method: 'DELETE' }),
  analisarEstilo: (id: number) => req<TarefaIA>(`/api/estilos/${id}/analisar`, { method: 'POST' }),
  imagens: () => req<Imagem[]>('/api/imagens'),
  gerarImagem: (p: { pedido: string; estilo_id?: number | null; formato: string; qualidade: string; quantidade: number; conteudo_id?: number | null }) =>
    req<TarefaIA[]>('/api/imagens', { body: p }),
  favoritarImagem: (id: number, favorita: boolean) => req(`/api/imagens/${id}`, { method: 'PUT', body: { favorita } }),
  apagarImagem: (id: number) => req(`/api/imagens/${id}`, { method: 'DELETE' }),
  conteudos: () => req<Conteudo[]>('/api/conteudos'),
  criarConteudo: (c: Partial<Conteudo> & { gancho?: string; ideia?: string; objetivo?: string; cta?: string; roteiro_base?: string[]; inspirado_em?: string[] }) =>
    req<Conteudo>('/api/conteudos', { body: c }),
  atualizarConteudo: (id: number, c: Partial<Conteudo>) => req<Conteudo>(`/api/conteudos/${id}`, { method: 'PUT', body: c }),
  apagarConteudo: (id: number) => req(`/api/conteudos/${id}`, { method: 'DELETE' }),
  gerarCalendario: (semanas: number, inicio?: string) => req<TarefaIA>('/api/conteudos/calendario', { body: { semanas, inicio } }),
  gerarIdeias: (p: { qtd: number; pilar?: string | null; formato?: string | null; objetivo?: string | null; tema?: string | null }) =>
    req<IdeiaGerada[]>('/api/conteudos/ideias', { body: p }),
  escolherIdeia: (ideia: IdeiaGerada, aceita: boolean) => req('/api/conteudos/ideias/escolha', { body: { ideia, aceita } }),
  gerarRoteiro: (id: number, pedido = '') => req<TarefaIA>(`/api/conteudos/${id}/roteiro`, { body: { pedido } }),
}

export const inicio = {
  eu: () => req<Eu>('/api/eu'),
  config: (c: { onboarding?: boolean }) => req('/api/eu/config', { method: 'PUT', body: c }),
  sugerirConcorrentes: (descricao = '') => req<Sugestao[]>('/api/ia/sugerir-concorrentes', { body: { descricao } }),
  piloto: (p: { estrategia?: boolean; calendario?: boolean } = {}) => req('/api/piloto', { body: p }),
}

// ---------------------------------------------------------------- central de inteligência (Início)

export interface Metrica {
  chave: 'seguidores' | 'alcance' | 'engajamento' | 'publicacoes'; rotulo: string; valor: number | null; delta: number | null
  direcao: 'alta' | 'queda' | 'estavel' | null; comparacao: string | null; nota?: string | null; sufixo?: string
  referencia?: { historico: number | null; concorrentes: number | null }
}
export interface PerfilSemana {
  tem_perfil: boolean; contas?: string[]; metricas?: Metrica[]; leitura?: string; tom?: 'alerta' | 'atencao' | 'positivo' | 'neutro'
  chave?: string; dias_sem_postar?: number | null; concorrentes_publicaram_14d?: number
}
export interface Evidencia { plataforma: Plataforma; conta: string; id: string; lift?: number }
export interface AcaoInsight { tipo: 'ir' | 'gerar_ideia' | 'reclassificar' | 'rolar'; destino?: string; tema?: string; rotulo: string; alvo?: string }
export interface Insight {
  id: number; tipo: 'perfil' | 'atencao' | 'conta' | 'mercado' | 'ideia' | 'sistema'; chave: string; titulo: string; texto: string | null
  dados: {
    categoria?: string; direcao?: 'alta' | 'queda'; rotulo?: string; assunto?: string; por_que_importa?: string; acao_texto?: string
    evidencias?: Evidencia[]; estatistica?: Record<string, unknown>; acao?: AcaoInsight; tom?: string
    formato?: string; pilar?: string; gancho?: string; por_que?: string; base?: string; contas?: { conta: string; motivo: string }[]
  }
  magnitude: number; confianca: number; relevancia: number; estado: string; criado: string; novo: boolean
}
export interface DescobertaRef {
  id: number; plataforma: Plataforma; conta: string; nome: string | null; tipo: 'concorrente' | 'referencia'
  categoria: string | null; motivo: string | null; seguidores: number | null
}
export interface Central {
  perfil: PerfilSemana; atencao: Insight[]; mercado: Insight[]; ideias: Insight[]; desde: Insight[]
  descobertas: DescobertaRef[]; jornada: Record<'perfil' | 'brief' | 'concorrentes' | 'analise' | 'estrategia' | 'planejamento', boolean>
  atualizado: number | null; rodando: boolean; primeira_vez: boolean
}

export const central = {
  ler: () => req<Central>('/api/inicio'),
  atualizar: () => req<TarefaIA>('/api/inicio/atualizar', { method: 'POST' }),
  avaliar: (id: number, estado: 'interessante' | 'irrelevante' | 'oculto' | 'feito') => req(`/api/insights/${id}`, { body: { estado } }),
  reclassificar: (id: number) => req<Conta[]>(`/api/insights/${id}/reclassificar`, { method: 'POST' }),
  descoberta: (id: number, acao: 'adicionar' | 'ignorar' | 'ocultar' | 'interessante', papel?: 'concorrente' | 'referencia') =>
    req<{ ok: boolean; contas: Conta[] | null }>(`/api/descobertas/${id}`, { body: { acao, papel } }),
  ideia: (tema: string, contexto = '') => req<IdeiaGerada[]>('/api/inicio/ideia', { body: { tema, contexto } }),
}

// ---------------------------------------------------------------- busca de perfis (adicionar concorrente/referência)

export interface PerfilEncontrado {
  plataforma: Plataforma; conta: string; nome: string | null; foto: string | null; seguidores: number | null
  verificado: boolean; exato?: boolean; web?: boolean; acompanha?: string | null
}
export const perfis = {
  buscar: (q: string, plataforma?: Plataforma) =>
    req<{ resultados: PerfilEncontrado[]; limitada: boolean; sem_credito: boolean }>(
      `/api/buscar-perfis?q=${encodeURIComponent(q)}${plataforma ? `&plataforma=${plataforma}` : ''}`),
  acompanhar: (p: { conta: string; plataforma: Plataforma; papel: 'concorrente' | 'referencia' | 'proprio'; nome?: string | null }) =>
    req<{ contas: Conta[]; aviso: string | null; tarefa: number; conta: { plataforma: Plataforma; conta: string } }>('/api/contas/acompanhar', { body: p }),
}
