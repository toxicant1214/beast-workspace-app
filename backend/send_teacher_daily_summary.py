from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from services.teacher_service import supabase
from services.teacher_assignment_service import (
    get_teacher_morning_assignments_by_teacher_id,
)
from services.line_service import (
    send_line_message_to_user,
)


load_dotenv()

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def get_active_line_teachers():
    response = (
        supabase
        .table("teachers")
        .select(
            """
            id,
            chinese_name,
            english_name,
            status,
            line_user_id
            """
        )
        .eq("status", "active")
        .execute()
    )

    rows = response.data or []

    return [
        teacher
        for teacher in rows
        if teacher.get("line_user_id")
    ]


def get_today_makeups_by_teacher_id(
    teacher_id,
    today_date,
):
    response = (
        supabase
        .table("makeup_classes")
        .select(
            """
            id,
            student_id,
            makeup_type,
            english_class_id,
            course_class_id,
            makeup_date,
            start_time,
            end_time,
            notify_teacher_id,
            status,
            note,
            reschedule_count,
            students (
                id,
                chinese_name,
                english_name
            ),
            english_classes (
                id,
                class_name
            ),
            course_classes (
                id,
                class_name,
                courses (
                    id,
                    course_name
                )
            )
            """
        )
        .eq(
            "notify_teacher_id",
            teacher_id,
        )
        .eq(
            "makeup_date",
            today_date,
        )
        .neq(
            "status",
            "CANCELLED",
        )
        .order(
            "start_time",
            desc=False,
        )
        .execute()
    )

    return response.data or []


def get_today_cleaning_by_teacher_id(
    teacher_id,
    today_date,
):
    task_response = (
        supabase
        .table("cleaning_tasks")
        .select(
            """
            id,
            cleaning_item_id,
            cleaning_rule_id,
            teacher_id,
            task_date,
            status,
            note
            """
        )
        .eq(
            "teacher_id",
            teacher_id,
        )
        .eq(
            "task_date",
            today_date,
        )
        .execute()
    )

    tasks = task_response.data or []

    if not tasks:
        return []

    item_ids = list(
        dict.fromkeys(
            task.get("cleaning_item_id")
            for task in tasks
            if task.get("cleaning_item_id")
        )
    )

    item_map = {}

    if item_ids:
        item_response = (
            supabase
            .table("cleaning_items")
            .select(
                """
                id,
                name
                """
            )
            .in_(
                "id",
                item_ids,
            )
            .execute()
        )

        item_map = {
            item["id"]: item
            for item in (
                item_response.data
                or []
            )
        }

    result = []

    for task in tasks:
        item = item_map.get(
            task.get(
                "cleaning_item_id"
            )
        ) or {}

        result.append(
            {
                **task,
                "cleaning_item_name":
                    item.get("name")
                    or "清潔工作",
            }
        )

    return result


def get_upcoming_calendar_events(
    start_date,
    end_date,
):
    """
    取得每日工作摘要最下方要顯示的未來行事。

    只顯示有開啟晨報的 NOTICE 行事曆事件，
    並抓今天到指定結束日之間的事件。

    TASK 已經顯示在上方老師任務區，
    因此不再重複列入「未來一個月行事」。
    """

    response = (
        supabase
        .table("calendar_school_events")
        .select(
            """
            id,
            title,
            start_date,
            end_date,
            category,
            morning_brief_enabled,
            reminder_type
            """
        )
        .eq(
            "morning_brief_enabled",
            True,
        )
        .eq(
            "reminder_type",
            "NOTICE",
        )
        .gte(
            "start_date",
            start_date,
        )
        .lte(
            "start_date",
            end_date,
        )
        .order(
            "start_date",
            desc=False,
        )
        .execute()
    )

    return response.data or []


def format_time(time_string):
    if not time_string:
        return ""

    return str(time_string)[:5]


