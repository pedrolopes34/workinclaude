"""Conexao Postgres do /pipeline — mesma DATABASE_URL do /webapp (docs/DECISIONS.md secao 6.6)."""

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from dotenv import load_dotenv

load_dotenv()


def _connection_string() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL nao definida. Copie pipeline/.env.example para "
            "pipeline/.env e preencha, ou exporte a variavel no ambiente."
        )
    return url


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(_connection_string())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
