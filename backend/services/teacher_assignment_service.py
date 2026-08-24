from datetime import (
    datetime,
    timedelta,
    timezone,
)
from zoneinfo import ZoneInfo

from services.teacher_service import (
    supabase,
)


def create_teacher_assignment(
    title,
    description,
    deadline,
    priority,
    reminder_offsets,
    teacher_ids,
):
    """
    建立老師任務，
    並新增被指派老師的成員紀錄。
    """

    if not title or not title.strip():
        raise ValueError(
            "任務名稱不可空白"
        )

    if not teacher_ids:
        raise ValueError(
            "至少需要選擇一位老師"
        )

    assignment_payload = {
        "title":
            title.strip(),

        "description":
            (
                description.strip()
                if (
                    description
                    and
                    description.strip()
                )
                else None
            ),

        "deadline":
            deadline,

        "priority":
            priority or "normal",

        "status":
            "active",

        "reminder_offsets":
            reminder_offsets or [],
    }

    assignment_response = (
        supabase
        .table(
            "teacher_assignments"
        )
        .insert(
            [assignment_payload]
        )
        .execute()
    )

    assignment_rows = (
        assignment_response.data
        or []
    )

    if not assignment_rows:
        raise RuntimeError(
            "老師任務建立失敗"
        )

    assignment = (
        assignment_rows[0]
    )

    assignment_id = (
        assignment["id"]
    )

    unique_teacher_ids = (
        list(
            dict.fromkeys(
                teacher_ids
            )
        )
    )

    member_payloads = [
        {
            "assignment_id":
                assignment_id,

            "teacher_id":
                teacher_id,

            "teacher_completed":
                False,

            "teacher_completed_at":
                None,

            "admin_confirmed":
                False,

            "admin_confirmed_at":
                None,
        }
        for teacher_id
        in unique_teacher_ids
    ]

    try:
        members_response = (
            supabase
            .table(
                "teacher_assignment_members"
            )
            .insert(
                member_payloads
            )
            .execute()
        )

    except Exception:
        (
            supabase
            .table(
                "teacher_assignments"
            )
            .delete()
            .eq(
                "id",
                assignment_id,
            )
            .execute()
        )

        raise

    members = (
        members_response.data
        or []
    )

    if not members:
        (
            supabase
            .table(
                "teacher_assignments"
            )
            .delete()
            .eq(
                "id",
                assignment_id,
            )
            .execute()
        )

        raise RuntimeError(
            "老師指派成員建立失敗"
        )

    return {
        "assignment":
            assignment,
        "members":
            members,
    }


