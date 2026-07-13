import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_active_tasks():
    response = (
        supabase
        .table("todo_items")
        .select("*")
        .eq("is_done", False)
        .order("deadline_at")
        .execute()
    )

    return response.data or []
from datetime import datetime, timezone


def complete_task(task_id):
    response = (
        supabase
        .table("todo_items")
        .update({
            "is_done": True,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", task_id)
        .execute()
    )

    return response.data