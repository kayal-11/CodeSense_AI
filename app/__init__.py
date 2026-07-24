from __future__ import annotations

from pathlib import Path

_backend_app = Path(__file__).resolve().parent.parent / 'backend' / 'app'
if str(_backend_app) not in __path__:
    __path__.append(str(_backend_app))
