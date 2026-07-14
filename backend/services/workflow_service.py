import os

from dotenv import load_dotenv
from supabase import create_client


load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def start_workflow(line_user_id, flow_type, first_step):
    response = (
        supabase
        .table("line_workflows")
        .upsert({
            "line_user_id": line_user_id,
            "flow_type": flow_type,
            "current_step": first_step,
            "payload": {},
        }, on_conflict="line_user_id")
        .execute()
    )

    return response.data


def get_workflow(line_user_id):
    response = (
        supabase
        .table("line_workflows")
        .select("*")
        .eq("line_user_id", line_user_id)
        .maybe_single()
        .execute()
    )

    return response.data


def update_workflow(line_user_id, current_step=None, payload=None):
    values = {}

    if current_step is not None:
        values["current_step"] = current_step

    if payload is not None:
        values["payload"] = payload

    if not values:
        return None

    response = (
        supabase
        .table("line_workflows")
        .update(values)
        .eq("line_user_id", line_user_id)
        .execute()
    )

    return response.data


def clear_workflow(line_user_id):
    response = (
        supabase
        .table("line_workflows")
        .delete()
        .eq("line_user_id", line_user_id)
        .execute()
    )

    return response.data