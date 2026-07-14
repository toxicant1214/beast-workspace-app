from datetime import datetime, timezone
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

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def get_tasks_between(start_date, end_date):
    """查詢指定日期區間內未完成待辦"""

    start_iso = (
        datetime.combine(
            start_date,
            datetime.min.time(),
            tzinfo=ZoneInfo("Asia/Taipei"),
        ).isoformat()
    )

    end_iso = (
        datetime.combine(
            end_date,
            datetime.max.time(),
            tzinfo=ZoneInfo("Asia/Taipei"),
        ).isoformat()
    )

    response = (
        supabase
        .table("todo_items")
        .select("*")
        .eq("is_done", False)
        .gte("deadline_at", start_iso)
        .lte("deadline_at", end_iso)
        .order("deadline_at")
        .execute()
    )

    return response.data or []

def create_task(
    title,
    deadline_at,
    has_time,
    priority,
    reminder_offsets,
):
    response = (
        supabase
        .table("todo_items")
        .insert({
            "title": title,
            "deadline_at": deadline_at,
            "has_time": has_time,
            "priority": priority,
            "reminder_offsets": reminder_offsets,
            "assignee": None,
            "is_done": False,
        })
        .execute()
    )

    return response.data


def complete_task(task_id):
    response = (
        supabase
        .table("todo_items")
        .update({
            "is_done": True,
            "completed_at": datetime.now(
                timezone.utc
            ).isoformat(),
        })
        .eq("id", task_id)
        .execute()
    )

    return response.data