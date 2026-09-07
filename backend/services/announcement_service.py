import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
)


def utc_now():
    return datetime.now(timezone.utc)


def iso_datetime(value):
    if value is None:
        return None
    return value.isoformat()


def create_announcement(title, content, teacher_ids):
    if not title or not title.strip():
        raise ValueError("公告標題不可空白")

    if not content or not content.strip():
        raise ValueError("公告內容不可空白")

    teacher_ids = list(
        dict.fromkeys(
            teacher_id
            for teacher_id in teacher_ids
            if teacher_id
        )
    )

    if not teacher_ids:
        raise ValueError("至少需要選擇一位老師")

    announcement_result = (
        supabase
        .table("announcements")
        .insert({
            "title": title.strip(),
            "content": content.strip(),
            "status": "draft",
        })
        .execute()
    )

    if not announcement_result.data:
        raise RuntimeError("建立公告失敗")

    announcement = announcement_result.data[0]
    announcement_id = announcement["id"]

    recipient_rows = [
        {
            "announcement_id": announcement_id,
            "teacher_id": teacher_id,
        }
        for teacher_id in teacher_ids
    ]

    try:
        recipient_result = (
            supabase
            .table("announcement_recipients")
            .insert(recipient_rows)
            .execute()
        )

        if (
            not recipient_result.data
            or len(recipient_result.data) != len(recipient_rows)
        ):
            raise RuntimeError("建立公告收件人失敗")

    except Exception:
        (
            supabase
            .table("announcements")
            .delete()
            .eq("id", announcement_id)
            .execute()
        )
        raise

    return announcement


def mark_announcement_sent(announcement_id, sent_at=None):
    sent_at = sent_at or utc_now()
    deadline_at = sent_at + timedelta(hours=12)

    result = (
        supabase
        .table("announcements")
        .update({
            "status": "sent",
            "sent_at": iso_datetime(sent_at),
            "deadline_at": iso_datetime(deadline_at),
            "updated_at": iso_datetime(utc_now()),
        })
        .eq("id", announcement_id)
        .execute()
    )

    if not result.data:
        raise RuntimeError("更新公告發送狀態失敗")

    return result.data[0]


def get_announcement(announcement_id):
    result = (
        supabase
        .table("announcements")
        .select("*")
        .eq("id", announcement_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None

    return result.data[0]



def get_announcement_recipients(announcement_id):
    """
    取得指定公告的所有收件老師，
    供正式 LINE Push 發送流程使用。
    """

    result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("announcement_id", announcement_id)
        .execute()
    )

    return result.data or []


def get_recipient_by_token(access_token):
    result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            announcements (
                id,
                title,
                content,
                status,
                sent_at,
                deadline_at
            ),
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("access_token", access_token)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None

    return result.data[0]


def mark_opened(access_token):
    recipient = get_recipient_by_token(access_token)

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    if recipient.get("opened_at"):
        return recipient

    (
        supabase
        .table("announcement_recipients")
        .update({
            "opened_at": iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("opened_at", "null")
        .execute()
    )

    return get_recipient_by_token(access_token)


def mark_scroll_completed(access_token):
    recipient = get_recipient_by_token(access_token)

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    if recipient.get("scroll_completed_at"):
        return recipient

    (
        supabase
        .table("announcement_recipients")
        .update({
            "scroll_completed_at": iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("scroll_completed_at", "null")
        .execute()
    )

    return get_recipient_by_token(access_token)


def confirm_announcement(access_token):
    recipient = get_recipient_by_token(access_token)

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    announcement = recipient.get("announcements")

    if not announcement:
        raise ValueError("找不到公告")

    if announcement.get("status") != "sent":
        raise ValueError("這則公告目前不可簽收")

    if recipient.get("confirmed_at"):
        return recipient

    if not recipient.get("scroll_completed_at"):
        raise ValueError("請先完整查看公告內容後再確認")

    (
        supabase
        .table("announcement_recipients")
        .update({
            "confirmed_at": iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("confirmed_at", "null")
        .execute()
    )

    return get_recipient_by_token(access_token)


def confirm_announcement_by_line_user_id(
    recipient_id,
    line_user_id,
):
    """
    老師直接在 LINE 公告卡片按下確認時使用。

    驗證目前按鈕的 LINE userId 確實屬於
    這筆 announcement_recipient 的老師，
    不沿用網頁版 scroll_completed_at 限制。
    """

    if not recipient_id or not line_user_id:
        raise ValueError("公告簽收資料不完整")

    result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            announcements (
                id,
                title,
                content,
                status,
                sent_at,
                deadline_at
            ),
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("id", recipient_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None

    recipient = result.data[0]
    teacher = recipient.get("teachers") or {}
    announcement = recipient.get("announcements") or {}

    if teacher.get("line_user_id") != line_user_id:
        return None

    if announcement.get("status") != "sent":
        raise ValueError("這則公告目前不可簽收")

    if recipient.get("confirmed_at"):
        return {
            "already_confirmed": True,
            "recipient": recipient,
            "announcement": announcement,
            "teacher": teacher,
        }

    (
        supabase
        .table("announcement_recipients")
        .update({
            "confirmed_at": iso_datetime(utc_now()),
        })
        .eq("id", recipient_id)
        .is_("confirmed_at", "null")
        .execute()
    )

    refreshed_result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            announcements (
                id,
                title,
                content,
                status,
                sent_at,
                deadline_at
            ),
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("id", recipient_id)
        .limit(1)
        .execute()
    )

    if not refreshed_result.data:
        raise RuntimeError("公告簽收完成，但重新讀取資料失敗")

    refreshed = refreshed_result.data[0]

    return {
        "already_confirmed": False,
        "recipient": refreshed,
        "announcement":
            refreshed.get("announcements") or {},
        "teacher":
            refreshed.get("teachers") or {},
    }


def get_unconfirmed_recipients(announcement_id):
    result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("announcement_id", announcement_id)
        .is_("confirmed_at", "null")
        .execute()
    )

    return result.data or []


def record_reminder(announcement_id, teacher_id):
    result = (
        supabase
        .table("announcement_reminders")
        .insert({
            "announcement_id": announcement_id,
            "teacher_id": teacher_id,
            "reminded_at": iso_datetime(utc_now()),
        })
        .execute()
    )

    if not result.data:
        raise RuntimeError("建立提醒紀錄失敗")

    return result.data[0]
