export type Plataforma = 'tiktok' | 'instagram'

export interface Perfil {
  nome: string | null
  foto: string | null
  seguidores: number | null
}

export interface Conta {
  papel?: 'proprio' | 'concorrente' | 'referencia'
  /** o que o usuário vê no perfil (vai para a IA antes da análise) */
  aspectos?: string[]
  nota?: string | null
  /** contas da mesma marca em outras plataformas compartilham marca_id (cartão, papel e análise conjunta) */
  marca_id?: number | null
  marca?: string | null
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
  contextoConta: (c: Pick<Conta, 'plataforma' | 'conta'>, d: { papel: 'concorrente' | 'referencia'; aspectos: string[]; nota: string; reanalisar: boolean }) =>
    req<{ contas: Conta[]; tarefa: number | null }>(`/api/contas/${c.plataforma}/${encodeURIComponent(c.conta)}/contexto`, { method: 'PUT', body: d }),
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
/** Capa de um post a partir de plataforma, conta e id (para listas que não trazem o objeto Video completo). */
export const urlCapa = (plataforma: Plataforma, conta: string, id: string) =>
  `/thumb/${plataforma}/${encodeURIComponent(conta)}/${encodeURIComponent(id)}`
/** Download do vídeo: o token vai na URL porque a navegação do navegador não leva o cabeçalho. */
export async function baixarArquivo(v: Video) {
  const token = obterToken ? await obterToken() : null
  const url = `/api/arquivo/${v.plataforma}/${encodeURIComponent(v.conta)}/${encodeURIComponent(v.id)}`
  window.location.href = token ? `${url}?t=${encodeURIComponent(token)}` : url
}
/** Baixa vários vídeos em sequência (um iframe oculto por arquivo; o navegador pode pedir para permitir múltiplos downloads). */
export async function baixarVarios(lista: Video[], aoAvancar?: (feitos: number) => void) {
  const token = obterToken ? await obterToken() : null
  for (let i = 0; i < lista.length; i++) {
    const v = lista[i]
    const url = `/api/arquivo/${v.plataforma}/${encodeURIComponent(v.conta)}/${encodeURIComponent(v.id)}`
    const f = document.createElement('iframe')
    f.style.display = 'none'
    f.src = token ? `${url}?t=${encodeURIComponent(token)}` : url
    document.body.appendChild(f)
    setTimeout(() => f.remove(), 120000)
    aoAvancar?.(i + 1)
    if (i < lista.length - 1) await new Promise((r) => setTimeout(r, 1500))
  }
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
  /** como o usuário via o perfil quando a análise foi feita */
  papel?: 'proprio' | 'concorrente' | 'referencia'
  contexto?: { aspectos: string[]; nota: string | null }
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
  tipo: 'perfil' | 'mercado' | 'estrategia' | 'imagem' | 'estilo' | 'calendario' | 'roteiro' | 'inteligencia' | 'marca'
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
export interface Eu { id: string; email: string | null; nome: string | null; onboarding: boolean; piloto: { estrategia?: boolean; calendario?: boolean }; admin?: boolean; plano?: string }

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
  atualizado: number | null; rodando: boolean; preparando?: boolean; primeira_vez: boolean
}

export const central = {
  ler: () => req<Central>('/api/inicio'),
  atualizar: () => req<TarefaIA>('/api/inicio/atualizar', { method: 'POST' }),
  avaliar: (id: number, estado: 'interessante' | 'irrelevante' | 'oculto' | 'feito') => req(`/api/insights/${id}`, { body: { estado } }),
  reclassificar: (id: number) => req<Conta[]>(`/api/insights/${id}/reclassificar`, { method: 'POST' }),
  descoberta: (id: number, acao: 'adicionar' | 'ignorar' | 'ocultar' | 'interessante', papel?: 'concorrente' | 'referencia', extra?: { aspectos?: string[]; nota?: string }) =>
    req<{ ok: boolean; contas: Conta[] | null }>(`/api/descobertas/${id}`, { body: { acao, papel, ...extra } }),
  ideia: (tema: string, contexto = '') => req<IdeiaGerada[]>('/api/inicio/ideia', { body: { tema, contexto } }),
}

// ---------------------------------------------------------------- busca de perfis (adicionar concorrente/referência)

export interface PerfilEncontrado {
  plataforma: Plataforma; conta: string; nome: string | null; foto: string | null; seguidores: number | null
  verificado: boolean; exato?: boolean; web?: boolean; acompanha?: string | null; proprio?: boolean
}
export const perfis = {
  buscar: (q: string, plataforma?: Plataforma) =>
    req<{ resultados: PerfilEncontrado[]; limitada: boolean; sem_credito: boolean }>(
      `/api/buscar-perfis?q=${encodeURIComponent(q)}${plataforma ? `&plataforma=${plataforma}` : ''}`),
  acompanhar: (p: { conta: string; plataforma: Plataforma; papel: 'concorrente' | 'referencia' | 'proprio'; nome?: string | null; aspectos?: string[]; nota?: string }) =>
    req<{ contas: Conta[]; aviso: string | null; tarefa: number; conta: { plataforma: Plataforma; conta: string } }>('/api/contas/acompanhar', { body: p }),
}

// ---------------------------------------------------------------- super-admin

export type PlanoId = 'gratis' | 'criador' | 'pro' | 'agencia'
export interface ControlesAdmin { plano?: PlanoId; limite_usd_mes?: number | null; bloqueado?: boolean; nota?: string | null }
export interface SaudeAdmin {
  tarefas: { ativas: number; travadas: number; erros_24h: number }
  lote: Record<string, number>
  rotina: { ultima: number | null; com_falha: number }
  saldo_dados: number | null
  openai: boolean
  lote_ativo: boolean
}
export interface VisaoAdmin {
  gerado: number; dias: number; dolar: number; receita_mensal_brl: number
  planos: { plano: PlanoId; n: number }[]
  kpis: Record<string, number>
  custo: { hoje: number; d7: number; d30: number; mes: number; dados_30: number; imagens_30: number; lote_30: number; projecao_mes: number; por_ativo_30d: number; ia_30: number }
  serie: { dia: string; novos: number; ativos: number; sessoes: number; requisicoes: number; ia: number; dados: number; tarefas_ia: number; erros: number }[]
  por_operacao: { operacao: string; usd: number; chamadas: number; usuarios: number }[]
  por_modelo: { modelo: string; usd: number; chamadas: number; entrada: number; saida: number; creditos: number }[]
  saude: SaudeAdmin
}
export interface UsuarioAdmin {
  id: string; email: string | null; nome: string | null; criado_em: string; ultima_visita: number | null; onboarding: boolean
  proprios: number; concorrentes: number; referencias: number; relatorios: number; conteudos: number; imagens: number
  sessoes_30d: number; dias_ativos_30d: number; custo_mes: number; custo_30d: number; custo_total: number; erros_7d: number
  plano: PlanoId; controles: ControlesAdmin; margem_30d: number | null; admin: boolean
}
export interface EventoAdmin { ts: string; tipo: string; dados: Record<string, unknown>; email?: string }
export interface TarefaAdmin { id: number; status: string; tipo: string; conta: string | null; erro: string | null; etapa: string | null; criada: string; fim: string | null; email?: string }
export interface DetalheUsuarioAdmin {
  id: string; email: string | null; nome: string | null; criado_em: string
  controles: ControlesAdmin; visita: { atual?: number; anterior?: number }
  rotina: { ultima?: number; resultado?: Record<string, unknown>; falhas?: string[] }
  contas: { plataforma: Plataforma; conta: string; nome: string; papel: string; aspectos: string[]; nota: string | null; criado_em: string; seguidores: number | null; posts: number; ultima_analise: string | null }[]
  custos_dia: { dia: string; ia: number; dados: number }[]
  por_operacao: { operacao: string; modelo: string; chamadas: number; entrada: number; saida: number; creditos: number; usd: number }[]
  atividade: { dia: string; requisicoes: number; sessoes: number }[]
  linha_tempo: EventoAdmin[]
  tarefas: TarefaAdmin[]
  insights: { total: number; uteis: number; descartados: number; vistos: number }
  lote: { tipo: string; estado: string; erro: string | null; criado_em: string; feito_em: string | null }[]
}
export interface OperacaoAdmin {
  tarefas: TarefaAdmin[]
  erros: EventoAdmin[]
  rotinas: { email: string; ultima: number | null; resultado: Record<string, unknown> | null; falhas: string[] | null }[]
  lotes: { lote_id: string | null; criado: string; feito: string | null; pedidos: number; feitos: number; erros: number; estados: string }[]
  eventos: EventoAdmin[]
  saude: SaudeAdmin
}

export const admin = {
  visao: (dias = 30) => req<VisaoAdmin>(`/api/admin/visao?dias=${dias}`),
  usuarios: () => req<UsuarioAdmin[]>('/api/admin/usuarios'),
  usuario: (id: string) => req<DetalheUsuarioAdmin>(`/api/admin/usuarios/${encodeURIComponent(id)}`),
  atualizar: (id: string, c: ControlesAdmin) => req<{ controles: ControlesAdmin }>(`/api/admin/usuarios/${encodeURIComponent(id)}`, { method: 'PUT', body: c }),
  rodarRotina: (id: string) => req<{ tarefa: number }>(`/api/admin/usuarios/${encodeURIComponent(id)}/rotina`, { body: {} }),
  operacao: () => req<OperacaoAdmin>('/api/admin/operacao'),
  coletarLote: () => req<{ aplicados: number }>('/api/admin/lote/coletar', { body: {} }),
}

// ---------------------------------------------------------------- caderno de ideias

export type TipoNota = 'ideia' | 'observacao' | 'frase' | 'bastidor' | 'pergunta' | 'referencia'
export interface RefNota { plataforma: Plataforma; conta: string; id: string; legenda?: string }
export interface Nota {
  id: number; texto: string; tipo: TipoNota; tags: string[]; ref: RefNota | null; fixada: boolean
  estado: 'solta' | 'usada' | 'arquivada'; conteudo_id: number | null; criado: string; atualizado: string
}
export interface TemaNotas { nome: string; resumo: string; notas: number[]; potencial: 'alto' | 'medio' | 'baixo'; proximo_passo: string }
export interface OrganizacaoNotas { temas: TemaNotas[]; observacao: string }
export interface Provocacao { leitura: string; perguntas: string[]; angulos: string[] }
export type IdeiaDasNotas = IdeiaGerada & { origem: number[] }

export const notas = {
  listar: () => req<{ notas: Nota[]; temas: OrganizacaoNotas | null }>('/api/notas'),
  criar: (n: { texto: string; tipo?: TipoNota; tags?: string[]; ref?: RefNota | null }) => req<Nota>('/api/notas', { body: n }),
  atualizar: (id: number, n: Partial<Pick<Nota, 'texto' | 'tipo' | 'tags' | 'fixada' | 'estado'>>) => req<Nota>(`/api/notas/${id}`, { method: 'PUT', body: n }),
  apagar: (id: number) => req<{ ok: boolean }>(`/api/notas/${id}`, { method: 'DELETE' }),
  provocar: (id: number) => req<Provocacao>(`/api/notas/${id}/provocar`, { body: {} }),
  desenvolver: (ids: number[], pedido = '', qtd = 3) => req<{ ideias: IdeiaDasNotas[] }>('/api/notas/desenvolver', { body: { ids, pedido, qtd } }),
  organizar: (forcar = false) => req<OrganizacaoNotas>('/api/notas/organizar', { body: { forcar } }),
  virarConteudo: (ideia: IdeiaDasNotas, roteiro: boolean, data?: string | null) =>
    req<{ conteudo: Conteudo; tarefa: TarefaIA | null }>('/api/notas/virar-conteudo', { body: { ideia, roteiro, data } }),
}

// ---------------------------------------------------------------- marcas e parecidos

export interface Parecido {
  id: number | null; plataforma: Plataforma; conta: string; nome: string | null; foto: string | null; seguidores: number | null
  bio: string | null; tipo: 'concorrente' | 'referencia'; semelhanca: number; parecido_com: string[]; motivo: string; fonte: 'busca' | 'web'
  grupo?: 'mercado' | 'marcas'
}
export interface ResultadoParecidos {
  itens: Parecido[]; ideais?: Partial<Record<'mercado' | 'marcas', string>>
  pesquisa?: { buscas: number; candidatos: number; termos: string[]; web?: boolean }
}
export interface ComparativoMarca {
  resumo: string; consistencia: number; leitura_consistencia: string; estrategia_multiplataforma: string
  diferencas: { dimensao: string; por_plataforma: { plataforma: Plataforma; como_e: string }[]; leitura: string; diferente: boolean }[]
  funciona_em_cada: { plataforma: Plataforma; itens: string[] }[]
  plataforma_mais_forte: Plataforma | 'equilibrado'; por_que_mais_forte: string; para_voce: string[]
}
export interface RegistroComparativo {
  versao: string; gerado: string; marca: string; papel: string
  contas: { plataforma: Plataforma; conta: string; relatorio: string; metricas: Metricas }[]
  comparativo: ComparativoMarca
}

export const marcas = {
  unir: (contas: Pick<Conta, 'plataforma' | 'conta'>[], nome?: string) => req<Conta[]>('/api/marcas/unir', { body: { contas, nome } }),
  separar: (c: Pick<Conta, 'plataforma' | 'conta'>) => req<Conta[]>('/api/marcas/separar', { body: c }),
  renomear: (id: number, nome: string) => req<Conta[]>(`/api/marcas/${id}`, { method: 'PUT', body: { nome } }),
  comparativo: (id: number) => req<{ comparativo: RegistroComparativo | null; desatualizado: boolean; faltam: string[]; marca: string }>(`/api/marcas/${id}/comparativo`),
  gerarComparativo: (id: number) => req<TarefaIA>(`/api/marcas/${id}/comparativo`, { body: {} }),
  removerMarca: (c: Pick<Conta, 'plataforma' | 'conta'>) =>
    req<Conta[]>(`/api/contas/${c.plataforma}/${encodeURIComponent(c.conta)}?marca=1`, { method: 'DELETE' }),
  parecidos: (p: { chaves: string[]; negocio: boolean; forcar?: boolean }) => req<ResultadoParecidos>('/api/parecidos', { body: p }),
}

export const bibliotecaEstado = {
  estado: () => req<{ verificado: number | null; ultimo_post: string | null; perfis: number }>('/api/biblioteca/estado'),
  verificar: () => req<{ perfis: number }>('/api/biblioteca/verificar', { body: {} }),
}

/** Primeira coleta de uma marca nova, por rede social (igual a COLETA_INICIAL no backend). */
export const COLETA_INICIAL = 100

export type MidiaPost = { tipo: 'video'; video: string } | { tipo: 'imagens'; imagens: string[] }
/** Mídia do post para o visualizador próprio (Instagram): vídeo direto ou imagens do carrossel/foto. */
export const midiaPost = (v: Pick<Video, 'plataforma' | 'conta' | 'id'>) =>
  req<MidiaPost>(`/api/midia/${v.plataforma}/${encodeURIComponent(v.conta)}/${encodeURIComponent(v.id)}`)

// ---------------------------------------------------------------- radar do mercado (números, sem IA)

export type Momento = 'acelerando' | 'estavel' | 'esfriando' | 'retomou' | 'parado'
export type FormatoPost = 'reel' | 'carrossel' | 'foto' | 'tiktok'
export interface MarcaRadar {
  chave: string; nome: string; papel: 'proprio' | 'concorrente' | 'referencia'
  contas: { plataforma: Plataforma; conta: string; seguidores: number | null; foto: string | null }[]
  seguidores: number | null; seguidores_delta: number | null; seguidores_desde: string | null
  serie_seguidores: { dia: string; v: number }[]
  posts: number; posts_antes: number; posts_delta: number | null; semanas: number[]
  views_mediana: number | null; views_delta: number | null; engajamento: number | null; interacoes: number | null
  momento: Momento | null
  melhor: { plataforma: Plataforma; conta: string; id: string; views: number; formato: FormatoPost } | null
  por_mes: { mes: string; posts: number; views: number | null }[]
}
export interface Radar {
  dias: number; historico_seguidores_desde: string | null
  marcas: MarcaRadar[]
  mercado: {
    semanas: Record<FormatoPost, number>[]; inicio_semanas: string
    por_formato: { formato: FormatoPost; posts: number; parcela: number; views: number | null; engajamento: number | null; interacoes: number | null }[]
    em_alta: { plataforma: Plataforma; conta: string; marca: string; id: string; views: number; formato: FormatoPost; vezes: number; publicado: string }[]
    posts_30: number; posts_30_antes: number
  } | null
}
export const radarMercado = (dias = 30) => req<Radar>(`/api/mercado/radar?dias=${dias}`)
