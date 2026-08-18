from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from services.teacher_service import supabase
from services.teacher_assignment_service import (
    get_teacher_assignments_by_teacher_id,
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
    """
    取得指定老師今天的清潔任務。

    cleaning_tasks 底層仍保留每位老師自己的任務，
    因此公共輪值、固定專責、共同任務都可以直接
    依 teacher_id + task_date 查詢。
    """

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


def build_teacher_daily_summary(
    teacher,
    assignments,
    makeups,
    cleaning_tasks,
    today,
):
    teacher_name = (
        teacher.get("chinese_name")
        or teacher.get("english_name")
        or "老師"
    )

    lines = [
        f"☀️ {today.strftime('%m/%d')} 今日工作摘要",
        "",
        f"{teacher_name}老師您好：",
        "",
        "📋 老師任務",
    ]

    if assignments:
        for member in assignments:
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
                deadline_text = (
                    f"｜{str(deadline)[:10]}"
                )

            if member.get(
                "teacher_completed"
            ):
                status_text = (
                    "等待主管確認"
                )
            else:
                status_text = (
                    "未完成"
                )

            lines.append(
                f"・{title}"
                f"{deadline_text}"
                f"｜{status_text}"
            )
    else:
        lines.append(
            "目前沒有未完成的老師任務。"
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

    return "\n".join(lines)


def main():
    now = datetime.now(
        TAIPEI_TZ
    )

    today_date = (
        now.date().isoformat()
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
            get_teacher_assignments_by_teacher_id(
                teacher_id
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
                today=now,
            )
        )

        print(
            "發送老師晨報：",
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