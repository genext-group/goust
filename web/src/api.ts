export type Plataforma = 'tiktok' | 'instagram'

export interface Perfil {
  nome: string | null
  foto: string | null
  seguidores: number | null
}

export interface Conta {
  papel?: 'proprio' | 'concorrente'
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
  papelConta: (c: Pick<Conta, 'plataforma' | 'conta'>, papel: 'proprio' | 'concorrente') =>
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
  tipo: 'perfil' | 'mercado' | 'estrategia'
  plataforma: Plataforma | null
  conta: string | null
  status: 'na fila' | 'rodando' | 'concluído' | 'erro'
  etapa: string
  feito: number
  total: number
  erro: string | null
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
