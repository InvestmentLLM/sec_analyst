import json, time
from pathlib import Path

_CACHE_DIR = Path(__file__).parent / ".sec_cache"
_CACHE_DIR.mkdir(exist_ok=True)

# TTLs in seconds
TTL_ANALYSIS = 86_400       # 24h  — comprehensive LLM analysis
TTL_XBRL     = 7 * 86_400  # 7d   — company XBRL facts (quarterly)
TTL_TEXT     = 30 * 86_400  # 30d  — filed documents never change


def _path(key: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in key)
    return _CACHE_DIR / f"{safe}.json"


def get(key: str, ttl: int):
    p = _path(key)
    if not p.exists():
        return None
    if time.time() - p.stat().st_mtime > ttl:
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def put(key: str, value) -> None:
    try:
        _path(key).write_text(json.dumps(value, default=str))
    except Exception:
        pass


def evict(key: str) -> bool:
    p = _path(key)
    if p.exists():
        p.unlink()
        return True
    return False


def evict_ticker(ticker: str) -> list[str]:
    """Remove all cache entries that start with the ticker prefix."""
    removed = []
    for p in _CACHE_DIR.glob(f"{ticker.upper()}_*.json"):
        p.unlink()
        removed.append(p.stem)
    return removed
