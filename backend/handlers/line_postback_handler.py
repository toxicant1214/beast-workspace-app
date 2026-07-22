import os
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs

from handlers.line_common import (
    TAIPEI_TZ,
    build_deadline_at,
    build_task_summary,
)
from services.line_service import (
    push_teacher_completion_card,
    reply_date_options,
    reply_delete_confirmation,
    reply_message,
    reply_priority_options,
    reply_reminder_options,
    reply_task_confirmation,
    reply_time_options,
)
from services.task_service import (
    complete_task,
    create_task,
    delete_task,
    get_active_tasks,
)
from services.teacher_service import (
    get_teacher_by_line_user_id,
)
from services.teacher_assignment_service import (
    complete_teacher_assignment_by_line_user_id,
    confirm_teacher_assignment_by_admin,
)
from services.workflow_service import (
    clear_workflow,
    get_workflow,
    start_workflow,
    update_workflow,
)



def handle_postback(event):
    reply_token = event.get("replyToken")
    line_user_id = event.get("source", {}).get("userId")
    postback_data = event.get("postback", {}).get("data", "")

    values = parse_qs(postback_data)

    action = values.get("action", [""])[0]
    task_id = values.get("task_id", [""])[0]
    member_id = values.get("member_id", [""])[0]
    date_option = values.get("date_option", [""])[0]
    time_option = values.get("time_option", [""])[0]
    priority_option = values.get("priority", [""])[0]
    reminder_option = values.get("reminder", [""])[0]
    task_type = values.get("task_type", [""])[0]

    # 選擇要新增的任務類型
    if action == "select_task_type":
        bound_teacher = get_teacher_by_line_user_id(line_user_id)

        if bound_teacher:
            clear_workflow(line_user_id)

            if reply_token:
                reply_message(
                    reply_token,
                    "🔒 個人待辦與老師任務僅限主管建立。\n\n"
                    "老師請輸入「任務」查看自己的指派工作。",
                )
            return

        if task_type == "personal_task":
            start_workflow(
                line_user_id=line_user_id,
                flow_type="personal_task",
                first_step="title",
            )

            if reply_token:
                reply_message(
                    reply_token,
                    "📝 開始新增個人待辦\n\n"
                    "請輸入任務名稱。\n"
                    "輸入「取消新增」可隨時取消。",
                )
            return

        if task_type == "teacher_assignment":
            start_workflow(
                line_user_id=line_user_id,
                flow_type="teacher_assignment",
                first_step="title",
            )

            if reply_token:
                reply_message(
                    reply_token,
                    "👩‍🏫 開始新增老師任務\n\n"
                    "請輸入老師任務名稱。\n"
                    "輸入「取消新增」可隨時取消。",
                )
            return

        if reply_token:
            reply_message(
                reply_token,
                "無法辨識這個任務類型，請重新輸入「新增待辦」。",
            )
        return

    personal_task_actions = {
        "set_task_date",
        "set_task_time_option",
        "set_task_priority",
        "toggle_task_reminder",
        "finish_task_reminders",
        "skip_task_reminders",
        "confirm_create_task",
        "cancel_create_task",
        "request_delete_task",
        "cancel_delete_task",
        "confirm_delete_task",
        "complete_task",
    }

    if action in personal_task_actions:
        bound_teacher = get_teacher_by_line_user_id(line_user_id)

        if bound_teacher:
            clear_workflow(line_user_id)

            if reply_token:
                reply_message(
                    reply_token,
                    "🔒 個人待辦僅限主管操作。\n\n"
                    "老師請輸入「任務」查看自己的指派工作。",
                )
            return

    # 日期選擇
    if action == "set_task_date":
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "deadline_date"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有正在設定日期的待辦。",
                )
            return

        payload = workflow.get("payload") or {}

        if date_option == "custom":
            update_workflow(
                line_user_id=line_user_id,
                current_step="custom_deadline_date",
                payload=payload,
            )

            if reply_token:
                reply_message(
                    reply_token,
                    "📅 請輸入自訂日期，例如：2026/07/20",
                )
            return

        date_offsets = {
            "today": 0,
            "tomorrow": 1,
            "day_after_tomorrow": 2,
        }

        if date_option not in date_offsets:
            if reply_token:
                reply_message(
                    reply_token,
                    "無法辨識這個日期選項。",
                )
            return

        selected_date = (
            datetime.now(TAIPEI_TZ)
            + timedelta(days=date_offsets[date_option])
        ).date()

        payload["deadline_date"] = selected_date.isoformat()

        update_workflow(
            line_user_id=line_user_id,
            current_step="has_time",
            payload=payload,
        )

        if reply_token:
            reply_time_options(reply_token)

        return

    # 是否設定截止時間
    if action == "set_task_time_option":
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "has_time"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有正在設定時間的待辦。",
                )
            return

        payload = workflow.get("payload") or {}

        if time_option == "no_time":
            payload["has_time"] = False
            payload.pop("deadline_time", None)

            update_workflow(
                line_user_id=line_user_id,
                current_step="priority",
                payload=payload,
            )

            if reply_token:
                reply_priority_options(reply_token)

            return

        if time_option == "custom_time":
            payload["has_time"] = True

            update_workflow(
                line_user_id=line_user_id,
                current_step="custom_deadline_time",
                payload=payload,
            )

            if reply_token:
                reply_message(
                    reply_token,
                    "🕒 請輸入截止時間，例如：18:30",
                )

            return

        if reply_token:
            reply_message(
                reply_token,
                "無法辨識這個時間選項。",
            )

        return

    # 重要程度
    if action == "set_task_priority":
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "priority"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有正在設定重要程度的待辦。",
                )
            return

        valid_priorities = {
            "normal",
            "high",
            "urgent",
        }

        if priority_option not in valid_priorities:
            if reply_token:
                reply_message(
                    reply_token,
                    "無法辨識這個重要程度。",
                )
            return

        payload = workflow.get("payload") or {}
        payload["priority"] = priority_option
        payload["reminder_offsets"] = []

        update_workflow(
            line_user_id=line_user_id,
            current_step="reminders",
            payload=payload,
        )

        if reply_token:
            reply_reminder_options(
                reply_token,
                selected=[],
            )

        return

    # 切換提醒
    if action == "toggle_task_reminder":
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "reminders"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有正在設定提醒的待辦。",
                )
            return

        valid_reminders = {
            "same_day",
            "1_day",
            "2_days",
            "1_week",
        }

        if reminder_option not in valid_reminders:
            if reply_token:
                reply_message(
                    reply_token,
                    "無法辨識這個提醒選項。",
                )
            return

        payload = workflow.get("payload") or {}
        selected = list(
            payload.get("reminder_offsets") or []
        )

        if reminder_option in selected:
            selected.remove(reminder_option)
        else:
            selected.append(reminder_option)

        payload["reminder_offsets"] = selected

        update_workflow(
            line_user_id=line_user_id,
            current_step="reminders",
            payload=payload,
        )

        if reply_token:
            reply_reminder_options(
                reply_token,
                selected=selected,
            )

        return

    # 完成或略過提醒設定
    if action in {
        "finish_task_reminders",
        "skip_task_reminders",
    }:
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "reminders"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有正在設定提醒的待辦。",
                )
            return

        payload = workflow.get("payload") or {}

        if action == "skip_task_reminders":
            payload["reminder_offsets"] = []

        update_workflow(
            line_user_id=line_user_id,
            current_step="confirm",
            payload=payload,
        )

        if reply_token:
            reply_task_confirmation(
                reply_token,
                build_task_summary(payload),
            )

        return

    # 正式新增待辦
    if action == "confirm_create_task":
        workflow = get_workflow(line_user_id)

        if (
            not workflow
            or workflow.get("flow_type") != "personal_task"
            or workflow.get("current_step") != "confirm"
        ):
            if reply_token:
                reply_message(
                    reply_token,
                    "目前沒有等待確認的待辦。",
                )
            return

        payload = workflow.get("payload") or {}

        try:
            deadline_at = build_deadline_at(payload)

            create_task(
                title=payload["title"],
                deadline_at=deadline_at,
                has_time=bool(payload.get("has_time")),
                priority=payload.get("priority", "normal"),
                reminder_offsets=(
                    payload.get("reminder_offsets") or []
                ),
            )
        except (KeyError, TypeError, ValueError) as error:
            print("建立待辦失敗：", error)

            if reply_token:
                reply_message(
                    reply_token,
                    "待辦資料不完整，請重新輸入「新增待辦」。",
                )
            return

        clear_workflow(line_user_id)

        if reply_token:
            reply_message(
                reply_token,
                f"✅ 已新增待辦："
                f"{payload.get('title', '未命名任務')}",
            )

        return

    # 取消新增待辦
    if action == "cancel_create_task":
        clear_workflow(line_user_id)

        if reply_token:
            reply_message(
                reply_token,
                "已取消新增待辦。",
            )

        return

    # 要求刪除：先顯示二次確認
    if action == "request_delete_task" and task_id:
        tasks = get_active_tasks()

        selected_task = next(
            (
                task
                for task in tasks
                if str(task.get("id")) == task_id
            ),
            None,
        )

        if not selected_task:
            if reply_token:
                reply_message(
                    reply_token,
                    "這筆待辦可能已經完成、刪除或不存在。",
                )
            return

        if reply_token:
            reply_delete_confirmation(
                reply_token,
                task_id,
                selected_task.get("title", "未命名任務"),
            )

        return

    # 取消刪除
    if action == "cancel_delete_task":
        if reply_token:
            reply_message(
                reply_token,
                "好的，沒有刪除任何待辦。",
            )

        return

    # 確認刪除
    if action == "confirm_delete_task" and task_id:
        tasks = get_active_tasks()

        selected_task = next(
            (
                task
                for task in tasks
                if str(task.get("id")) == task_id
            ),
            None,
        )

        if not selected_task:
            if reply_token:
                reply_message(
                    reply_token,
                    "這筆待辦可能已經刪除或不存在。",
                )
            return

        delete_task(task_id)

        if reply_token:
            reply_message(
                reply_token,
                f"🗑️ 已刪除："
                f"{selected_task.get('title', '未命名任務')}",
            )

        return
    # 老師透過 LINE 回報完成自己的任務
    if action == "complete_teacher_assignment" and member_id:
        result = complete_teacher_assignment_by_line_user_id(
            member_id=member_id,
            line_user_id=line_user_id,
        )

        if not result:
            if reply_token:
                reply_message(
                    reply_token,
                    "這筆任務不存在，或你沒有權限完成。",
                )
            return

        title = result.get("title") or "未命名任務"

        if result.get("already_completed"):
            if reply_token:
                reply_message(
                    reply_token,
                    f"✅「{title}」已經回報完成，"
                    "目前正在等待主管確認。",
                )
            return

        teacher = get_teacher_by_line_user_id(line_user_id)

        teacher_name = "老師"

        if teacher:
            teacher_name = (
                teacher.get("chinese_name")
                or teacher.get("english_name")
                or "老師"
            )

        completed_at_text = datetime.now(
            TAIPEI_TZ
        ).strftime("%Y/%m/%d %H:%M")

        # 老師端先回覆成功，避免主管推播失敗影響老師操作
        if reply_token:
            reply_message(
                reply_token,
                f"✅ 已回報完成：{title}\n\n"
                "目前狀態為等待主管確認。",
            )

        # 即時推播主管確認卡片
        admin_line_user_id = os.getenv("ADMIN_LINE_USER_ID")

        try:
            push_teacher_completion_card(
                admin_line_user_id=admin_line_user_id,
                teacher_name=teacher_name,
                member_id=member_id,
                title=title,
                completed_at_text=completed_at_text,
            )
        except Exception as error:
            print("推播主管任務完成通知失敗：", error)

        return
        # 主管透過 LINE 確認老師完成任務
    if action == "admin_confirm_teacher_assignment" and member_id:
        admin_line_user_id = os.getenv("ADMIN_LINE_USER_ID")

        if not admin_line_user_id or line_user_id != admin_line_user_id:
            if reply_token:
                reply_message(
                    reply_token,
                    "你沒有主管確認任務的權限。",
                )
            return

        result = confirm_teacher_assignment_by_admin(member_id)

        if not result:
            if reply_token:
                reply_message(
                    reply_token,
                    "這筆任務不存在、已失效，或目前無法確認。",
                )
            return

        if result.get("reason") == "teacher_not_completed":
            if reply_token:
                reply_message(
                    reply_token,
                    "老師尚未回報完成，目前無法進行主管確認。",
                )
            return

        title = result.get("title") or "未命名任務"
        teacher_name = result.get("teacher_name") or "老師"

        if result.get("already_confirmed"):
            if reply_token:
                reply_message(
                    reply_token,
                    f"✅ 已確認過\n\n"
                    f"老師：{teacher_name}\n"
                    f"任務：{title}",
                )
            return

        if reply_token:
            reply_message(
                reply_token,
                f"✅ 主管確認完成\n\n"
                f"老師：{teacher_name}\n"
                f"任務：{title}\n\n"
                "Workspace 已同步更新為正式完成。",
            )

        return
    # 完成既有待辦
    if action == "complete_task" and task_id:
        tasks = get_active_tasks()

        selected_task = next(
            (
                task
                for task in tasks
                if str(task.get("id")) == task_id
            ),
            None,
        )

        if not selected_task:
            if reply_token:
                reply_message(
                    reply_token,
                    "這筆待辦可能已經完成或被刪除了。",
                )
            return

        complete_task(task_id)

        if reply_token:
            reply_message(
                reply_token,
                f"✅ 已完成："
                f"{selected_task.get('title', '未命名任務')}",
            )

        return

    if reply_token:
        reply_message(
            reply_token,
            "無法辨識這個操作。",
        )