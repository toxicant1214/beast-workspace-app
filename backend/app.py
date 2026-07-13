from flask import Flask, request, abort
import os
from dotenv import load_dotenv
import hmac
import hashlib
import base64
import re
from services.task_service import get_active_tasks, complete_task
from services.message_service import get_tasks_in_display_order

load_dotenv()
app = Flask(__name__)
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
def verify_signature(body, signature):
    hash = hmac.new(
        LINE_CHANNEL_SECRET.encode("utf-8"),
        body,
        hashlib.sha256
    ).digest()

    expected_signature = base64.b64encode(hash).decode()

    return hmac.compare_digest(expected_signature, signature)

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

    json_body = request.get_json()

    print("收到 LINE 訊息：")
    print(json_body)

    events = json_body.get("events", [])

    for event in events:
        if event["type"] != "message":
            continue

        text = event["message"]["text"].strip()
        print("使用者輸入：", text)

        match = re.fullmatch(r"完成\s*(\d+)", text)

        if match:
            task_number = int(match.group(1))

            tasks = get_active_tasks()
            ordered_tasks = get_tasks_in_display_order(tasks)

            if task_number < 1 or task_number > len(ordered_tasks):
                print("找不到第", task_number, "筆待辦")
                continue

            selected_task = ordered_tasks[task_number - 1]

            complete_task(selected_task["id"])

            print("已完成：", selected_task["title"])

            return "OK"


if __name__ == "__main__":
    app.run(port=5000, debug=True)