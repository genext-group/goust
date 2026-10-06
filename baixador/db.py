"""Postgres (Neon): esquema multi-tenant e helpers de consulta.

Catálogo compartilhado entre usuários: contas, posts, análises de vídeo (um concorrente seguido
por vários criadores é coletado e analisado uma vez só). Por usuário: o que ele acompanha,
brief, feedbacks, aprendizados, relatórios, panoramas, tarefas e uso.
"""
import os
import threading

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .armazenamento import RAIZ

load_dotenv(RAIZ / ".env")
load_dotenv(RAIZ / ".env.nuvem")  # modo local usa o mesmo banco da nuvem

_pool = None
_trava = threading.Lock()

ESQUEMA = """
create table if not exists usuarios (
  id text primary key,
  email text,
  nome text,
  config jsonb not null default '{}',
  criado_em timestamptz not null default now()
);

create table if not exists contas (
  id bigserial primary key,
  plataforma text not null,
  conta text not null,
  nome text,
  seguidores bigint,
  foto_versao bigint,
  perfil jsonb not null default '{}',
  atualizado_em timestamptz,
  unique (plataforma, conta)
);

create table if not exists acompanhamentos (
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  conta_id bigint not null references contas(id) on delete cascade,
  papel text not null default 'concorrente',
  nome text,
  criado_em timestamptz not null default now(),
  primary key (usuario_id, conta_id)
);

create table if not exists posts (
  id bigserial primary key,
  conta_id bigint not null references contas(id) on delete cascade,
  plataforma text not null,
  codigo text not null,
  url text,
  publicado_em timestamptz,
  tipo text,
  legenda text,
  duracao int,
  views bigint,
  likes bigint,
  comentarios bigint,
  extra jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  unique (plataforma, codigo)
);
create index if not exists posts_conta_data on posts (conta_id, publicado_em desc);

create table if not exists analises_video (
  post_id bigint primary key references posts(id) on delete cascade,
  versao int not null,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);

create table if not exists relatorios (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  conta_id bigint not null references contas(id) on delete cascade,
  versao text not null,
  gerado_em timestamptz not null,
  dados jsonb not null
);
create index if not exists relatorios_usuario on relatorios (usuario_id, conta_id, versao desc);

create table if not exists panoramas (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  versao text not null,
  gerado_em timestamptz not null,
  dados jsonb not null
);

create table if not exists estrategias (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  versao text not null,
  gerado_em timestamptz not null,
  dados jsonb not null
);

create table if not exists documentos (
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  tipo text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, tipo)
);

create table if not exists feedbacks (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  ts timestamptz not null default now(),
  alvo text, ref text, secao text, item text, voto int, comentario text
);
create index if not exists feedbacks_usuario on feedbacks (usuario_id, ts);

create table if not exists tarefas (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  tipo text not null,
  status text not null,
  dados jsonb not null,
  criada timestamptz not null default now(),
  fim timestamptz
);
create index if not exists tarefas_usuario on tarefas (usuario_id, tipo, id desc);

create table if not exists comentarios (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  externo_id text not null,
  texto text,
  likes bigint,
  respostas bigint,
  publicado_em timestamptz,
  unique (post_id, externo_id)
);
create index if not exists comentarios_post on comentarios (post_id, likes desc nulls last);

create table if not exists metricas_posts (
  post_id bigint not null references posts(id) on delete cascade,
  dia date not null,
  views bigint, likes bigint, comentarios bigint,
  primary key (post_id, dia)
);

create table if not exists metricas_contas (
  conta_id bigint not null references contas(id) on delete cascade,
  dia date not null,
  seguidores bigint, posts bigint,
  primary key (conta_id, dia)
);

create table if not exists uso (
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  mes text not null,
  modelo text not null,
  chamadas bigint not null default 0,
  entrada bigint not null default 0,
  saida bigint not null default 0,
  segundos_audio bigint not null default 0,
  primary key (usuario_id, mes, modelo)
);

create table if not exists pastas (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  nome text not null,
  sistema text,
  cor text,
  criado_em timestamptz not null default now()
);
create unique index if not exists pastas_sistema on pastas (usuario_id, sistema) where sistema is not null;

create table if not exists pastas_posts (
  pasta_id bigint not null references pastas(id) on delete cascade,
  post_id bigint not null references posts(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (pasta_id, post_id)
);

create table if not exists estilos (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  nome text not null,
  guia jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists estilo_refs (
  id bigserial primary key,
  estilo_id bigint not null references estilos(id) on delete cascade,
  chave text not null,
  origem text not null,
  post_id bigint references posts(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists imagens (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  chave text,
  prompt text not null,
  estilo_id bigint references estilos(id) on delete set null,
  conteudo_id bigint,
  formato text,
  qualidade text,
  modelo text,
  favorita boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists imagens_usuario on imagens (usuario_id, id desc);

create table if not exists conteudos (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  titulo text not null,
  formato text,
  pilar text,
  data date,
  status text not null default 'ideia',
  dados jsonb not null default '{}',
  roteiro jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists conteudos_usuario on conteudos (usuario_id, data);

-- central de inteligência: tudo o que a análise encontra vira um insight com chave (deduplicação),
-- confiança, relevância, validade e o retorno do usuário (que ajusta as próximas recomendações)
create table if not exists insights (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  tipo text not null,
  chave text not null,
  titulo text not null,
  texto text,
  dados jsonb not null default '{}',
  magnitude real not null default 0,
  confianca real not null default 0.5,
  relevancia real not null default 0.5,
  estado text not null default 'novo',
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  expira_em timestamptz
);
create index if not exists insights_usuario on insights (usuario_id, criado_em desc);
create index if not exists insights_chave on insights (usuario_id, chave, criado_em desc);

create table if not exists descobertas (
  id bigserial primary key,
  usuario_id text not null references usuarios(id) on update cascade on delete cascade,
  plataforma text not null,
  conta text not null,
  nome text,
  tipo text not null,
  categoria text,
  motivo text,
  seguidores bigint,
  relevancia real not null default 0.5,
  estado text not null default 'nova',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, plataforma, conta)
);

-- regra de negócio: o perfil principal nunca aparece como concorrente/referência de si mesmo
-- (mesmo @ em outra plataforma é a mesma marca → vira perfil principal também)
update acompanhamentos a2 set papel = 'proprio'
from acompanhamentos a1, contas c1, contas c2
where a1.conta_id = c1.id and a2.conta_id = c2.id and a1.usuario_id = a2.usuario_id
  and a1.papel = 'proprio' and a2.papel <> 'proprio' and lower(c1.conta) = lower(c2.conta);
"""


def pool():
    global _pool
    if _pool is None:
        with _trava:
            if _pool is None:
                url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
                if not url:
                    raise RuntimeError("Banco não configurado (DATABASE_URL).")
                _pool = ConnectionPool(url, min_size=1, max_size=8, kwargs={"row_factory": dict_row, "autocommit": True},
                                       open=True)
                with _pool.connection() as c:
                    c.execute(ESQUEMA)
    return _pool


class Lista(list):
    """Parâmetro que deve ir como array do Postgres (ex.: `= any(%s)`), e não como JSON."""


def _adaptar(params):
    if params is None:
        return None
    return tuple(list(p) if isinstance(p, Lista) else Jsonb(p) if isinstance(p, (dict, list)) else p for p in params)


def todos(sql, *params):
    with pool().connection() as c:
        return c.execute(sql, _adaptar(params)).fetchall()


def um(sql, *params):
    with pool().connection() as c:
        return c.execute(sql, _adaptar(params)).fetchone()


def executar(sql, *params):
    with pool().connection() as c:
        c.execute(sql, _adaptar(params))