def get_teacher_assignments_by_teacher_id(
    teacher_id,
):
    """
    取得指定老師尚未經主管確認的有效任務。

    用途：
    手動查看老師全部尚未正式完成的任務。

    注意：
    晨報不要使用這支。
    """

    response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            teacher_completed_at,
            admin_confirmed,
            admin_confirmed_at,
            teacher_assignments (
                id,
                title,
                description,
                deadline,
                priority,
                status,
                created_at
            )
            """
        )
        .eq(
            "teacher_id",
            teacher_id,
        )
        .eq(
            "admin_confirmed",
            False,
        )
        .execute()
    )

    rows = (
        response.data
        or []
    )

    active_rows = []

    for row in rows:
        assignment = (
            row.get(
                "teacher_assignments"
            )
            or {}
        )

        if (
            assignment.get(
                "status"
            )
            == "active"
        ):
            active_rows.append(
                row
            )

    def get_deadline(row):
        assignment = (
            row.get(
                "teacher_assignments"
            )
            or {}
        )

        return (
            assignment.get(
                "deadline"
            )
            or
            "9999-12-31T23:59:59+00:00"
        )

    return sorted(
        active_rows,
        key=get_deadline,
    )


def get_teacher_morning_assignments_by_teacher_id(
    teacher_id,
    now=None,
):
    """
    取得指定老師每日工作摘要要顯示的任務。

    規則：
    1. 只看該老師自己的任務。
    2. 尚未經主管確認。
    3. 任務仍為 active。
    4. 已逾期但尚未正式完成的任務保留。
    5. 顯示今天到下個月同日內的任務。
    6. 超過滾動一個月範圍的任務不顯示。
    7. 老師已回報但主管尚未確認者仍保留。
    """

    taipei_tz = ZoneInfo(
        "Asia/Taipei"
    )

    now = now or datetime.now(
        taipei_tz
    )

    if now.tzinfo is None:
        now = now.replace(
            tzinfo=taipei_tz
        )
    else:
        now = now.astimezone(
            taipei_tz
        )

    # 滾動一個月：
    # 例如 9/2 -> 10/2。
    # 若下個月沒有相同日期，
    # 則使用下個月最後一天。
    if now.month == 12:
        next_year = now.year + 1
        next_month = 1
    else:
        next_year = now.year
        next_month = now.month + 1

    from calendar import monthrange

    cutoff_day = min(
        now.day,
        monthrange(
            next_year,
            next_month,
        )[1],
    )

    cutoff_date = now.date().replace(
        year=next_year,
        month=next_month,
        day=cutoff_day,
    )

    all_assignments = (
        get_teacher_assignments_by_teacher_id(
            teacher_id
        )
    )

    morning_assignments = []

    for row in all_assignments:
        assignment = (
            row.get(
                "teacher_assignments"
            )
            or {}
        )

        deadline = (
            assignment.get(
                "deadline"
            )
        )

        if not deadline:
            continue

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
            continue

        if deadline_dt.tzinfo is None:
            deadline_dt = (
                deadline_dt.replace(
                    tzinfo=taipei_tz
                )
            )
        else:
            deadline_dt = (
                deadline_dt.astimezone(
                    taipei_tz
                )
            )

        if (
            deadline_dt.date()
            <= cutoff_date
        ):
            morning_assignments.append(
                row
            )

    return morning_assignments


def get_teacher_assignments_by_line_user_id(
    line_user_id,
):
    """
    依 LINE User ID
    查詢老師與其尚未正式完成的全部任務。

    這裡維持「全部任務」，
    不使用晨報的一個月範圍限制。
    """

    teacher_response = (
        supabase
        .table("teachers")
        .select(
            """
            id,
            chinese_name,
            english_name,
            position,
            line_user_id
            """
        )
        .eq(
            "line_user_id",
            line_user_id,
        )
        .limit(1)
        .execute()
    )

    teachers = (
        teacher_response.data
        or []
    )

    if not teachers:
        return {
            "teacher": None,
            "assignments": [],
        }

    teacher = teachers[0]

    assignments = (
        get_teacher_assignments_by_teacher_id(
            teacher["id"]
        )
    )

    return {
        "teacher":
            teacher,
        "assignments":
            assignments,
    }


def complete_teacher_assignment_by_line_user_id(
    member_id,
    line_user_id,
):
    """
    老師透過 LINE
    回報完成自己的任務。

    只允許更新：
    1. 這個 LINE 已綁定的老師。
    2. 該老師自己的成員紀錄。
    3. 尚未經主管確認的有效任務。
    """

    teacher_response = (
        supabase
        .table("teachers")
        .select("id")
        .eq(
            "line_user_id",
            line_user_id,
        )
        .limit(1)
        .execute()
    )

    teachers = (
        teacher_response.data
        or []
    )

    if not teachers:
        return None

    teacher_id = (
        teachers[0]["id"]
    )

    member_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            teacher_completed_at,
            admin_confirmed,
            admin_confirmed_at,
            teacher_assignments (
                id,
                title,
                status
            )
            """
        )
        .eq(
            "id",
            member_id,
        )
        .eq(
            "teacher_id",
            teacher_id,
        )
        .limit(1)
        .execute()
    )

    members = (
        member_response.data
        or []
    )

    if not members:
        return None

    member = members[0]

    assignment = (
        member.get(
            "teacher_assignments"
        )
        or {}
    )

    if (
        assignment.get(
            "status"
        )
        != "active"
    ):
        return None

    if member.get(
        "admin_confirmed"
    ):
        return None

    title = (
        assignment.get(
            "title"
        )
        or "未命名任務"
    )

    if member.get(
        "teacher_completed"
    ):
        return {
            "already_completed":
                True,
            "member":
                member,
            "title":
                title,
        }

    completed_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    updated_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .update(
            {
                "teacher_completed":
                    True,

                "teacher_completed_at":
                    completed_at,

                "admin_confirmed":
                    False,

                "admin_confirmed_at":
                    None,
            }
        )
        .eq(
            "id",
            member_id,
        )
        .eq(
            "teacher_id",
            teacher_id,
        )
        .eq(
            "teacher_completed",
            False,
        )
        .eq(
            "admin_confirmed",
            False,
        )
        .execute()
    )

    updated_rows = (
        updated_response.data
        or []
    )

    if not updated_rows:
        return None

    return {
        "already_completed":
            False,
        "member":
            updated_rows[0],
        "title":
            title,
    }


