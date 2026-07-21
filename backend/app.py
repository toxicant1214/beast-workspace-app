import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, time, timedelta
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, abort, request

from services.line_service import (
    reply_date_options,
    reply_delete_confirmation,
    reply_message,
    reply_priority_options,
    reply_reminder_options,
    reply_task_cards,
    reply_task_confirmation,
    reply_time_options,
)
from services.task_service import (
    complete_task,
    create_task,
    delete_task,
    get_active_tasks,
    get_tasks_between,
)
from services.teacher_service import (
    complete_teacher_line_binding,
    get_teacher_by_line_user_id,
    get_valid_teacher_binding_code,
)
from services.workflow_service import (
    clear_workflow,
    get_workflow,
    start_workflow,
    update_workflow,
)

load_dotenv()

app = Flask(__name__)

LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def verify_signature(body, signature):
    if not LINE_CHANNEL_SECRET or not signature:
        return False

    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()

    expected_signature = base64.b64encode(digest).decode("utf-8")

    return hmac.compare_digest(expected_signature, signature)


def parse_custom_date(text):
    """接受 YYYY/MM/DD 或 YYYY-MM-DD。"""

    normalized = text.strip().replace("/", "-")
    return datetime.strptime(normalized, "%Y-%m-%d").date()


def parse_custom_time(text):
    """接受 HH:MM 的 24 小時制時間。"""

    return datetime.strptime(text.strip(), "%H:%M").time()


def build_deadline_at(payload):
    """把日期與時間組合成含台灣時區的 ISO 日期時間。"""

    deadline_date = datetime.strptime(
        payload["deadline_date"],
        "%Y-%m-%d",
    ).date()

    if payload.get("has_time"):
        deadline_time = datetime.strptime(
            payload["deadline_time"],
            "%H:%M",
        ).time()
    else:
        deadline_time = time(23, 59)

    deadline = datetime.combine(
        deadline_date,
        deadline_time,
        tzinfo=TAIPEI_TZ,
    )

    return deadline.isoformat()


def build_task_summary(payload):
    priority_labels = {
        "normal": "一般",
        "high": "重要",
        "urgent": "非常重要",
    }

    reminder_labels = {
        "same_day": "當天",
        "1_day": "一天前",
        "2_days": "兩天前",
        "1_week": "一週前",
    }

    title = payload.get("title", "未命名任務")
    if len(title) > 45:
        title = f"{title[:45]}…"

    deadline_date = payload.get("deadline_date", "未設定")
    deadline_time = payload.get("deadline_time")
    has_time = payload.get("has_time", False)

    if has_time and deadline_time:
        deadline_text = f"{deadline_date} {deadline_time}"
    else:
        deadline_text = f"{deadline_date}（不指定時間）"

    priority_text = priority_labels.get(
        payload.get("priority"),
        "一般",
    )

    reminders = payload.get("reminder_offsets") or []
    if reminders:
        reminder_text = "、".join(
            reminder_labels.get(item, item)
            for item in reminders
        )
    else:
        reminder_text = "不設定"

    return (
        f"任務：{title}\n"
        f"截止：{deadline_text}\n"
        f"程度：{priority_text}\n"
        f"提醒：{reminder_text}"
    )


def handle_text_message(text, reply_token, line_user_id):
    text = text.strip()

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
  
    if text == "新增待辦":
        start_workflow(
            line_user_id=line_user_id,
            flow_type="personal_task",
            first_step="title",
        )

        reply_message(
            reply_token,
            "📝 開始新增待辦\n\n請輸入任務名稱。\n"
            "輸入「取消新增」可隨時取消。",
        )
        return

    workflow = get_workflow(line_user_id)

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
        tasks = get_active_tasks()
        reply_task_cards(reply_token, tasks)
        return

    if text in ["今天", "明天", "本週"]:
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
        reply_message(
            reply_token,
            "👋 哈囉 Lin！\n\n"
            "輸入「待辦」查看未完成事項，"
            "輸入「新增待辦」建立新任務。",
        )
        return

    reply_message(
        reply_token,
        "目前可以輸入：\n\n"
        "📋 待辦\n"
        "📝 新增待辦",
    )


def handle_postback(event):
    reply_token = event.get("replyToken")
    line_user_id = event.get("source", {}).get("userId")
    postback_data = event.get("postback", {}).get("data", "")

    values = parse_qs(postback_data)

    action = values.get("action", [""])[0]
    task_id = values.get("task_id", [""])[0]
    date_option = values.get("date_option", [""])[0]
    time_option = values.get("time_option", [""])[0]
    priority_option = values.get("priority", [""])[0]
    reminder_option = values.get("reminder", [""])[0]

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


@app.route("/", methods=["GET"])
def home():
    return "BEAST Workspace backend is running."


@app.route("/line/webhook", methods=["POST"])
def line_webhook():
    body = request.get_data()
    signature = request.headers.get("X-Line-Signature")

    if not verify_signature(body, signature):
        print("LINE 簽章驗證失敗")
        abort(400)

    json_body = json.loads(body.decode("utf-8"))
    events = json_body.get("events", [])

    for event in events:
        event_type = event.get("type")
        line_user_id = (
            event.get("source", {}).get("userId")
        )

        print("===== EVENT =====")
        print(
            json.dumps(
                event,
                indent=2,
                ensure_ascii=False,
            )
        )

        if event_type == "postback":
            handle_postback(event)
            continue

        if event_type != "message":
            continue

        message = event.get("message", {})

        if message.get("type") != "text":
            continue

        text = message.get("text", "")
        reply_token = event.get("replyToken")

        print("使用者輸入：", text)

        if reply_token:
            handle_text_message(
                text,
                reply_token,
                line_user_id,
            )

    return "OK"


if __name__ == "__main__":
    app.run(port=5000, debug=True)
