from datetime import datetime, timezone

from services.teacher_service import supabase


def get_teacher_assignments_by_teacher_id(teacher_id):
    """取得指定老師尚未經主管確認的任務。"""

    response = (
        supabase
        .table("teacher_assignment_members")
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
        .eq("teacher_id", teacher_id)
        .eq("admin_confirmed", False)
        .execute()
    )

    rows = response.data or []

    active_rows = []

    for row in rows:
        assignment = row.get("teacher_assignments") or {}

        if assignment.get("status") == "active":
            active_rows.append(row)

    def get_deadline(row):
        assignment = row.get("teacher_assignments") or {}

        return (
            assignment.get("deadline")
            or "9999-12-31T23:59:59+00:00"
        )

    return sorted(active_rows, key=get_deadline)


def get_teacher_assignments_by_line_user_id(line_user_id):
    """依 LINE User ID 查詢老師與其尚未正式完成的任務。"""

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
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )

    teachers = teacher_response.data or []

    if not teachers:
        return {
            "teacher": None,
            "assignments": [],
        }

    teacher = teachers[0]

    assignments = get_teacher_assignments_by_teacher_id(
        teacher["id"]
    )

    return {
        "teacher": teacher,
        "assignments": assignments,
    }
def complete_teacher_assignment_by_line_user_id(
    member_id,
    line_user_id,
):
    """
    老師透過 LINE 完成自己的任務。

    只允許更新：
    1. 這個 LINE 已綁定的老師
    2. 該老師自己的 teacher_assignment_members 紀錄
    3. 尚未經主管確認的任務
    """

    teacher_response = (
        supabase
        .table("teachers")
        .select("id")
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )

    teachers = teacher_response.data or []

    if not teachers:
        return None

    teacher_id = teachers[0]["id"]

    member_response = (
        supabase
        .table("teacher_assignment_members")
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            admin_confirmed,
            teacher_assignments (
                id,
                title,
                status
            )
            """
        )
        .eq("id", member_id)
        .eq("teacher_id", teacher_id)
        .limit(1)
        .execute()
    )

    members = member_response.data or []

    if not members:
        return None

    member = members[0]
    assignment = member.get("teacher_assignments") or {}

    if member.get("admin_confirmed"):
        return None

    if assignment.get("status") != "active":
        return None

    if member.get("teacher_completed"):
        return member

    updated_response = (
        supabase
        .table("teacher_assignment_members")
        .update(
            {
                "teacher_completed": True,
                "teacher_completed_at": "now()",
            }
        )
        .eq("id", member_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )

    updated_rows = updated_response.data or []

    if not updated_rows:
        return None

    return updated_rows[0]
def complete_teacher_assignment_by_line_user_id(
    member_id,
    line_user_id,
):
    """老師透過 LINE 回報完成自己的任務。"""

    teacher_response = (
        supabase
        .table("teachers")
        .select("id")
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )

    teachers = teacher_response.data or []

    if not teachers:
        return None

    teacher_id = teachers[0]["id"]

    member_response = (
        supabase
        .table("teacher_assignment_members")
        .select(
            """
            id,
            teacher_id,
            teacher_completed,
            admin_confirmed,
            teacher_assignments (
                id,
                title,
                status
            )
            """
        )
        .eq("id", member_id)
        .eq("teacher_id", teacher_id)
        .limit(1)
        .execute()
    )

    members = member_response.data or []

    if not members:
        return None

    member = members[0]
    assignment = member.get("teacher_assignments") or {}

    if member.get("admin_confirmed"):
        return None

    if assignment.get("status") != "active":
        return None

    if member.get("teacher_completed"):
        return {
            "already_completed": True,
            "member": member,
            "title": assignment.get("title") or "未命名任務",
        }

    completed_at = datetime.now(timezone.utc).isoformat()

    updated_response = (
        supabase
        .table("teacher_assignment_members")
        .update(
            {
                "teacher_completed": True,
                "teacher_completed_at": completed_at,
            }
        )
        .eq("id", member_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )

    updated_rows = updated_response.data or []

    if not updated_rows:
        return None

    return {
        "already_completed": False,
        "member": updated_rows[0],
        "title": assignment.get("title") or "未命名任務",
    }