def get_makeup_source_name(item):
    if item.get("makeup_type") == "ENGLISH":
        english_class = (
            item.get("english_classes")
            or {}
        )

        return (
            english_class.get("class_name")
            or "美語補課"
        )

    course_class = (
        item.get("course_classes")
        or {}
    )

    course = (
        course_class.get("courses")
        or {}
    )

    course_name = course.get("course_name")
    class_name = course_class.get("class_name")

    parts = [
        value
        for value in [
            course_name,
            class_name,
        ]
        if value
    ]

    return (
        "・".join(parts)
        or "才藝補課"
    )


def split_teacher_assignments(
    assignments,
    now,
):
    overdue = []
    pending = []
    waiting_confirm = []

    for member in assignments:
        assignment = (
            member.get(
                "teacher_assignments"
            )
            or {}
        )

        deadline = assignment.get(
            "deadline"
        )

        deadline_dt = None

        if deadline:
            try:
                deadline_dt = (
                    datetime.fromisoformat(
                        str(
                            deadline
                        ).replace(
                            "Z",
                            "+00:00",
                        )
                    )
                )
            except ValueError:
                deadline_dt = None

        if (
            deadline_dt
            and deadline_dt.tzinfo is None
        ):
            deadline_dt = deadline_dt.replace(
                tzinfo=TAIPEI_TZ
            )
        elif deadline_dt:
            deadline_dt = deadline_dt.astimezone(
                TAIPEI_TZ
            )

        if member.get(
            "teacher_completed"
        ):
            waiting_confirm.append(
                member
            )
            continue

        if (
            deadline_dt
            and deadline_dt < now
        ):
            overdue.append(
                member
            )
        else:
            pending.append(
                member
            )

    return (
        overdue,
        pending,
        waiting_confirm,
    )


def format_assignment_line(
    member,
):
    assignment = (
        member.get(
            "teacher_assignments"
        )
        or {}
    )

    title = (
        assignment.get("title")
        or "未命名任務"
    )

    deadline = (
        assignment.get("deadline")
        or ""
    )

    deadline_text = ""

    if deadline:
        try:
            deadline_dt = datetime.fromisoformat(
                str(deadline).replace(
                    "Z",
                    "+00:00",
                )
            )

            deadline_text = (
                deadline_dt.strftime(
                    "%m/%d"
                )
            )

        except ValueError:
            raw_deadline = str(deadline)[:10]

            if len(raw_deadline) >= 10:
                deadline_text = (
                    raw_deadline[5:].replace(
                        "-",
                        "/",
                    )
                )
            else:
                deadline_text = raw_deadline

    if deadline_text:
        return (
            f"・{deadline_text} "
            f"{title}"
        )

    return f"・{title}"


