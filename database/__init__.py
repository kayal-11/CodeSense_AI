from __future__ import annotations

from pathlib import Path

_backend_database = Path(__file__).resolve().parent.parent / 'backend' / 'database'
if str(_backend_database) not in __path__:
    __path__.append(str(_backend_database))
