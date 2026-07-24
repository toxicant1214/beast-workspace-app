import os
from datetime import datetime, timedelta, time

from dotenv import load_dotenv
from zoneinfo import ZoneInfo

from services.line_service import send_line_message_to_user
from services.task_service import (
    claim_notification_delivery,
    get_active_tasks,
    mark_notification_delivery_failed,
    mark_notification_delivery_sent,
)


load_dotenv()

ADMIN_LINE_USER_ID = os.getenv("ADMIN_LINE_USER_ID")

TAIPEI_TZ = ZoneInfo("Asia/Taipei")

# 排程稍有延遲時仍允許發送，但不補發太久以前的舊提醒。
REMINDER_GRACE_MINUTES = 10

# 所有提醒統一換算為「分鐘」。
REMINDER_MINUTE_OFFSETS = {
    "30_minutes": 30,
    "1_hour": 60,
    "2_hours": 120,
    "1_day": 24 * 60,
    "2_days": 2 * 24 * 60,
    "1_week": 7 * 24 * 60,
}

REMINDER_LABELS = {
    "30_minutes": "30 分鐘前提醒",
    "1_hour": "1 小時前提醒",
    "2_hours": "2 小時前提醒",
    "1_day": "一天前提醒",
    "2_days": "兩天前提醒",
    "1_week": "一週前提醒",
}

PRIORITY_LABELS = {
    "normal": "一般",
    "high": "重要",
    "urgent": "非常重要",
}


def parse_deadline(deadline_value):
    """解析 Supabase 的 deadline_at，並轉換成台灣時間。"""

    if not deadline_value:
        return None

    try:
        deadline = datetime.fromisoformat(
            str(deadline_value).replace("Z", "+00:00")
        )
    except ValueError:
        return None

    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=TAIPEI_TZ)

    return deadline.astimezone(TAIPEI_TZ)


def calculate_reminder_time(
    deadline,
    has_time,
    reminder_type,
):
    """
    計算提醒時間。

    有指定截止時間：
    依截止時間往前推算指定分鐘數。

    未指定截止時間：
    僅支援一天前、兩天前及一週前，
    並於對應日期上午 09:00 提醒。
    """

    minute_offset = REMINDER_MINUTE_OFFSETS.get(reminder_type)

    if minute_offset is None:
        return None

    if has_time:
        return deadline - timedelta(minutes=minute_offset)

    # 沒有截止時間時，30 分鐘、1 小時、2 小時沒有明確基準時間。
    if reminder_type in {
        "30_minutes",
        "1_hour",
        "2_hours",
    }:
        return None

    day_offset = minute_offset // (24 * 60)
    reminder_date = deadline.date() - timedelta(days=day_offset)

    return datetime.combine(
        reminder_date,
        time(hour=9, minute=0),
        tzinfo=TAIPEI_TZ,
    )


def is_reminder_due(reminder_time, now):
    """判斷提醒是否正處於可發送時間範圍。"""

    grace_end = reminder_time + timedelta(
        minutes=REMINDER_GRACE_MINUTES
    )

    return reminder_time <= now < grace_end


def format_deadline(deadline, has_time):
    """顯示台灣時間格式。"""

    if has_time:
        return deadline.strftime("%Y/%m/%d %H:%M")

    return deadline.strftime("%Y/%m/%d")


def build_reminder_message(
    task,
    deadline,
    reminder_type,
):
    """建立個人待辦 LINE 提醒文字。"""

    title = task.get("title") or "未命名任務"
    has_time = bool(task.get("has_time"))

    priority = PRIORITY_LABELS.get(
        task.get("priority"),
        "一般",
    )

    reminder_label = REMINDER_LABELS.get(
        reminder_type,
        reminder_type,
    )

    deadline_text = format_deadline(
        deadline,
        has_time,
    )

    return (
        "⏰ BEAST Workspace 待辦提醒\n\n"
        f"任務：{title}\n"
        f"截止：{deadline_text}\n"
        f"重要程度：{priority}\n"
        f"提醒類型：{reminder_label}"
    )


def process_task_reminders(now=None):
    """檢查並發送目前到期的個人待辦提醒。"""

    if not ADMIN_LINE_USER_ID:
        raise RuntimeError(
            "缺少 ADMIN_LINE_USER_ID，"
            "無法發送個人待辦提醒。"
        )

    now = now or datetime.now(TAIPEI_TZ)

    if now.tzinfo is None:
        now = now.replace(tzinfo=TAIPEI_TZ)
    else:
        now = now.astimezone(TAIPEI_TZ)

    tasks = get_active_tasks()

    checked_count = 0
    due_count = 0
    sent_count = 0
    failed_count = 0

    print("=================================")
    print("開始檢查個人待辦提醒")
    print("台灣時間：", now.isoformat())
    print("未完成待辦數：", len(tasks))
    print("=================================")

    for task in tasks:
        task_id = task.get("id")
        deadline = parse_deadline(
            task.get("deadline_at")
        )

        reminders = task.get("reminder_offsets") or []

        if not task_id or not deadline:
            continue

        if not isinstance(reminders, list):
            continue

        checked_count += 1

        for reminder_type in reminders:
            reminder_time = calculate_reminder_time(
                deadline=deadline,
                has_time=bool(task.get("has_time")),
                reminder_type=reminder_type,
            )

            if not reminder_time:
                continue

            if not is_reminder_due(
                reminder_time,
                now,
            ):
                continue

            due_count += 1

            delivery = claim_notification_delivery(
                source_type="personal_task",
                source_id=task_id,
                recipient_type="admin",
                recipient_line_user_id=(
                    ADMIN_LINE_USER_ID
                ),
                reminder_type=reminder_type,
                scheduled_at=reminder_time,
            )

            if not delivery:
                print(
                    "略過已處理提醒：",
                    task_id,
                    reminder_type,
                )
                continue

            try:
                message = build_reminder_message(
                    task=task,
                    deadline=deadline,
                    reminder_type=reminder_type,
                )

                send_line_message_to_user(
                    ADMIN_LINE_USER_ID,
                    message,
                )

                mark_notification_delivery_sent(
                    delivery["id"]
                )

                sent_count += 1

                print(
                    "提醒發送成功：",
                    task.get("title"),
                    reminder_type,
                    reminder_time.isoformat(),
                )

            except Exception as error:
                failed_count += 1

                mark_notification_delivery_failed(
                    delivery["id"],
                    error,
                )

                print(
                    "提醒發送失敗：",
                    task.get("title"),
                    type(error).__name__,
                    error,
                )

    print("=================================")
    print("提醒檢查完成")
    print("已檢查任務：", checked_count)
    print("本次到期提醒：", due_count)
    print("成功發送：", sent_count)
    print("發送失敗：", failed_count)
    print("=================================")

    return {
        "checked": checked_count,
        "due": due_count,
        "sent": sent_count,
        "failed": failed_count,
    }


def main():
    process_task_reminders()


if __name__ == "__main__":
    main()