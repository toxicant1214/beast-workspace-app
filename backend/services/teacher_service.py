import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_teacher_by_email(email):
    """用登入 Email 查找老師。"""

    normalized_email = email.strip().lower()

    response = (
        supabase
        .table("teachers")
        .select("*")
        .eq("email", normalized_email)
        .limit(1)
        .execute()
    )

    rows = response.data or []

    if not rows:
        return None

    return rows[0]


def get_teacher_by_line_user_id(line_user_id):
    """用 LINE User ID 查找已綁定老師。"""

    response = (
        supabase
        .table("teachers")
        .select("*")
        .eq("line_user_id", line_user_id)
        .limit(1)
        .execute()
    )

    rows = response.data or []

    if not rows:
        return None

    return rows[0]


def get_active_teachers():
    """取得可被指派任務的老師清單。"""

    response = (
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
        .order("chinese_name")
        .execute()
    )

    return response.data or []


def bind_teacher_line_user(teacher_id, line_user_id):
    """把老師資料與 LINE User ID 綁定。"""

    response = (
        supabase
        .table("teachers")
        .update({
            "line_user_id": line_user_id,
        })
        .eq("id", teacher_id)
        .execute()
    )

    rows = response.data or []

    if not rows:
        return None

    return rows[0]


def get_valid_teacher_binding_code(binding_code):
    """查詢尚未使用、尚未過期的老師 LINE 綁定碼。"""

    normalized_code = binding_code.strip().upper()

    response = (
        supabase
        .table("teacher_line_binding_codes")
        .select(
            """
            id,
            teacher_id,
            binding_code,
            expires_at,
            used_at,
            teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
            )
            """
        )
        .eq("binding_code", normalized_code)
        .is_("used_at", "null")
        .limit(1)
        .execute()
    )

    rows = response.data or []

    if not rows:
        return None

    binding = rows[0]

    expires_at = binding.get("expires_at")

    if not expires_at:
        return None

    expires_at_datetime = datetime.fromisoformat(
        expires_at.replace("Z", "+00:00")
    )

    if expires_at_datetime <= datetime.now(timezone.utc):
        return None

    return binding


def complete_teacher_line_binding(
    binding_id,
    teacher_id,
    line_user_id,
):
    """完成 LINE 綁定，並將綁定碼標記為已使用。"""

    teacher_response = (
        supabase
        .table("teachers")
        .update({
            "line_user_id": line_user_id,
        })
        .eq("id", teacher_id)
        .execute()
    )

    teacher_rows = teacher_response.data or []

    if not teacher_rows:
        raise RuntimeError("老師 LINE 綁定寫入失敗")

    code_response = (
        supabase
        .table("teacher_line_binding_codes")
        .update({
            "used_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", binding_id)
        .is_("used_at", "null")
        .execute()
    )

    code_rows = code_response.data or []

    if not code_rows:
        raise RuntimeError("綁定碼狀態更新失敗")

    return teacher_rows[0]