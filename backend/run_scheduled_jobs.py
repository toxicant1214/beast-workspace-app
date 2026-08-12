import os
from datetime import datetime, time

from dotenv import load_dotenv
from zoneinfo import ZoneInfo

from services.line_service import (
    send_line_message_to_user,
)
from services.message_service import (
    build_daily_task_message,
)
from services.task_service import (
    claim_notification_delivery,
    get_morning_report_tasks,
    mark_notification_delivery_failed,
    mark_notification_delivery_sent,
)
from services.teacher_assignment_service import (
    get_teacher_morning_assignments_by_teacher_id,
)
from send_task_reminders import (
    process_task_reminders,
)
from send_teacher_daily_summary import (
    build_teacher_daily_summary,
    get_active_line_teachers,
    get_today_makeups_by_teacher_id,
)


load_dotenv()

ADMIN_LINE_USER_ID = os.getenv(
    "ADMIN_LINE_USER_ID"
)

TAIPEI_TZ = ZoneInfo(
    "Asia/Taipei"
)


def get_morning_window(now):
    window_start = datetime.combine(
        now.date(),
        time(
            hour=9,
            minute=0,
        ),
        tzinfo=TAIPEI_TZ,
    )

    window_end = datetime.combine(
        now.date(),
        time(
            hour=9,
            minute=10,
        ),
        tzinfo=TAIPEI_TZ,
    )

    return (
        window_start,
        window_end,
    )


def normalize_taipei_time(now=None):
    now = now or datetime.now(
        TAIPEI_TZ
    )

    if now.tzinfo is None:
        return now.replace(
            tzinfo=TAIPEI_TZ
        )

    return now.astimezone(
        TAIPEI_TZ
    )


def send_morning_report_if_due(
    now=None,
):
    """
    主管個人晨報。

    台灣時間 09:00～09:09 之間，
    每天只發送一次。

    晨報只顯示：
    1. 已逾期但尚未完成的個人待辦
    2. 今天到未來 14 天內的未完成待辦

    手動查詢全部待辦不受影響。
    """

    if not ADMIN_LINE_USER_ID:
        raise RuntimeError(
            "缺少 ADMIN_LINE_USER_ID，"
            "無法發送晨報。"
        )

    now = normalize_taipei_time(
        now
    )

    (
        window_start,
        window_end,
    ) = get_morning_window(
        now
    )

    if not (
        window_start
        <= now
        < window_end
    ):
        print(
            "目前不是台灣主管晨報發送時段。"
        )

        return {
            "due": False,
            "sent": False,
        }

    delivery = (
        claim_notification_delivery(
            source_type="daily_report",
            source_id=(
                now.date().isoformat()
            ),
            recipient_type="admin",
            recipient_line_user_id=(
                ADMIN_LINE_USER_ID
            ),
            reminder_type=(
                "morning_report"
            ),
            scheduled_at=(
                window_start
            ),
        )
    )

    if not delivery:
        print(
            "今日主管晨報已發送"
            "或正在處理，略過。"
        )

        return {
            "due": True,
            "sent": False,
        }

    try:
        tasks = get_morning_report_tasks(
            now=now
        )

        message = (
            build_daily_task_message(
                tasks
            )
        )

        send_line_message_to_user(
            ADMIN_LINE_USER_ID,
            message,
        )

        mark_notification_delivery_sent(
            delivery["id"]
        )

        print(
            "今日主管晨報發送成功。"
        )

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
            "今日主管晨報發送失敗：",
            type(error).__name__,
            error,
        )

        return {
            "due": True,
            "sent": False,
        }


def send_teacher_reports_if_due(
    now=None,
):
    """
    老師專屬晨報。

    每位老師只取得：
    1. 自己兩週內或已逾期的老師任務
    2. notify_teacher_id 指定給自己的今日補課

    老師手動查詢全部自己的任務不受影響。
    不會查詢主管個人待辦。
    """

    now = normalize_taipei_time(
        now
    )

    (
        window_start,
        window_end,
    ) = get_morning_window(
        now
    )

    if not (
        window_start
        <= now
        < window_end
    ):
        print(
            "目前不是台灣老師晨報發送時段。"
        )

        return {
            "due": False,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
        }

    today_date = (
        now.date().isoformat()
    )

    teachers = (
        get_active_line_teachers()
    )

    sent_count = 0
    skipped_count = 0
    failed_count = 0

    print(
        f"老師晨報：找到 "
        f"{len(teachers)} 位"
        "在職且已綁定 LINE 的老師。"
    )

    for teacher in teachers:
        teacher_id = teacher["id"]

        line_user_id = (
            teacher.get(
                "line_user_id"
            )
        )

        teacher_name = (
            teacher.get(
                "chinese_name"
            )
            or teacher.get(
                "english_name"
            )
            or "老師"
        )

        try:
            assignments = (
                get_teacher_morning_assignments_by_teacher_id(
                    teacher_id,
                    now=now,
                )
            )

            makeups = (
                get_today_makeups_by_teacher_id(
                    teacher_id,
                    today_date,
                )
            )

            delivery = (
                claim_notification_delivery(
                    source_type=(
                        "teacher_daily_report"
                    ),
                    source_id=(
                        f"{today_date}:"
                        f"{teacher_id}"
                    ),
                    recipient_type=(
                        "teacher"
                    ),
                    recipient_line_user_id=(
                        line_user_id
                    ),
                    reminder_type=(
                        "teacher_morning_report"
                    ),
                    scheduled_at=(
                        window_start
                    ),
                )
            )

            if not delivery:
                skipped_count += 1

                print(
                    f"老師晨報略過："
                    f"{teacher_name} "
                    "今日已發送或正在處理。"
                )

                continue

            try:
                message = (
                    build_teacher_daily_summary(
                        teacher=teacher,
                        assignments=(
                            assignments
                        ),
                        makeups=makeups,
                        today=now,
                    )
                )

                send_line_message_to_user(
                    line_user_id,
                    message,
                )

                mark_notification_delivery_sent(
                    delivery["id"]
                )

                sent_count += 1

                print(
                    f"老師晨報發送成功："
                    f"{teacher_name}"
                )

            except Exception as error:
                mark_notification_delivery_failed(
                    delivery["id"],
                    error,
                )

                failed_count += 1

                print(
                    f"老師晨報發送失敗："
                    f"{teacher_name}",
                    type(error).__name__,
                    error,
                )

        except Exception as error:
            failed_count += 1

            print(
                f"老師晨報資料整理失敗："
                f"{teacher_name}",
                type(error).__name__,
                error,
            )

    return {
        "due": True,
        "sent": sent_count,
        "skipped": skipped_count,
        "failed": failed_count,
    }


def main():
    now = datetime.now(
        TAIPEI_TZ
    )

    print(
        "================================="
    )
    print(
        "BEAST Workspace 雲端排程開始"
    )
    print(
        "台灣時間：",
        now.isoformat(),
    )
    print(
        "================================="
    )

    reminder_result = (
        process_task_reminders(
            now=now
        )
    )

    admin_morning_result = (
        send_morning_report_if_due(
            now=now
        )
    )

    teacher_morning_result = (
        send_teacher_reports_if_due(
            now=now
        )
    )

    print(
        "================================="
    )
    print(
        "BEAST Workspace 雲端排程完成"
    )
    print(
        "待辦提醒結果：",
        reminder_result,
    )
    print(
        "主管晨報結果：",
        admin_morning_result,
    )
    print(
        "老師晨報結果：",
        teacher_morning_result,
    )
    print(
        "================================="
    )


if __name__ == "__main__":
    main()