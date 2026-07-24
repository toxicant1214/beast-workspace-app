from datetime import datetime, time
from zoneinfo import ZoneInfo


TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def parse_custom_date(text):
    """接受 YYYY/MM/DD 或 YYYY-MM-DD。"""

    normalized = text.strip().replace("/", "-")
    return datetime.strptime(normalized, "%Y-%m-%d").date()


def parse_custom_time(text):
    """接受 HH:MM 的 24 小時制時間。"""

    return datetime.strptime(text.strip(), "%H:%M").time()


def build_deadline_at(payload):
    """把日期與時間組合成含台灣時區的 ISO 日期時間。"""

    deadline_date = datetime.strptime(
        payload["deadline_date"],
        "%Y-%m-%d",
    ).date()

    if payload.get("has_time"):
        deadline_time = datetime.strptime(
            payload["deadline_time"],
            "%H:%M",
        ).time()
    else:
        deadline_time = time(23, 59)

    deadline = datetime.combine(
        deadline_date,
        deadline_time,
        tzinfo=TAIPEI_TZ,
    )

    return deadline.isoformat()


def build_task_summary(payload):
    priority_labels = {
        "normal": "一般",
        "high": "重要",
        "urgent": "非常重要",
    }

    reminder_labels = {
    "30_minutes": "30 分鐘前",
    "1_hour": "1 小時前",
    "2_hours": "2 小時前",
    "1_day": "一天前",
    "2_days": "兩天前",
    "1_week": "一週前",
}

    title = payload.get("title", "未命名任務")
    if len(title) > 45:
        title = f"{title[:45]}…"

    deadline_date = payload.get("deadline_date", "未設定")
    deadline_time = payload.get("deadline_time")
    has_time = payload.get("has_time", False)

    if has_time and deadline_time:
        deadline_text = f"{deadline_date} {deadline_time}"
    else:
        deadline_text = f"{deadline_date}（不指定時間）"

    priority_text = priority_labels.get(
        payload.get("priority"),
        "一般",
    )

    reminders = payload.get("reminder_offsets") or []
    if reminders:
        reminder_text = "、".join(
            reminder_labels.get(item, item)
            for item in reminders
        )
    else:
        reminder_text = "不設定"

    return (
        f"任務：{title}\n"
        f"截止：{deadline_text}\n"
        f"程度：{priority_text}\n"
        f"提醒：{reminder_text}"
    )
