import os
from datetime import datetime, timedelta, timezone

from supabase import create_client


SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY"
)

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


# =========================================================
# 公告建立
# =========================================================

def create_announcement(
    title,
    content,
    teacher_ids,
):
    """
    建立公告與收件人。

    此時只建立 draft，
    不代表 LINE 已經成功發送。
    """

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
            or len(recipient_result.data)
            != len(recipient_rows)
        ):
            raise RuntimeError("建立公告收件人失敗")

    except Exception:
        # 避免只留下沒有收件人的孤兒公告
        (
            supabase
            .table("announcements")
            .delete()
            .eq("id", announcement_id)
            .execute()
        )
        raise

    return announcement


# =========================================================
# 正式標記公告已發送
# =========================================================

def mark_announcement_sent(
    announcement_id,
    sent_at=None,
):
    """
    LINE Push 完成後呼叫。

    簽收期限固定為實際發送時間 + 12 小時。
    """

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


# =========================================================
# 取得公告
# =========================================================

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


def get_recipient_by_token(access_token):
    """
    公告頁使用個人 access token，
    不直接相信網址上的 teacher_id。
    """

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
                name
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


# =========================================================
# 老師開啟公告
# =========================================================

def mark_opened(access_token):
    recipient = get_recipient_by_token(
        access_token
    )

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    # 只記第一次開啟時間
    if recipient.get("opened_at"):
        return recipient

    result = (
        supabase
        .table("announcement_recipients")
        .update({
            "opened_at": iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("opened_at", "null")
        .execute()
    )

    if result.data:
        return result.data[0]

    return get_recipient_by_token(
        access_token
    )


# =========================================================
# 老師已看到公告底部
# =========================================================

def mark_scroll_completed(access_token):
    recipient = get_recipient_by_token(
        access_token
    )

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    # 同樣只記第一次
    if recipient.get("scroll_completed_at"):
        return recipient

    result = (
        supabase
        .table("announcement_recipients")
        .update({
            "scroll_completed_at":
                iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("scroll_completed_at", "null")
        .execute()
    )

    if result.data:
        return result.data[0]

    return get_recipient_by_token(
        access_token
    )


# =========================================================
# 簽收
# =========================================================

def confirm_announcement(access_token):
    recipient = get_recipient_by_token(
        access_token
    )

    if not recipient:
        raise ValueError("找不到公告簽收資料")

    announcement = recipient.get(
        "announcements"
    )

    if not announcement:
        raise ValueError("找不到公告")

    if announcement.get("status") != "sent":
        raise ValueError("這則公告目前不可簽收")

    # 重複按確認，不新增第二筆、不覆蓋第一次時間
    if recipient.get("confirmed_at"):
        return recipient

    # 必須先完成公告內容閱讀區
    if not recipient.get("scroll_completed_at"):
        raise ValueError(
            "請先完整查看公告內容後再確認"
        )

    result = (
        supabase
        .table("announcement_recipients")
        .update({
            "confirmed_at":
                iso_datetime(utc_now()),
        })
        .eq("id", recipient["id"])
        .is_("confirmed_at", "null")
        .execute()
    )

    if result.data:
        return result.data[0]

    return get_recipient_by_token(
        access_token
    )


# =========================================================
# 尚未簽收的人
# =========================================================

def get_unconfirmed_recipients(
    announcement_id,
):
    result = (
        supabase
        .table("announcement_recipients")
        .select(
            """
            *,
            teachers (
                id,
                name,
                line_user_id
            )
            """
        )
        .eq(
            "announcement_id",
            announcement_id
        )
        .is_("confirmed_at", "null")
        .execute()
    )

    return result.data or []


# =========================================================
# 提醒紀錄
# =========================================================

def record_reminder(
    announcement_id,
    teacher_id,
):
    result = (
        supabase
        .table("announcement_reminders")
        .insert({
            "announcement_id":
                announcement_id,
            "teacher_id":
                teacher_id,
            "reminded_at":
                iso_datetime(utc_now()),
        })
        .execute()
    )

    if not result.data:
        raise RuntimeError("建立提醒紀錄失敗")

    return result.data[0]