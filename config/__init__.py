from __future__ import annotations

from pathlib import Path

_backend_config = Path(__file__).resolve().parent.parent / 'backend' / 'config'
if str(_backend_config) not in __path__:
    __path__.append(str(_backend_config))
