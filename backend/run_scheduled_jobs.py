import os
from calendar import monthrange
from datetime import datetime, timedelta, time

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
    get_today_cleaning_by_teacher_id,
    get_today_makeups_by_teacher_id,
    get_upcoming_calendar_events,
    get_makeup_source_name,
)


load_dotenv()

ADMIN_LINE_USER_ID = os.getenv(
    "ADMIN_LINE_USER_ID"
)

TAIPEI_TZ = ZoneInfo(
    "Asia/Taipei"
)


def get_admin_morning_window(now):
    """
    主管晨報維持每天 09:00～09:09。
    """
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


def get_teacher_report_window(now):
    """
    老師每日工作摘要發送時間：

    週一、週二、週四：13:00～13:09
    週三、週五：11:30～11:39
    週六、週日：不發送
    """

    weekday = now.weekday()

    # Monday=0, Tuesday=1, Wednesday=2,
    # Thursday=3, Friday=4, Saturday=5, Sunday=6
    if weekday in (
        0,
        1,
        3,
    ):
        report_time = time(
            hour=13,
            minute=0,
        )

    elif weekday in (
        2,
        4,
    ):
        report_time = time(
            hour=11,
            minute=30,
        )

    else:
        return (
            None,
            None,
        )

    window_start = datetime.combine(
        now.date(),
        report_time,
        tzinfo=TAIPEI_TZ,
    )

    window_end = window_start.replace(
        minute=(
            window_start.minute
            + 10
        )
    )

    return (
        window_start,
        window_end,
    )


