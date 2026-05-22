import re, time
from datetime import datetime

def clean_text(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()

def rate_limit(delay: float = 0.1):
    def decorator(func):
        def wrapper(*args, **kwargs):
            time.sleep(delay)
            return func(*args, **kwargs)
        return wrapper
    return decorator

def get_timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")
