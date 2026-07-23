from datetime import datetime, timedelta, timezone
import os

from dotenv import load_dotenv
from supabase import create_client
from zoneinfo import ZoneInfo


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_active_tasks():
    """取得所有尚未完成的個人待辦。"""

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
    """查詢指定日期區間內尚未完成的個人待辦。"""

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


def _normalize_datetime(value):
    """將提醒時間統一轉成 UTC ISO 格式。"""

    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.astimezone(timezone.utc).isoformat()

    return str(value)


def _parse_database_datetime(value):
    """解析 Supabase 回傳的時間格式。"""

    if not value:
        return None

    try:
        return datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
    except ValueError:
        return None


def _find_notification_delivery(
    source_type,
    source_id,
    recipient_line_user_id,
    reminder_type,
    scheduled_at,
):
    """查詢同一筆提醒是否已建立發送紀錄。"""

    response = (
        supabase
        .table("notification_delivery_logs")
        .select("*")
        .eq("source_type", source_type)
        .eq("source_id", str(source_id))
        .eq(
            "recipient_line_user_id",
            recipient_line_user_id,
        )
        .eq("reminder_type", reminder_type)
        .eq("scheduled_at", scheduled_at)
        .limit(1)
        .execute()
    )

    rows = response.data or []

    return rows[0] if rows else None


def claim_notification_delivery(
    source_type,
    source_id,
    recipient_type,
    recipient_line_user_id,
    reminder_type,
    scheduled_at,
):
    """
    取得一筆提醒的發送權。

    回傳紀錄代表可以發送。
    回傳 None 代表已發送，或正由其他程序處理。
    """

    scheduled_at_iso = _normalize_datetime(
        scheduled_at
    )

    existing = _find_notification_delivery(
        source_type=source_type,
        source_id=source_id,
        recipient_line_user_id=recipient_line_user_id,
        reminder_type=reminder_type,
        scheduled_at=scheduled_at_iso,
    )

    now = datetime.now(timezone.utc)

    if existing:
        status = existing.get("status")

        if status == "sent":
            return None

        claimed_at = _parse_database_datetime(
            existing.get("claimed_at")
        )

        if (
            status == "processing"
            and claimed_at
            and claimed_at > now - timedelta(minutes=15)
        ):
            return None

        response = (
            supabase
            .table("notification_delivery_logs")
            .update({
                "status": "processing",
                "claimed_at": now.isoformat(),
                "sent_at": None,
                "error_message": None,
            })
            .eq("id", existing["id"])
            .execute()
        )

        rows = response.data or []

        return rows[0] if rows else None

    try:
        response = (
            supabase
            .table("notification_delivery_logs")
            .insert({
                "source_type": source_type,
                "source_id": str(source_id),
                "recipient_type": recipient_type,
                "recipient_line_user_id": (
                    recipient_line_user_id
                ),
                "reminder_type": reminder_type,
                "scheduled_at": scheduled_at_iso,
                "status": "processing",
                "claimed_at": now.isoformat(),
            })
            .execute()
        )

        rows = response.data or []

        return rows[0] if rows else None

    except Exception as error:
        # 若同一時間有另一個排程先建立紀錄，
        # 唯一限制會阻止重複新增。
        print(
            "提醒紀錄可能已存在：",
            type(error).__name__,
            error,
        )

        return None


def mark_notification_delivery_sent(delivery_id):
    """將提醒紀錄標記為成功發送。"""

    response = (
        supabase
        .table("notification_delivery_logs")
        .update({
            "status": "sent",
            "sent_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "error_message": None,
        })
        .eq("id", delivery_id)
        .execute()
    )

    return response.data


def mark_notification_delivery_failed(
    delivery_id,
    error_message,
):
    """將提醒紀錄標記為發送失敗。"""

    response = (
        supabase
        .table("notification_delivery_logs")
        .update({
            "status": "failed",
            "error_message": str(error_message)[:1000],
        })
        .eq("id", delivery_id)
        .execute()
    )

    return response.data