def build_teacher_daily_summary(
    teacher,
    assignments,
    makeups,
    cleaning_tasks,
    calendar_events,
    today,
):
    teacher_name = (
        teacher.get("chinese_name")
        or teacher.get("english_name")
        or "老師"
    )

    (
        overdue_assignments,
        pending_assignments,
        waiting_confirm_assignments,
    ) = split_teacher_assignments(
        assignments,
        today,
    )

    lines = [
        f"☀️ {today.strftime('%m/%d')} 今日工作摘要",
        "",
        f"{teacher_name}老師您好：",
    ]

    if overdue_assignments:
        lines.extend(
            [
                "",
                "⚠️ 逾期未完成",
            ]
        )

        for member in overdue_assignments:
            lines.append(
                format_assignment_line(
                    member
                )
            )

    if pending_assignments:
        lines.extend(
            [
                "",
                "📌 近期任務",
            ]
        )

        for member in pending_assignments:
            lines.append(
                format_assignment_line(
                    member
                )
            )

    if waiting_confirm_assignments:
        lines.extend(
            [
                "",
                "⏳ 已回報・待主管確認",
            ]
        )

        for member in waiting_confirm_assignments:
            lines.append(
                format_assignment_line(
                    member
                )
            )

    if not assignments:
        lines.extend(
            [
                "",
                "📋 老師任務",
                "目前沒有需要追蹤的老師任務。",
            ]
        )

    lines.extend(
        [
            "",
            "🎒 今日補課",
        ]
    )

    if makeups:
        for item in makeups:
            student = (
                item.get("students")
                or {}
            )

            student_name = (
                student.get("chinese_name")
                or student.get("english_name")
                or "未命名學生"
            )

            time_text = format_time(
                item.get("start_time")
            )

            source_name = (
                get_makeup_source_name(
                    item
                )
            )

            rescheduled_mark = (
                "↻ "
                if int(
                    item.get(
                        "reschedule_count"
                    )
                    or 0
                ) > 0
                else ""
            )

            lines.append(
                f"・{rescheduled_mark}"
                f"{time_text} "
                f"{student_name}"
                f"｜{source_name}"
            )

        lines.extend(
            [
                "",
                "請於補課時間協助提醒學生前往上課。",
            ]
        )
    else:
        lines.append(
            "今天沒有補課安排。"
        )

    lines.extend(
        [
            "",
            "🧹 今日清潔",
        ]
    )

    if cleaning_tasks:
        for task in cleaning_tasks:
            item_name = (
                task.get(
                    "cleaning_item_name"
                )
                or "清潔工作"
            )

            lines.append(
                f"・{item_name}"
            )
    else:
        lines.append(
            "今日無輪值，請協助維持教室與個人區域整潔。"
        )

    lines.extend(
        [
            "",
            "📅 未來一個月行事",
        ]
    )

    if calendar_events:
        for event in calendar_events:
            start_date = (
                event.get(
                    "start_date"
                )
                or ""
            )

            end_date = (
                event.get(
                    "end_date"
                )
                or ""
            )

            title = (
                event.get("title")
                or "未命名行事"
            )

            if (
                end_date
                and end_date != start_date
            ):
                start_text = (
                    start_date[5:].replace(
                        "-",
                        "/",
                    )
                    if start_date
                    else ""
                )

                end_text = (
                    end_date[5:].replace(
                        "-",
                        "/",
                    )
                    if end_date
                    else ""
                )

                date_text = (
                    f"{start_text}"
                    f"～{end_text}"
                )
            else:
                date_text = (
                    start_date[5:].replace(
                        "-",
                        "/",
                    )
                    if start_date
                    else ""
                )

            lines.append(
                f"・{date_text} {title}"
            )
    else:
        lines.append(
            "目前沒有未來行事。"
        )

    return "\n".join(lines)


def main():
    now = datetime.now(
        TAIPEI_TZ
    )

    today_date = (
        now.date().isoformat()
    )

    if now.month == 12:
        next_month_year = (
            now.year + 1
        )
        next_month_number = 1
    else:
        next_month_year = now.year
        next_month_number = (
            now.month + 1
        )

    from calendar import monthrange

    next_month_day = min(
        now.day,
        monthrange(
            next_month_year,
            next_month_number,
        )[1],
    )

    upcoming_end = now.replace(
        year=next_month_year,
        month=next_month_number,
        day=next_month_day,
    )

    upcoming_events = (
        get_upcoming_calendar_events(
            today_date,
            upcoming_end.date().isoformat(),
        )
    )

    teachers = (
        get_active_line_teachers()
    )

    print(
        f"找到 {len(teachers)} 位"
        "在職且已綁定 LINE 的老師。"
    )

    for teacher in teachers:
        teacher_id = teacher["id"]

        line_user_id = (
            teacher.get(
                "line_user_id"
            )
        )

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

        message = (
            build_teacher_daily_summary(
                teacher=teacher,
                assignments=assignments,
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

        print(
            "發送老師每日工作摘要：",
            teacher.get(
                "chinese_name"
            ),
        )

        send_line_message_to_user(
            line_user_id,
            message,
        )


if __name__ == "__main__":
    main()