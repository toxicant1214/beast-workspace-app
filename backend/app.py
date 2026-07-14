import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, abort, request

from services.line_service import (
    reply_date_options,
    reply_message,
    reply_priority_options,
    reply_task_cards,
    reply_time_options,
)
from services.task_service import complete_task, get_active_tasks
from services.workflow_service import (
    get_workflow,
    start_workflow,
    update_workflow,
)

load_dotenv()

app = Flask(__name__)

LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")


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


def handle_text_message(text, reply_token, line_user_id):
    text = text.strip()

    if text == "新增待辦":
        start_workflow(
            line_user_id=line_user_id,
            flow_type="personal_task",
            first_step="title",
        )

        reply_message(
            reply_token,
            "📝 開始新增待辦\n\n請輸入任務名稱。",
        )
        return

    workflow = get_workflow(line_user_id)

    if (
        workflow
        and workflow.get("flow_type") == "personal_task"
        and workflow.get("current_step") == "title"
    ):
        payload = workflow.get("payload") or {}
        payload["title"] = text

        update_workflow(
            line_user_id=line_user_id,
            current_step="deadline_date",
            payload=payload,
        )

        reply_date_options(reply_token)
        return

    if text in ["待辦", "查看待辦", "我的待辦"]:
        tasks = get_active_tasks()
        reply_task_cards(reply_token, tasks)
        return

    if text.lower() in ["hello", "hi"] or text in ["哈囉", "你好"]:
        reply_message(
            reply_token,
            "👋 哈囉 Lin！\n\n輸入「待辦」即可查看目前未完成事項。",
        )
        return

    reply_message(
        reply_token,
        "目前可以輸入：\n\n📋 待辦\n📝 新增待辦",
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

    # 處理新增待辦的日期選擇
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

        if date_option == "custom":
            update_workflow(
                line_user_id=line_user_id,
                current_step="custom_deadline_date",
                payload=workflow.get("payload") or {},
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

        taipei_now = datetime.now(ZoneInfo("Asia/Taipei"))

        selected_date = (
            taipei_now + timedelta(days=date_offsets[date_option])
        ).date()

        payload = workflow.get("payload") or {}
        payload["deadline_date"] = selected_date.isoformat()

        update_workflow(
            line_user_id=line_user_id,
            current_step="has_time",
            payload=payload,
        )

        if reply_token:
            reply_time_options(reply_token)

        return

    # 處理是否設定截止時間
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

        if time_option == "no_time":
            payload = workflow.get("payload") or {}
            payload["has_time"] = False

            update_workflow(
                line_user_id=line_user_id,
                current_step="priority",
                payload=payload,
            )

            if reply_token:
                reply_priority_options(reply_token)

            return

        if time_option == "custom_time":
            payload = workflow.get("payload") or {}
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

    # 處理既有的完成待辦按鈕
        # 處理待辦重要程度
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
            "normal": "一般",
            "high": "重要",
            "urgent": "非常重要",
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

        update_workflow(
            line_user_id=line_user_id,
            current_step="reminders",
            payload=payload,
        )

        if reply_token:
            reply_message(
                reply_token,
                f"✅ 重要程度：{valid_priorities[priority_option]}\n\n"
                "下一步：設定提醒。",
            )

        return
    
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
        line_user_id = event.get("source", {}).get("userId")

        print("===== EVENT =====")
        print(json.dumps(event, indent=2, ensure_ascii=False))

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