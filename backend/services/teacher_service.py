import os

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