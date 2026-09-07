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
    push_announcement_card,
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
# 公告簽收｜正式發送 LINE 公告
# =========================================================

@app.route(
    "/api/announcements/<announcement_id>/send",
    methods=["POST"],
)
def send_announcement_to_line(
    announcement_id,
):
    """
    將已建立的公告個別 Push 給指定老師。

    規則：
    1. 先讀取公告與 recipients。
    2. 只發給有 LINE userId 的指定老師。
    3. 至少一位老師成功收到後，才標記公告 sent，
       並由 service 建立 sent_at / 12 小時 deadline_at。
    4. 回傳逐位老師的發送結果，方便 Workspace 顯示失敗名單。
    """

    try:
        announcement = (
            announcement_service
            .get_announcement(
                announcement_id
            )
        )

        if not announcement:
            return jsonify({
                "success": False,
                "message": "找不到這則公告",
            }), 404

        if announcement.get("status") == "sent":
            return jsonify({
                "success": False,
                "message": "這則公告已經發送過了",
            }), 400

        recipients = (
            announcement_service
            .get_announcement_recipients(
                announcement_id
            )
        )

        if not recipients:
            return jsonify({
                "success": False,
                "message": "這則公告沒有指定收件老師",
            }), 400

        title = (
            announcement.get("title")
            or "工作公告"
        )

        content = (
            announcement.get("content")
            or ""
        )

        # 先用預計期限顯示在 LINE 卡片。
        # 正式 sent_at / deadline_at 會在至少一位 Push 成功後寫入。
        from datetime import timedelta

        planned_deadline = (
            datetime.now(TAIPEI_TZ)
            + timedelta(hours=12)
        ).isoformat()

        sent_results = []
        successful_count = 0

        for recipient in recipients:
            teacher = (
                recipient.get("teachers")
                or {}
            )

            line_user_id = (
                teacher.get("line_user_id")
            )

            teacher_name = (
                teacher.get("chinese_name")
                or teacher.get("english_name")
                or "老師"
            )

            recipient_id = str(
                recipient.get("id")
                or ""
            )

            if not line_user_id:
                sent_results.append({
                    "recipient_id": recipient_id,
                    "teacher_name": teacher_name,
                    "success": False,
                    "message": "老師尚未綁定 LINE",
                })
                continue

            try:
                push_announcement_card(
                    line_user_id=line_user_id,
                    teacher_name=teacher_name,
                    recipient_id=recipient_id,
                    title=title,
                    content=content,
                    deadline_at=planned_deadline,
                )

                successful_count += 1

                sent_results.append({
                    "recipient_id": recipient_id,
                    "teacher_name": teacher_name,
                    "success": True,
                })

            except Exception as error:
                print(
                    "[ANNOUNCEMENT] "
                    f"LINE Push 失敗｜{teacher_name}：",
                    error,
                )

                sent_results.append({
                    "recipient_id": recipient_id,
                    "teacher_name": teacher_name,
                    "success": False,
                    "message": str(error),
                })

        if successful_count == 0:
            return jsonify({
                "success": False,
                "message": "公告未成功發送給任何老師",
                "results": sent_results,
            }), 502

        sent_announcement = (
            announcement_service
            .mark_announcement_sent(
                announcement_id
            )
        )

        return jsonify({
            "success": True,
            "announcement":
                sent_announcement,
            "sent_count":
                successful_count,
            "failed_count":
                len(recipients)
                - successful_count,
            "results":
                sent_results,
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error),
        }), 400

    except Exception as error:
        print(
            "[ANNOUNCEMENT] "
            "正式發送公告失敗：",
            error,
        )

        return jsonify({
            "success": False,
            "message": "發送公告失敗",
        }), 500


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