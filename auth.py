"""
Supabase auth integration for SEC Analyzer.

Setup:
1. In Supabase dashboard → Authentication → Providers → enable Google/GitHub
2. Copy SUPABASE_URL and SUPABASE_ANON_KEY from Settings → API
3. Add them to .env:
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
"""

import os
from datetime import datetime
from fastapi import HTTPException, Header
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_current_user(authorization: str = Header(None)):
    """
    Extract user from JWT in Authorization header.
    Header format: "Bearer <token>"
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]
    try:
        # Let Supabase verify the token server-side — no JWT secret needed
        response = supabase.auth.get_user(token)
        user = response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user.id, "email": user.email}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {str(e)}")


def create_user_record(user_id: str, email: str) -> None:
    """
    Called after signup: creates a row in the `users` table.
    This table tracks billing status, usage, etc.
    """
    try:
        supabase.table("users").insert({
            "id": user_id,
            "email": email,
            "is_paid": False,
            "analyses_used": 0,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        # User might already exist; that's ok
        pass


def get_user_data(user_id: str) -> dict:
    """Fetch user record from Supabase (billing status, usage count)."""
    try:
        result = supabase.table("users").select("*").eq("id", user_id).single().execute()
        return result.data if result.data else {}
    except Exception:
        return {}


def increment_usage(user_id: str) -> int:
    """Increment analyses_used by 1, return new count."""
    try:
        user = get_user_data(user_id)
        new_count = (user.get("analyses_used", 0) or 0) + 1
        supabase.table("users").update({"analyses_used": new_count}).eq("id", user_id).execute()
        return new_count
    except Exception:
        return 0


def check_rate_limit(user_id: str) -> bool:
    """Return True if user can make an analysis (not over limit)."""
    user = get_user_data(user_id)
    is_paid = user.get("is_paid", False)

    # Paid users: unlimited
    if is_paid:
        return True

    # Free users: 3 per month
    analyses_used = user.get("analyses_used", 0) or 0
    return analyses_used < 3
