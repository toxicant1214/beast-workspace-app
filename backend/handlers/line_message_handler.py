from datetime import datetime, timedelta

from handlers.line_common import (
    TAIPEI_TZ,
    parse_custom_date,
    parse_custom_time,
)
from services.line_service import (
    reply_date_options,
    reply_task_type_options,
    reply_message,
    reply_priority_options,
    reply_task_cards,
    reply_teacher_assignment_cards,
    reply_time_options,
)
from services.task_service import (
    get_active_tasks,
    get_tasks_between,
)
from services.teacher_service import (
    complete_teacher_line_binding,
    get_teacher_by_line_user_id,
    get_valid_teacher_binding_code,
)
from services.teacher_assignment_service import (
    get_teacher_assignments_by_line_user_id,
)
from services.workflow_service import (
    clear_workflow,
    get_workflow,
    start_workflow,
    update_workflow,
)


def handle_text_message(text, reply_token, line_user_id):
    text = text.strip()
    
    bound_teacher = get_teacher_by_line_user_id(line_user_id)

    if text == "取消新增":
        workflow = get_workflow(line_user_id)

        if workflow:
            clear_workflow(line_user_id)
            reply_message(reply_token, "已取消本次新增待辦。")
        else:
            reply_message(reply_token, "目前沒有正在新增的待辦。")
        return

    if text == "綁定":
           existing_teacher = get_teacher_by_line_user_id(line_user_id)

           if existing_teacher:
            teacher_name = (
                existing_teacher.get("chinese_name")
                or existing_teacher.get("english_name")
                or "老師"
            )

            reply_message(
                reply_token,
                f"✅ 這個 LINE 已經綁定「{teacher_name}」。",
            )
            return

           reply_message(
            reply_token,
            "🔗 LINE 帳號綁定\n\n"
            "請先登入 BEAST Workspace，產生六碼 LINE 綁定碼。\n\n"
            "取得後請傳送：\n"
            "綁定 ABC123",
        )
           return

    if text.startswith("綁定 "):
        existing_teacher = get_teacher_by_line_user_id(line_user_id)

        if existing_teacher:
            teacher_name = (
                existing_teacher.get("chinese_name")
                or existing_teacher.get("english_name")
                or "老師"
            )

            reply_message(
                reply_token,
                f"✅ 這個 LINE 已經綁定「{teacher_name}」。",
            )
            return

        binding_code = text.replace("綁定 ", "", 1).strip().upper()

        if len(binding_code) != 6:
            reply_message(
                reply_token,
                "⚠️ 綁定碼格式不正確。\n\n"
                "請傳送「綁定」加上一個空格及六碼綁定碼，例如：\n"
                "綁定 ABC123",
            )
            return

        binding = get_valid_teacher_binding_code(binding_code)

        if not binding:
            reply_message(
                reply_token,
                "❌ 找不到有效的綁定碼。\n\n"
                "綁定碼可能已過期、已使用，或輸入錯誤。\n"
                "請回到 BEAST Workspace 重新產生。",
            )
            return

        teacher = complete_teacher_line_binding(
            binding_id=binding["id"],
            teacher_id=binding["teacher_id"],
            line_user_id=line_user_id,
        )

        teacher_name = (
            teacher.get("chinese_name")
            or teacher.get("english_name")
            or "老師"
        )

        reply_message(
            reply_token,
            f"🎉 LINE 綁定成功！\n\n"
            f"您好，{teacher_name}。\n"
            "之後您將透過 LINE 收到：\n"
            "✅ 老師任務通知\n"
            "✅ 截止時間提醒\n"
            "✅ 每日工作摘要",
        )
        return
    if text == "任務":
        result = get_teacher_assignments_by_line_user_id(
            line_user_id
        )

        teacher = result.get("teacher")
        assignments = result.get("assignments", [])

        if not teacher:
            reply_message(
                reply_token,
                "目前尚未綁定老師身分。\n\n"
                "請先輸入：\n"
                "綁定 綁定碼",
            )
            return

        teacher_name = (
            teacher.get("chinese_name")
            or teacher.get("english_name")
            or "老師"
        )

        reply_teacher_assignment_cards(
            reply_token=reply_token,
            teacher_name=teacher_name,
            assignments=assignments,
        )
        return

    if text == "新增待辦":
        if bound_teacher:
            reply_message(
                reply_token,
                "🔒 個人待辦與老師任務僅限主管建立。\n\n"
                "老師請輸入「任務」查看自己的指派工作。",
            )
            return

        clear_workflow(line_user_id)
        reply_task_type_options(reply_token)
        return

    workflow = get_workflow(line_user_id)

    if (
        bound_teacher
        and workflow
        and workflow.get("flow_type") == "personal_task"
    ):
        clear_workflow(line_user_id)
        reply_message(
            reply_token,
            "🔒 個人待辦僅限主管使用。\n\n"
            "老師請輸入「任務」查看自己的指派工作。",
        )
        return

    if (
    workflow
    and workflow.get("flow_type") == "teacher_assignment"
):
     current_step = workflow.get("current_step")
    payload = workflow.get("payload") or {}

    if current_step == "title":
        if not text:
            reply_message(
                reply_token,
                "任務名稱不能空白，請重新輸入。",
            )
            return

        payload["title"] = text

        update_workflow(
            line_user_id=line_user_id,
            current_step="description",
            payload=payload,
        )

        reply_message(
            reply_token,
            "📝 請輸入任務說明。\n\n"
            "不需要說明的話，請輸入「略過」。\n"
            "輸入「取消新增」可隨時取消。",
        )
        return

    if current_step == "description":
        if text == "略過":
            payload["description"] = None
        else:
            payload["description"] = text

        update_workflow(
            line_user_id=line_user_id,
            current_step="deadline_date",
            payload=payload,
        )

        reply_message(
            reply_token,
            "✅ 已記錄老師任務內容。\n\n"
            f"任務名稱：{payload.get('title')}\n"
            f"任務說明：{payload.get('description') or '無'}\n\n"
            "下一步將設定截止日期。",
        )
        return

    if (
        workflow
        and workflow.get("flow_type") == "personal_task"
    ):
        current_step = workflow.get("current_step")
        payload = workflow.get("payload") or {}

        if current_step == "title":
            payload["title"] = text

            update_workflow(
                line_user_id=line_user_id,
                current_step="deadline_date",
                payload=payload,
            )

            reply_date_options(reply_token)
            return

        if current_step == "custom_deadline_date":
            try:
                selected_date = parse_custom_date(text)
            except ValueError:
                reply_message(
                    reply_token,
                    "日期格式不正確，請輸入例如：2026/07/20",
                )
                return

            payload["deadline_date"] = selected_date.isoformat()

            update_workflow(
                line_user_id=line_user_id,
                current_step="has_time",
                payload=payload,
            )

            reply_time_options(reply_token)
            return

        if current_step == "custom_deadline_time":
            try:
                selected_time = parse_custom_time(text)
            except ValueError:
                reply_message(
                    reply_token,
                    "時間格式不正確，請使用 24 小時制，例如：18:30",
                )
                return

            payload["has_time"] = True
            payload["deadline_time"] = selected_time.strftime("%H:%M")

            update_workflow(
                line_user_id=line_user_id,
                current_step="priority",
                payload=payload,
            )

            reply_priority_options(reply_token)
            return

    if text in ["待辦", "查看待辦", "我的待辦"]:
        if bound_teacher:
            reply_message(
                reply_token,
                "🔒 個人待辦僅限主管查看。\n\n"
                "老師請輸入「任務」查看自己的指派工作。",
            )
            return

        tasks = get_active_tasks()
        reply_task_cards(reply_token, tasks)
        return

    if text in ["今天", "明天", "本週"]:
        if bound_teacher:
            reply_message(
                reply_token,
                "🔒 個人待辦僅限主管查看。\n\n"
                "老師請輸入「任務」查看自己的指派工作。",
            )
            return

        taipei_today = datetime.now(TAIPEI_TZ).date()

        if text == "今天":
            tasks = get_tasks_between(
                taipei_today,
                taipei_today,
            )
            reply_task_cards(reply_token, tasks)
            return

        if text == "明天":
            tomorrow = taipei_today + timedelta(days=1)

            tasks = get_tasks_between(
                tomorrow,
                tomorrow,
            )
            reply_task_cards(reply_token, tasks)
            return

        if text == "本週":
            days_until_sunday = 6 - taipei_today.weekday()
            sunday = taipei_today + timedelta(
                days=days_until_sunday,
            )

            tasks = get_tasks_between(
                taipei_today,
                sunday,
            )
            reply_task_cards(reply_token, tasks)
            return
    if text.lower() in ["hello", "hi"] or text in ["哈囉", "你好"]:
        if bound_teacher:
            teacher_name = (
                bound_teacher.get("chinese_name")
                or bound_teacher.get("english_name")
                or "老師"
            )
            reply_message(
                reply_token,
                f"👋 您好，{teacher_name}！\n\n"
                "輸入「任務」查看自己的指派工作。",
            )
            return

        reply_message(
            reply_token,
            "👋 哈囉 Lin！\n\n"
            "輸入「待辦」查看未完成事項，"
            "輸入「新增待辦」建立新任務。",
        )
        return

    if bound_teacher:
        reply_message(
            reply_token,
            "目前可以輸入：\n\n"
            "📋 任務",
        )
        return

    reply_message(
        reply_token,
        "目前可以輸入：\n\n"
        "📋 待辦\n"
        "📝 新增待辦",
    )