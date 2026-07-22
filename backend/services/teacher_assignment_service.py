from datetime import datetime, timezone

from services.teacher_service import supabase


def get_teacher_assignments_by_teacher_id(teacher_id):
    """取得指定老師尚未經主管確認的有效任務。"""

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
    老師透過 LINE 回報完成自己的任務。

    只允許更新：
    1. 這個 LINE 已綁定的老師
    2. 該老師自己的 teacher_assignment_members 紀錄
    3. 尚未經主管確認的有效任務
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

    if assignment.get("status") != "active":
        return None

    if member.get("admin_confirmed"):
        return None

    title = assignment.get("title") or "未命名任務"

    if member.get("teacher_completed"):
        return {
            "already_completed": True,
            "member": member,
            "title": title,
        }

    completed_at = datetime.now(timezone.utc).isoformat()

    updated_response = (
        supabase
        .table("teacher_assignment_members")
        .update(
            {
                "teacher_completed": True,
                "teacher_completed_at": completed_at,
                "admin_confirmed": False,
                "admin_confirmed_at": None,
            }
        )
        .eq("id", member_id)
        .eq("teacher_id", teacher_id)
        .eq("teacher_completed", False)
        .eq("admin_confirmed", False)
        .execute()
    )

    updated_rows = updated_response.data or []

    if not updated_rows:
        return None

    return {
        "already_completed": False,
        "member": updated_rows[0],
        "title": title,
    }


def complete_teacher_assignment_by_member_id(member_id):
    """老師從 Workspace 網頁回報完成任務。"""

    member_response = (
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
        .eq("id", member_id)
        .limit(1)
        .execute()
    )

    members = member_response.data or []

    if not members:
        return None

    member = members[0]
    assignment = member.get("teacher_assignments") or {}
    teacher = member.get("teachers") or {}

    if assignment.get("status") != "active":
        return None

    if member.get("admin_confirmed"):
        return None

    title = assignment.get("title") or "未命名任務"

    if member.get("teacher_completed"):
        return {
            "already_completed": True,
            "member": member,
            "teacher": teacher,
            "title": title,
        }

    completed_at = datetime.now(timezone.utc).isoformat()

    updated_response = (
        supabase
        .table("teacher_assignment_members")
        .update(
            {
                "teacher_completed": True,
                "teacher_completed_at": completed_at,
                "admin_confirmed": False,
                "admin_confirmed_at": None,
            }
        )
        .eq("id", member_id)
        .eq("teacher_completed", False)
        .eq("admin_confirmed", False)
        .execute()
    )

    updated_rows = updated_response.data or []

    if not updated_rows:
        return None

    return {
        "already_completed": False,
        "member": updated_rows[0],
        "teacher": teacher,
        "title": title,
    }


def confirm_teacher_assignment_by_admin(member_id):
    """主管透過 LINE 確認老師完成任務。"""

    member_response = (
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
        .eq("id", member_id)
        .limit(1)
        .execute()
    )

    members = member_response.data or []

    if not members:
        return None

    member = members[0]
    teacher = member.get("teachers") or {}
    assignment = member.get("teacher_assignments") or {}

    title = assignment.get("title") or "未命名任務"

    teacher_name = (
        teacher.get("chinese_name")
        or teacher.get("english_name")
        or "老師"
    )

    if assignment.get("status") != "active":
        return None

    if not member.get("teacher_completed"):
        return {
            "success": False,
            "reason": "teacher_not_completed",
            "member": member,
            "title": title,
            "teacher_name": teacher_name,
        }

    if member.get("admin_confirmed"):
        return {
            "success": True,
            "already_confirmed": True,
            "member": member,
            "title": title,
            "teacher_name": teacher_name,
        }

    confirmed_at = datetime.now(timezone.utc).isoformat()

    updated_response = (
        supabase
        .table("teacher_assignment_members")
        .update(
            {
                "admin_confirmed": True,
                "admin_confirmed_at": confirmed_at,
            }
        )
        .eq("id", member_id)
        .eq("teacher_completed", True)
        .eq("admin_confirmed", False)
        .execute()
    )

    updated_rows = updated_response.data or []

    if not updated_rows:
        return None

    return {
        "success": True,
        "already_confirmed": False,
        "member": updated_rows[0],
        "title": title,
        "teacher_name": teacher_name,
    }