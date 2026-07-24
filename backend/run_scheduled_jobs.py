import os
from datetime import datetime, time

from dotenv import load_dotenv
from zoneinfo import ZoneInfo

from services.line_service import send_line_message_to_user
from services.message_service import build_daily_task_message
from services.task_service import (
    claim_notification_delivery,
    get_active_tasks,
    mark_notification_delivery_failed,
    mark_notification_delivery_sent,
)
from send_task_reminders import process_task_reminders


load_dotenv()

ADMIN_LINE_USER_ID = os.getenv("ADMIN_LINE_USER_ID")

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def send_morning_report_if_due(now=None):
    """台灣時間 09:00～09:09 之間，晨報每天只發送一次。"""

    if not ADMIN_LINE_USER_ID:
        raise RuntimeError(
            "缺少 ADMIN_LINE_USER_ID，無法發送晨報。"
        )

    now = now or datetime.now(TAIPEI_TZ)

    if now.tzinfo is None:
        now = now.replace(tzinfo=TAIPEI_TZ)
    else:
        now = now.astimezone(TAIPEI_TZ)

    window_start = datetime.combine(
        now.date(),
        time(hour=9, minute=0),
        tzinfo=TAIPEI_TZ,
    )

    window_end = datetime.combine(
        now.date(),
        time(hour=9, minute=10),
        tzinfo=TAIPEI_TZ,
    )

    if not window_start <= now < window_end:
        print("目前不是台灣晨報發送時段。")
        return {
            "due": False,
            "sent": False,
        }

    delivery = claim_notification_delivery(
        source_type="daily_report",
        source_id=now.date().isoformat(),
        recipient_type="admin",
        recipient_line_user_id=ADMIN_LINE_USER_ID,
        reminder_type="morning_report",
        scheduled_at=window_start,
    )

    if not delivery:
        print("今日晨報已發送或正在處理，略過。")
        return {
            "due": True,
            "sent": False,
        }

    try:
        tasks = get_active_tasks()
        message = build_daily_task_message(tasks)

        send_line_message_to_user(
            ADMIN_LINE_USER_ID,
            message,
        )

        mark_notification_delivery_sent(
            delivery["id"]
        )

        print("今日晨報發送成功。")

        return {
            "due": True,
            "sent": True,
        }

    except Exception as error:
        mark_notification_delivery_failed(
            delivery["id"],
            error,
        )

        print(
            "今日晨報發送失敗：",
            type(error).__name__,
            error,
        )

        return {
            "due": True,
            "sent": False,
        }


def main():
    now = datetime.now(TAIPEI_TZ)

    print("=================================")
    print("BEAST Workspace 雲端排程開始")
    print("台灣時間：", now.isoformat())
    print("=================================")

    reminder_result = process_task_reminders(
        now=now
    )

    morning_result = send_morning_report_if_due(
        now=now
    )

    print("=================================")
    print("BEAST Workspace 雲端排程完成")
    print("待辦提醒結果：", reminder_result)
    print("晨報結果：", morning_result)
    print("=================================")


if __name__ == "__main__":
    main()