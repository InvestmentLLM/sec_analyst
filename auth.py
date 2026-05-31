"""
auth.py — Supabase auth + usage-limit enforcement for the SEC Analyst API.

The module is safe to import even when Supabase env vars are missing (it just
sets _available = False and all functions become no-ops).

Backend Supabase writes use the SERVICE ROLE key when available so they bypass
Row Level Security.  The anon key is used as a fallback for local dev where
RLS policies are usually disabled.
"""

import os
from datetime import date, datetime
from fastapi import HTTPException, Header

from dotenv import load_dotenv
load_dotenv()

_SUPABASE_URL    = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
_ANON_KEY        = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
_SERVICE_KEY     = os.getenv("SUPABASE_SERVICE_KEY", "")   # set on Railway/Render for writes
_WRITE_KEY       = _SERVICE_KEY or _ANON_KEY              # service key preferred for mutations

_available = bool(_SUPABASE_URL and _ANON_KEY)
supabase = None

if _available:
    try:
        from supabase import create_client
        supabase = create_client(_SUPABASE_URL, _WRITE_KEY)
    except Exception:
        _available = False

FREE_LIMIT = 3   # analyses per calendar month for free users


# ── Token verification ───────────────────────────────────────────────────────

def get_current_user(authorization: str | None) -> dict | None:
    """
    Verify a Supabase JWT from the Authorization header.
    Returns {"id": uuid, "email": str} or raises HTTPException(401).
    Returns None if no token was supplied (anonymous access).
    """
    if not authorization:
        return None
    if not _available or supabase is None:
        return None   # auth system not configured — treat as anonymous

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]
    try:
        # Supabase verifies the JWT server-side
        resp = supabase.auth.get_user(token)
        user = resp.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": str(user.id), "email": user.email or ""}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


# ── User record management ───────────────────────────────────────────────────

def _first_of_month() -> str:
    today = date.today()
    return date(today.year, today.month, 1).isoformat()


def ensure_user_record(user_id: str, email: str) -> None:
    """Upsert a row in public.users — safe to call on every request."""
    if not _available or supabase is None:
        return
    try:
        supabase.table("users").upsert(
            {
                "id": user_id,
                "email": email,
                "is_paid": False,
                "analyses_used": 0,
                "analyses_reset_at": _first_of_month(),
            },
            on_conflict="id",
            ignore_duplicates=True,   # don't overwrite existing rows
        ).execute()
    except Exception:
        pass


def get_user_data(user_id: str) -> dict:
    """Fetch the public.users row for this user."""
    if not _available or supabase is None:
        return {}
    try:
        result = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
        return result.data or {}
    except Exception:
        return {}


def check_and_increment(user_id: str) -> dict:
    """
    Check usage limit, increment if allowed.
    Returns {"allowed": bool, "used": int, "limit": int|None, "plan": str}.
    Called ONCE per fresh analysis (cache hits skip this).
    """
    if not _available or supabase is None:
        return {"allowed": True, "used": 0, "limit": None, "plan": "free"}

    user = get_user_data(user_id)

    # Paid users: always allowed
    if user.get("is_paid"):
        try:
            supabase.table("users").update({
                "analyses_used": (user.get("analyses_used") or 0) + 1
            }).eq("id", user_id).execute()
        except Exception:
            pass
        return {"allowed": True, "used": user.get("analyses_used", 0), "limit": None, "plan": "pro"}

    # Free users: check monthly quota
    reset_at = user.get("analyses_reset_at", "")
    used     = user.get("analyses_used", 0) or 0
    fom      = _first_of_month()

    # Reset counter at the start of a new calendar month
    if reset_at < fom:
        used = 0
        try:
            supabase.table("users").update({
                "analyses_used": 0,
                "analyses_reset_at": fom,
            }).eq("id", user_id).execute()
        except Exception:
            pass

    if used >= FREE_LIMIT:
        return {"allowed": False, "used": used, "limit": FREE_LIMIT, "plan": "free"}

    # Increment
    try:
        supabase.table("users").update({
            "analyses_used": used + 1,
            "analyses_reset_at": fom,
        }).eq("id", user_id).execute()
    except Exception:
        pass

    return {"allowed": True, "used": used + 1, "limit": FREE_LIMIT, "plan": "free"}


def get_usage(user_id: str) -> dict:
    """Return current plan + usage for the /usage endpoint."""
    if not _available or supabase is None:
        return {"plan": "free", "analyses_used": 0, "analyses_limit": FREE_LIMIT}

    user = get_user_data(user_id)
    is_paid = user.get("is_paid", False)
    used = user.get("analyses_used", 0) or 0

    # Auto-reset at month boundary (read-only check)
    reset_at = user.get("analyses_reset_at", "")
    if reset_at < _first_of_month():
        used = 0

    return {
        "plan":           "pro" if is_paid else "free",
        "analyses_used":  used,
        "analyses_limit": None if is_paid else FREE_LIMIT,
    }


def mark_paid(email: str, stripe_customer_id: str = "") -> bool:
    """Called from Stripe webhook — marks user as paid by email."""
    if not _available or supabase is None:
        return False
    try:
        update: dict = {"is_paid": True}
        if stripe_customer_id:
            update["stripe_customer_id"] = stripe_customer_id
        supabase.table("users").update(update).eq("email", email).execute()
        return True
    except Exception:
        return False
