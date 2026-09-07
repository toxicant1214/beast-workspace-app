import base64
import hashlib
import hmac
import json
import os
from datetime import datetime

from dotenv import load_dotenv

# 必須先載入 .env，再匯入會讀取環境變數的其他模組。
load_dotenv()

from flask import Flask, abort, jsonify, request
from flask_cors import CORS

from handlers.line_common import TAIPEI_TZ
from handlers.line_message_handler import handle_text_message
from handlers.line_postback_handler import handle_postback

from services import announcement_service

from services.line_service import (
    push_teacher_completion_card,
)

from services.teacher_assignment_service import (
    complete_teacher_assignment_by_member_id,
)


app = Flask(__name__)
CORS(app)

LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
ADMIN_LINE_USER_ID = os.getenv("ADMIN_LINE_USER_ID")


def verify_signature(body, signature):
    if not LINE_CHANNEL_SECRET or not signature:
        return False

    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()

    expected_signature = base64.b64encode(
        digest
    ).decode("utf-8")

    return hmac.compare_digest(
        expected_signature,
        signature,
    )


# =========================================================
# 老師任務｜網頁完成
# =========================================================

@app.route(
    "/api/teacher-assignments/<member_id>/complete",
    methods=["POST"],
)
def complete_teacher_assignment_from_web(
    member_id,
):
    result = (
        complete_teacher_assignment_by_member_id(
            member_id
        )
    )

    if not result:
        return {
            "success": False,
            "message": (
                "任務不存在、已失效或無法完成。"
            ),
        }, 404

    if result.get("already_completed"):
        return {
            "success": True,
            "already_completed": True,
            "member": result.get("member"),
        }

    teacher = result.get("teacher") or {}

    teacher_name = (
        teacher.get("chinese_name")
        or teacher.get("english_name")
        or "老師"
    )

    title = (
        result.get("title")
        or "未命名任務"
    )

    completed_at_text = datetime.now(
        TAIPEI_TZ
    ).strftime(
        "%Y/%m/%d %H:%M"
    )

    try:
        push_teacher_completion_card(
            admin_line_user_id=
                ADMIN_LINE_USER_ID,
            teacher_name=teacher_name,
            member_id=member_id,
            title=title,
            completed_at_text=
                completed_at_text,
        )

    except Exception as error:
        print(
            "網頁完成任務推播主管失敗：",
            error,
        )

    return {
        "success": True,
        "already_completed": False,
        "member": result.get("member"),
    }


# =========================================================
# 公告簽收｜老師公告頁
# =========================================================

@app.route(
    "/api/announcements/<access_token>",
    methods=["GET"],
)
def get_announcement_for_recipient(
    access_token,
):
    try:
        recipient = (
            announcement_service
            .get_recipient_by_token(
                access_token
            )
        )

        if not recipient:
            return jsonify({
                "success": False,
                "message": "找不到這則公告",
            }), 404

        # 第一次開啟公告時留下 opened_at
        recipient = (
            announcement_service
            .mark_opened(
                access_token
            )
        )

        announcement = (
            recipient.get(
                "announcements"
            )
            or {}
        )

        teacher = (
            recipient.get(
                "teachers"
            )
            or {}
        )

        teacher_name = (
            teacher.get("chinese_name")
            or teacher.get("english_name")
            or teacher.get("name")
            or "老師"
        )

        return jsonify({
            "success": True,
            "announcement": {
                "id":
                    announcement.get("id"),
                "title":
                    announcement.get("title"),
                "content":
                    announcement.get("content"),
                "status":
                    announcement.get("status"),
                "sent_at":
                    announcement.get("sent_at"),
                "deadline_at":
                    announcement.get(
                        "deadline_at"
                    ),
            },
            "recipient": {
                "id":
                    recipient.get("id"),
                "teacher_id":
                    recipient.get(
                        "teacher_id"
                    ),
                "teacher_name":
                    teacher_name,
                "opened_at":
                    recipient.get(
                        "opened_at"
                    ),
                "scroll_completed_at":
                    recipient.get(
                        "scroll_completed_at"
                    ),
                "confirmed_at":
                    recipient.get(
                        "confirmed_at"
                    ),
            },
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error),
        }), 400

    except Exception as error:
        print(
            "[ANNOUNCEMENT] "
            "讀取公告失敗：",
            error,
        )

        return jsonify({
            "success": False,
            "message": "讀取公告失敗",
        }), 500


@app.route(
    (
        "/api/announcements/"
        "<access_token>/scroll-complete"
    ),
    methods=["POST"],
)
def announcement_scroll_complete(
    access_token,
):
    try:
        recipient = (
            announcement_service
            .mark_scroll_completed(
                access_token
            )
        )

        return jsonify({
            "success": True,
            "scroll_completed_at":
                recipient.get(
                    "scroll_completed_at"
                ),
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error),
        }), 400

    except Exception as error:
        print(
            "[ANNOUNCEMENT] "
            "更新閱讀狀態失敗：",
            error,
        )

        return jsonify({
            "success": False,
            "message": (
                "更新公告閱讀狀態失敗"
            ),
        }), 500


@app.route(
    (
        "/api/announcements/"
        "<access_token>/confirm"
    ),
    methods=["POST"],
)
def confirm_announcement(
    access_token,
):
    try:
        recipient = (
            announcement_service
            .confirm_announcement(
                access_token
            )
        )

        return jsonify({
            "success": True,
            "confirmed_at":
                recipient.get(
                    "confirmed_at"
                ),
            "message":
                "✅ 已完成確認",
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error),
        }), 400

    except Exception as error:
        print(
            "[ANNOUNCEMENT] "
            "公告確認失敗：",
            error,
        )

        return jsonify({
            "success": False,
            "message": "公告確認失敗",
        }), 500


# =========================================================
# 基本健康檢查
# =========================================================

@app.route(
    "/",
    methods=["GET"],
)
def home():
    return (
        "BEAST Workspace backend "
        "is running."
    )


# =========================================================
# LINE Webhook
# =========================================================

@app.route(
    "/line/webhook",
    methods=["POST"],
)
def line_webhook():
    body = request.get_data()

    signature = request.headers.get(
        "X-Line-Signature"
    )

    if not verify_signature(
        body,
        signature,
    ):
        print(
            "LINE 簽章驗證失敗"
        )
        abort(400)

    json_body = json.loads(
        body.decode("utf-8")
    )

    events = json_body.get(
        "events",
        [],
    )

    for event in events:
        event_type = event.get(
            "type"
        )

        line_user_id = (
            event
            .get(
                "source",
                {},
            )
            .get("userId")
        )

        print(
            "===== EVENT ====="
        )

        print(
            json.dumps(
                event,
                indent=2,
                ensure_ascii=False,
            )
        )

        # LINE 按鈕 / postback
        if event_type == "postback":
            handle_postback(
                event
            )
            continue

        # 非文字訊息先忽略
        if event_type != "message":
            continue

        message = event.get(
            "message",
            {},
        )

        if (
            message.get("type")
            != "text"
        ):
            continue

        text = message.get(
            "text",
            "",
        )

        reply_token = event.get(
            "replyToken"
        )

        print(
            "使用者輸入：",
            text,
        )

        if reply_token:
            handle_text_message(
                text,
                reply_token,
                line_user_id,
            )

    return "OK"


if __name__ == "__main__":
    app.run(
        port=5000,
        debug=True,
    )