def complete_teacher_assignment_by_member_id(
    member_id,
):
    """
    老師從 Workspace 網頁
    回報完成任務。
    """

    member_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            teacher_completed_at,
            admin_confirmed,
            admin_confirmed_at,
            teachers (
                id,
                chinese_name,
                english_name
            ),
            teacher_assignments (
                id,
                title,
                status
            )
            """
        )
        .eq(
            "id",
            member_id,
        )
        .limit(1)
        .execute()
    )

    members = (
        member_response.data
        or []
    )

    if not members:
        return None

    member = members[0]

    assignment = (
        member.get(
            "teacher_assignments"
        )
        or {}
    )

    teacher = (
        member.get(
            "teachers"
        )
        or {}
    )

    if (
        assignment.get(
            "status"
        )
        != "active"
    ):
        return None

    if member.get(
        "admin_confirmed"
    ):
        return None

    title = (
        assignment.get(
            "title"
        )
        or "未命名任務"
    )

    if member.get(
        "teacher_completed"
    ):
        return {
            "already_completed":
                True,
            "member":
                member,
            "teacher":
                teacher,
            "title":
                title,
        }

    completed_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    updated_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .update(
            {
                "teacher_completed":
                    True,

                "teacher_completed_at":
                    completed_at,

                "admin_confirmed":
                    False,

                "admin_confirmed_at":
                    None,
            }
        )
        .eq(
            "id",
            member_id,
        )
        .eq(
            "teacher_completed",
            False,
        )
        .eq(
            "admin_confirmed",
            False,
        )
        .execute()
    )

    updated_rows = (
        updated_response.data
        or []
    )

    if not updated_rows:
        return None

    return {
        "already_completed":
            False,
        "member":
            updated_rows[0],
        "teacher":
            teacher,
        "title":
            title,
    }


def confirm_teacher_assignment_by_admin(
    member_id,
):
    """
    主管透過 LINE
    確認老師完成任務。
    """

    member_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            teacher_completed_at,
            admin_confirmed,
            admin_confirmed_at,
            teachers (
                id,
                chinese_name,
                english_name
            ),
            teacher_assignments (
                id,
                title,
                status
            )
            """
        )
        .eq(
            "id",
            member_id,
        )
        .limit(1)
        .execute()
    )

    members = (
        member_response.data
        or []
    )

    if not members:
        return None

    member = members[0]

    teacher = (
        member.get(
            "teachers"
        )
        or {}
    )

    assignment = (
        member.get(
            "teacher_assignments"
        )
        or {}
    )

    title = (
        assignment.get(
            "title"
        )
        or "未命名任務"
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
        assignment.get(
            "status"
        )
        != "active"
    ):
        return None

    if not member.get(
        "teacher_completed"
    ):
        return {
            "success":
                False,
            "reason":
                "teacher_not_completed",
            "member":
                member,
            "title":
                title,
            "teacher_name":
                teacher_name,
        }

    if member.get(
        "admin_confirmed"
    ):
        return {
            "success":
                True,
            "already_confirmed":
                True,
            "member":
                member,
            "title":
                title,
            "teacher_name":
                teacher_name,
        }

    confirmed_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    updated_response = (
        supabase
        .table(
            "teacher_assignment_members"
        )
        .update(
            {
                "admin_confirmed":
                    True,

                "admin_confirmed_at":
                    confirmed_at,
            }
        )
        .eq(
            "id",
            member_id,
        )
        .eq(
            "teacher_completed",
            True,
        )
        .eq(
            "admin_confirmed",
            False,
        )
        .execute()
    )

    updated_rows = (
        updated_response.data
        or []
    )

    if not updated_rows:
        return None

    return {
        "success":
            True,
        "already_confirmed":
            False,
        "member":
            updated_rows[0],
        "title":
            title,
        "teacher_name":
            teacher_name,
    }