def get_upcoming_month_end(now):
    """
    取得「下個月同日」作為未來一個月行事的結束日。

    例如：
    9/2 -> 10/2

    若下個月沒有相同日期：
    1/31 -> 2/28（閏年則 2/29）
    """

    if now.month == 12:
        next_year = (
            now.year + 1
        )
        next_month = 1
    else:
        next_year = now.year
        next_month = (
            now.month + 1
        )

    last_day = monthrange(
        next_year,
        next_month,
    )[1]

    next_day = min(
        now.day,
        last_day,
    )

    return now.replace(
        year=next_year,
        month=next_month,
        day=next_day,
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



MAKEUP_REMINDER_GRACE_MINUTES = 10

MAKEUP_REMINDERS = {
    "makeup_2_hours": {
        "minutes": 120,
        "headline": "🎒 補課提醒｜2 小時後",
        "label": "2 小時",
    },
    "makeup_30_minutes": {
        "minutes": 30,
        "headline": "🔔 補課即將開始｜30 分鐘後",
        "label": "30 分鐘",
    },
}


def parse_makeup_start_datetime(
    makeup_date,
    start_time,
):
    """
    將補課日期與時間明確組成 Asia/Taipei 時區時間。

    makeup_date 預期為 YYYY-MM-DD。
    start_time 可接受 HH:MM、HH:MM:SS。
    """

    if not makeup_date or not start_time:
        return None

    try:
        date_value = datetime.strptime(
            str(makeup_date),
            "%Y-%m-%d",
        ).date()

        time_text = str(
            start_time
        ).strip()

        parsed_time = None

        for time_format in (
            "%H:%M:%S",
            "%H:%M",
        ):
            try:
                parsed_time = datetime.strptime(
                    time_text,
                    time_format,
                ).time()
                break
            except ValueError:
                continue

        if parsed_time is None:
            return None

        return datetime.combine(
            date_value,
            parsed_time,
            tzinfo=TAIPEI_TZ,
        )

    except (
        TypeError,
        ValueError,
    ):
        return None


def is_makeup_reminder_due(
    reminder_time,
    now,
):
    """
    排程晚幾分鐘執行時仍可補送，
    但不補送超過 10 分鐘以前的提醒。
    """

    grace_end = (
        reminder_time
        + timedelta(
            minutes=(
                MAKEUP_REMINDER_GRACE_MINUTES
            )
        )
    )

    return (
        reminder_time
        <= now
        < grace_end
    )


def build_makeup_reminder_message(
    makeup,
    makeup_start,
    reminder_config,
):
    student = (
        makeup.get("students")
        or {}
    )

    student_name = (
        student.get("chinese_name")
        or student.get("english_name")
        or "未命名學生"
    )

    source_name = (
        get_makeup_source_name(
            makeup
        )
    )

    note = str(
        makeup.get("note")
        or ""
    ).strip()

    lines = [
        reminder_config[
            "headline"
        ],
        "",
        (
            f"{makeup_start.strftime('%H:%M')} "
            f"{student_name}｜{source_name}"
        ),
    ]

    if note:
        lines.append(
            f"備註：{note}"
        )

    lines.extend(
        [
            "",
            "請協助提醒孩子準備前往補課。",
        ]
    )

    return "\n".join(lines)


def process_makeup_reminders(
    now=None,
):
    """
    發送補課前 2 小時與前 30 分鐘 LINE 提醒。

    所有時間一律以 Asia/Taipei 判斷。
    每筆補課、每位通知老師、每個提醒時間只會成功發送一次。
    """

    now = normalize_taipei_time(
        now
    )

    today_date = (
        now.date().isoformat()
    )

    teachers = (
        get_active_line_teachers()
    )

    checked_count = 0
    due_count = 0
    sent_count = 0
    skipped_count = 0
    failed_count = 0

    print(
        "================================="
    )
    print(
        "開始檢查補課即時提醒"
    )
    print(
        "台灣時間：",
        now.isoformat(),
    )
    print(
        "================================="
    )

    for teacher in teachers:
        teacher_id = (
            teacher.get("id")
        )

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

        if (
            not teacher_id
            or not line_user_id
        ):
            continue

        try:
            makeups = (
                get_today_makeups_by_teacher_id(
                    teacher_id,
                    today_date,
                )
            )

            for makeup in makeups:
                makeup_id = (
                    makeup.get("id")
                )

                makeup_start = (
                    parse_makeup_start_datetime(
                        makeup.get(
                            "makeup_date"
                        ),
                        makeup.get(
                            "start_time"
                        ),
                    )
                )

                if (
                    not makeup_id
                    or not makeup_start
                ):
                    continue

                checked_count += 1

                for (
                    reminder_type,
                    reminder_config,
                ) in MAKEUP_REMINDERS.items():
                    reminder_time = (
                        makeup_start
                        - timedelta(
                            minutes=(
                                reminder_config[
                                    "minutes"
                                ]
                            )
                        )
                    )

                    if not is_makeup_reminder_due(
                        reminder_time,
                        now,
                    ):
                        continue

                    due_count += 1

                    delivery = (
                        claim_notification_delivery(
                            source_type=(
                                "makeup_class"
                            ),
                            source_id=(
                                makeup_id
                            ),
                            recipient_type=(
                                "teacher"
                            ),
                            recipient_line_user_id=(
                                line_user_id
                            ),
                            reminder_type=(
                                reminder_type
                            ),
                            scheduled_at=(
                                reminder_time
                            ),
                        )
                    )

                    if not delivery:
                        skipped_count += 1

                        print(
                            "補課提醒略過：",
                            teacher_name,
                            makeup_id,
                            reminder_type,
                        )

                        continue

                    try:
                        message = (
                            build_makeup_reminder_message(
                                makeup=(
                                    makeup
                                ),
                                makeup_start=(
                                    makeup_start
                                ),
                                reminder_config=(
                                    reminder_config
                                ),
                            )
                        )

                        send_line_message_to_user(
                            line_user_id,
                            message,
                        )

                        mark_notification_delivery_sent(
                            delivery[
                                "id"
                            ]
                        )

                        sent_count += 1

                        print(
                            "補課提醒發送成功：",
                            teacher_name,
                            makeup_id,
                            reminder_type,
                            reminder_time.isoformat(),
                        )

                    except Exception as error:
                        failed_count += 1

                        mark_notification_delivery_failed(
                            delivery[
                                "id"
                            ],
                            error,
                        )

                        print(
                            "補課提醒發送失敗：",
                            teacher_name,
                            makeup_id,
                            reminder_type,
                            type(error).__name__,
                            error,
                        )

        except Exception as error:
            failed_count += 1

            print(
                "補課提醒資料整理失敗：",
                teacher_name,
                type(error).__name__,
                error,
            )

    print(
        "================================="
    )
    print(
        "補課即時提醒檢查完成"
    )
    print(
        "已檢查補課：",
        checked_count,
    )
    print(
        "本次到期提醒：",
        due_count,
    )
    print(
        "成功發送：",
        sent_count,
    )
    print(
        "略過重複：",
        skipped_count,
    )
    print(
        "發送失敗：",
        failed_count,
    )
    print(
        "================================="
    )

    return {
        "checked": checked_count,
        "due": due_count,
        "sent": sent_count,
        "skipped": skipped_count,
        "failed": failed_count,
    }

def send_morning_report_if_due(
    now=None,
):
    """
    主管個人晨報。

    台灣時間 09:00～09:09 之間，
    每天只發送一次。

    主管晨報與老師每日工作摘要分開排程。
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
    ) = get_admin_morning_window(
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
    老師每日工作摘要。

    發送時間：
    週一、週二、週四 13:00
    週三、週五 11:30
    週六、週日不發。

    每位老師只取得：
    1. 自己晨報範圍內或已逾期的老師任務
    2. notify_teacher_id 指定給自己的今日補課
    3. 自己今天的清潔任務
    4. 未來一個月、已開啟晨報的行事曆事件

    老師已回報但主管尚未確認的任務仍保留，
    直到主管確認才正式結案。
    """

    now = normalize_taipei_time(
        now
    )

    (
        window_start,
        window_end,
    ) = get_teacher_report_window(
        now
    )

    if (
        window_start is None
        or window_end is None
    ):
        print(
            "今天是週末，"
            "不發送老師每日工作摘要。"
        )

        return {
            "due": False,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
        }

    if not (
        window_start
        <= now
        < window_end
    ):
        print(
            "目前不是台灣老師每日工作摘要發送時段。"
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

    upcoming_end = (
        get_upcoming_month_end(
            now
        )
        .date()
        .isoformat()
    )

    upcoming_events = (
        get_upcoming_calendar_events(
            today_date,
            upcoming_end,
        )
    )

    teachers = (
        get_active_line_teachers()
    )

    sent_count = 0
    skipped_count = 0
    failed_count = 0

    print(
        f"老師每日工作摘要：找到 "
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

            cleaning_tasks = (
                get_today_cleaning_by_teacher_id(
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
                        "teacher_daily_report"
                    ),
                    scheduled_at=(
                        window_start
                    ),
                )
            )

            if not delivery:
                skipped_count += 1

                print(
                    f"老師每日工作摘要略過："
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
                        cleaning_tasks=(
                            cleaning_tasks
                        ),
                        calendar_events=(
                            upcoming_events
                        ),
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
                    f"老師每日工作摘要發送成功："
                    f"{teacher_name}"
                )

            except Exception as error:
                mark_notification_delivery_failed(
                    delivery["id"],
                    error,
                )

                failed_count += 1

                print(
                    f"老師每日工作摘要發送失敗："
                    f"{teacher_name}",
                    type(error).__name__,
                    error,
                )

        except Exception as error:
            failed_count += 1

            print(
                f"老師每日工作摘要資料整理失敗："
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

    makeup_reminder_result = (
        process_makeup_reminders(
            now=now
        )
    )

    admin_morning_result = (
        send_morning_report_if_due(
            now=now
        )
    )

    teacher_report_result = (
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
        "補課即時提醒結果：",
        makeup_reminder_result,
    )
    print(
        "主管晨報結果：",
        admin_morning_result,
    )
    print(
        "老師每日工作摘要結果：",
        teacher_report_result,
    )
    print(
        "================================="
    )


if __name__ == "__main__":
    main()