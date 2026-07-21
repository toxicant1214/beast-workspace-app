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