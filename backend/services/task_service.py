from datetime import datetime, timezone
import os

from dotenv import load_dotenv
from supabase import create_client
from zoneinfo import ZoneInfo


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_active_tasks():
    """取得所有尚未完成的待辦。"""

    response = (
        supabase
        .table("todo_items")
        .select("*")
        .eq("is_done", False)
        .order("deadline_at")
        .execute()
    )

    return response.data or []


def get_tasks_between(start_date, end_date):
    """查詢指定日期區間內尚未完成的待辦。"""

    start_iso = datetime.combine(
        start_date,
        datetime.min.time(),
        tzinfo=ZoneInfo("Asia/Taipei"),
    ).isoformat()

    end_iso = datetime.combine(
        end_date,
        datetime.max.time(),
        tzinfo=ZoneInfo("Asia/Taipei"),
    ).isoformat()

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
    """新增一筆個人待辦。"""

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
    """將指定待辦標記為完成。"""

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


def delete_task(task_id):
    """永久刪除指定待辦。"""

    response = (
        supabase
        .table("todo_items")
        .delete()
        .eq("id", task_id)
        .execute()
    )

    return response.data
