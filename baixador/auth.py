"""Quem está usando o app.

Nuvem: o login é do Clerk. O navegador manda o token de sessão (Authorization: Bearer ...) e aqui
ele é validado com a chave pública do Clerk (JWKS), sem chamada de rede por requisição.
No primeiro acesso o usuário é criado no banco; se o e-mail for o do dono (DONO_EMAIL), ele herda
os dados que estavam no usuário provisório "dono" (os dados anteriores à versão multi-tenant).

Local: sem login; usa o usuário do dono.
"""
import base64
import os
import threading

import jwt
from curl_cffi import requests

from . import db

DONO_PROVISORIO = "dono"
_jwks = None
_trava = threading.Lock()
_conhecidos = set()


def chave_publica_clerk():
    return os.getenv("CLERK_PUBLISHABLE_KEY") or os.getenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") or ""


def _cliente_jwks():
    global _jwks
    if _jwks is None:
        pk = chave_publica_clerk()
        dominio = base64.b64decode(pk.split("_", 2)[2] + "==").decode().rstrip("$")
        _jwks = jwt.PyJWKClient(f"https://{dominio}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    return _jwks


def validar_token(token):
    """Devolve o id do usuário no Clerk (claim sub) ou None se o token for inválido/expirado."""
    try:
        chave = _cliente_jwks().get_signing_key_from_jwt(token)
        dados = jwt.decode(token, chave.key, algorithms=["RS256"], options={"verify_aud": False}, leeway=10)
        return dados.get("sub")
    except Exception:
        return None


def _dados_clerk(usuario_id):
    try:
        r = requests.get(f"https://api.clerk.com/v1/users/{usuario_id}", timeout=15,
                         headers={"Authorization": f"Bearer {os.getenv('CLERK_SECRET_KEY', '')}"})
        u = r.json()
        emails = {e["id"]: e["email_address"] for e in u.get("email_addresses") or []}
        nome = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x) or None
        return emails.get(u.get("primary_email_address_id")), nome
    except Exception:
        return None, None


def garantir_usuario(usuario_id):
    """Cria o usuário no primeiro acesso (e transfere os dados antigos se for o dono)."""
    if usuario_id in _conhecidos:
        return
    with _trava:
        if db.um("select 1 from usuarios where id = %s", usuario_id):
            _conhecidos.add(usuario_id)
            return
        email, nome = _dados_clerk(usuario_id)
        dono = (os.getenv("DONO_EMAIL") or "").strip().lower()
        if email and dono and email.lower() == dono and db.um("select 1 from usuarios where id = %s", DONO_PROVISORIO):
            # o "on update cascade" das chaves estrangeiras leva junto contas, relatórios, feedbacks...
            db.executar("update usuarios set id = %s, email = %s, nome = %s where id = %s",
                        usuario_id, email, nome, DONO_PROVISORIO)
        else:
            db.executar("insert into usuarios (id, email, nome) values (%s, %s, %s) on conflict (id) do nothing",
                        usuario_id, email, nome)
        _conhecidos.add(usuario_id)


def usuario_local():
    """Modo local: o dono (pelo e-mail) ou o usuário provisório, criado se preciso."""
    dono = (os.getenv("DONO_EMAIL") or "").strip().lower()
    if dono:
        r = db.um("select id from usuarios where lower(email) = %s", dono)
        if r:
            return r["id"]
    db.executar("insert into usuarios (id, nome) values (%s, 'Dono') on conflict (id) do nothing", DONO_PROVISORIO)
    return DONO_PROVISORIO
