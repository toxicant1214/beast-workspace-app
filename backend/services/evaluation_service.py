"""
教師考核：事件 LINE 通知、老師確認／異議、超過天數自動確認

這個檔案獨立運作，不被晨報、排程、請假流程匯入。
所有給 LINE webhook 用的函式都不會丟出錯誤，失敗時只印 log，
確保原本的 LINE 功能（新增待辦、任務回報等）照常運作。
"""

import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

from services.line_service import get_headers
from services.teacher_service import supabase


TAIPEI_TZ = ZoneInfo("Asia/Taipei")
PUSH_URL = "https://api.line.me/v2/bot/message/push"

EVENTS = "evaluation_events"
TYPES = "evaluation_event_types"
SETTINGS = "evaluation_settings"

DISPUTE_REASON_WINDOW_MINUTES = 30

DEFAULT_SETTINGS = {
    "auto_confirm_days": 3,
}


# =========================================================
# 小工具
# =========================================================

def _now():
    return datetime.now(timezone.utc)


def _parse_dt(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TAIPEI_TZ)
    return dt


def _teacher_name(teacher):
    teacher = teacher or {}
    return teacher.get("chinese_name") or teacher.get("english_name") or "老師"


def _date_label(date_text):
    try:
        y, m, d = [int(x) for x in str(date_text)[:10].split("-")]
        return f"{y}/{m}/{d}"
    except (TypeError, ValueError):
        return str(date_text or "")


def _points_label(points):
    try:
        value = float(points)
    except (TypeError, ValueError):
        return str(points)
    text = f"{abs(value):g}"
    return f"+{text}" if value > 0 else f"−{text}"


def _get_settings():
    try:
        rows = (
            supabase.table(SETTINGS)
            .select("value")
            .eq("key", "year_end")
            .limit(1)
            .execute()
            .data
            or []
        )
        value = rows[0]["value"] if rows else {}
    except Exception as error:
        print("讀取考核設定失敗：", error)
        value = {}
    merged = dict(DEFAULT_SETTINGS)
    merged.update(value or {})
    return merged


def _get_event(event_id):
    rows = (
        supabase.table(EVENTS)
        .select("*, teachers(id, chinese_name, english_name, line_user_id)")
        .eq("id", event_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _update_event(event_id, values):
    values = dict(values)
    values["updated_at"] = _now().isoformat()
    return (
        supabase.table(EVENTS)
        .update(values)
        .eq("id", event_id)
        .execute()
        .data
    )


def _push(to, messages):
    if not to:
        raise ValueError("缺少 LINE User ID")
    response = requests.post(
        PUSH_URL,
        headers=get_headers(),
        json={"to": to, "messages": messages},
        timeout=15,
    )
    print("LINE evaluation push:", to, response.status_code, response.text[:200])
    response.raise_for_status()


def _text_row(text, color="#555555", weight="regular", size="sm"):
    return {
        "type": "text",
        "text": text,
        "size": size,
        "color": color,
        "weight": weight,
        "wrap": True,
    }


def _build_event_card(event):
    is_minus = event.get("direction") == "minus"
    points_text = _points_label(event.get("points"))
    title = "📋 考核紀錄通知" if is_minus else "🌟 加分通知"

    rows = [
        _text_row(title, color="#111111", weight="bold", size="lg"),
        {"type": "separator", "margin": "md"},
        _text_row(f"日期：{_date_label(event.get('event_date'))}"),
        _text_row(f"項目：{event.get('type_name')}"),
    ]

    if event.get("overdue_days"):
        rows.append(_text_row(f"逾期：{event['overdue_days']} 天"))

    # 給老師的通知只寫事件，不顯示分數
    if event.get("note"):
        rows.append(_text_row(f"說明：{event['note']}"))

    bubble = {
        "type": "bubble",
        "size": "kilo",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": rows,
        },
    }

    if is_minus:
        settings = _get_settings()
        days = settings.get("auto_confirm_days") or 3
        rows.append(
            _text_row(
                f"請在 {days} 天內回覆，未回覆將自動確認。",
                color="#888888",
                size="xs",
            )
        )
        bubble["footer"] = {
            "type": "box",
            "layout": "horizontal",
            "spacing": "sm",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "height": "sm",
                    "action": {
                        "type": "postback",
                        "label": "確認",
                        "data": f"action=evaluation_confirm&event_id={event['id']}",
                        "displayText": "確認這筆考核紀錄",
                    },
                },
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "sm",
                    "action": {
                        "type": "postback",
                        "label": "有異議",
                        "data": f"action=evaluation_dispute&event_id={event['id']}",
                        "displayText": "我對這筆考核紀錄有異議",
                    },
                },
            ],
        }

    return {
        "type": "flex",
        "altText": f"{title}：{event.get('type_name')}",
        "contents": bubble,
    }


# =========================================================
# 網頁呼叫：通知老師
# =========================================================

def notify_event(event_id):
    event = _get_event(event_id)
    if not event:
        return {"success": False, "message": "找不到這筆考核紀錄"}

    teacher = event.get("teachers") or {}
    line_user_id = teacher.get("line_user_id")

    if not line_user_id:
        _update_event(event_id, {"notify_error": "老師尚未綁定 LINE"})
        return {"success": False, "message": f"{_teacher_name(teacher)} 尚未綁定 LINE，沒有送出通知"}

    try:
        _push(line_user_id, [_build_event_card(event)])
    except Exception as error:
        _update_event(event_id, {"notify_error": str(error)[:300]})
        return {"success": False, "message": f"LINE 通知失敗：{error}"}

    _update_event(event_id, {"notified_at": _now().isoformat(), "notify_error": None})
    return {"success": True}


def notify_decision(event_id):
    """主管處理完異議後，通知老師結果。"""
    event = _get_event(event_id)
    if not event:
        return {"success": False, "message": "找不到這筆考核紀錄"}

    teacher = event.get("teachers") or {}
    line_user_id = teacher.get("line_user_id")
    if not line_user_id:
        return {"success": False, "message": "老師尚未綁定 LINE"}

    if event.get("status") == "void":
        result = "已撤銷，不列入計分"
    else:
        result = "維持紀錄"

    lines = [
        "📋 考核異議處理結果",
        "",
        f"日期：{_date_label(event.get('event_date'))}",
        f"項目：{event.get('type_name')}",
        f"結果：{result}",
    ]
    if event.get("admin_note"):
        lines.append(f"主管說明：{event['admin_note']}")

    try:
        _push(line_user_id, [{"type": "text", "text": "\n".join(lines)}])
    except Exception as error:
        return {"success": False, "message": f"LINE 通知失敗：{error}"}
    return {"success": True}


# =========================================================
# 網頁呼叫：同步（逾期自動扣分、自動確認）
# =========================================================

def _auto_confirm(settings):
    days = int(settings.get("auto_confirm_days") or 3)
    cutoff = (_now() - timedelta(days=days)).isoformat()

    pending = (
        supabase.table(EVENTS)
        .select("id, notified_at, created_at")
        .eq("status", "pending")
        .execute()
        .data
        or []
    )
    confirmed = 0
    for row in pending:
        started = row.get("notified_at") or row.get("created_at")
        if started and started <= cutoff:
            _update_event(row["id"], {
                "status": "confirmed",
                "confirmed_by": "auto",
                "confirmed_at": _now().isoformat(),
            })
            confirmed += 1

    # 按了「有異議」卻沒寫原因：超過時間就交給主管處理
    window = (_now() - timedelta(minutes=DISPUTE_REASON_WINDOW_MINUTES)).isoformat()
    stale = (
        supabase.table(EVENTS)
        .select("id")
        .eq("status", "disputing")
        .lte("dispute_requested_at", window)
        .execute()
        .data
        or []
    )
    for row in stale:
        _update_event(row["id"], {"status": "disputed", "dispute_reason": "（老師沒有填寫原因）"})

    return {"auto_confirmed": confirmed, "stale_disputes": len(stale)}


def sync_evaluation():
    # 任務逾期不寫成事件：考核頁直接從老師任務計算「行政配合」
    settings = _get_settings()
    result = {}
    try:
        result["confirm"] = _auto_confirm(settings)
    except Exception as error:
        print("考核自動確認失敗：", error)
        result["confirm"] = {"error": str(error)}
    result["success"] = True
    return result


# =========================================================
# LINE webhook：老師按鈕與回覆原因（都不丟錯）
# =========================================================

def _event_for_teacher(event_id, line_user_id):
    event = _get_event(event_id)
    if not event:
        return None, "找不到這筆考核紀錄。"
    teacher = event.get("teachers") or {}
    if not line_user_id or teacher.get("line_user_id") != line_user_id:
        return None, "這筆考核紀錄不是你的，無法操作。"
    return event, None


def handle_teacher_confirm(event_id, line_user_id):
    try:
        event, error = _event_for_teacher(event_id, line_user_id)
        if error:
            return error
        status = event.get("status")
        if status == "confirmed":
            return "✅ 這筆紀錄已經確認過了。"
        if status in ("disputing", "disputed"):
            return "這筆紀錄已提出異議，正在等主管處理。"
        if status == "void":
            return "這筆紀錄已撤銷。"
        _update_event(event_id, {
            "status": "confirmed",
            "confirmed_by": "teacher",
            "confirmed_at": _now().isoformat(),
        })
        return f"✅ 已確認：{event.get('type_name')}"
    except Exception as error:
        print("考核確認失敗：", error)
        return "系統忙碌中，請稍後再按一次。"


def handle_teacher_dispute(event_id, line_user_id):
    try:
        event, error = _event_for_teacher(event_id, line_user_id)
        if error:
            return error
        status = event.get("status")
        if status == "confirmed":
            return "這筆紀錄已經確認，如有問題請直接找主管。"
        if status == "disputed":
            return "已收到你的異議，正在等主管處理。"
        if status == "void":
            return "這筆紀錄已撤銷。"
        _update_event(event_id, {
            "status": "disputing",
            "dispute_requested_at": _now().isoformat(),
        })
        return (
            "📝 請直接回覆一段文字，說明你的異議原因。\n"
            f"（{DISPUTE_REASON_WINDOW_MINUTES} 分鐘內回覆有效）"
        )
    except Exception as error:
        print("考核異議失敗：", error)
        return "系統忙碌中，請稍後再按一次。"


def capture_dispute_reason(teacher, text):
    """
    老師按了「有異議」後傳來的下一句文字，當作異議原因。
    有接手就回傳要回覆的字串；沒有就回傳 None（交給原本的流程處理）。
    """
    try:
        if not teacher or not teacher.get("id"):
            return None
        window = (_now() - timedelta(minutes=DISPUTE_REASON_WINDOW_MINUTES)).isoformat()
        rows = (
            supabase.table(EVENTS)
            .select("id, type_name, event_date, points")
            .eq("teacher_id", teacher["id"])
            .eq("status", "disputing")
            .gte("dispute_requested_at", window)
            .order("dispute_requested_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        event = rows[0]
        _update_event(event["id"], {"status": "disputed", "dispute_reason": text[:500]})

        admin_line_user_id = os.getenv("ADMIN_LINE_USER_ID")
        if admin_line_user_id:
            try:
                _push(admin_line_user_id, [{
                    "type": "text",
                    "text": (
                        "⚠️ 老師對考核紀錄有異議\n\n"
                        f"老師：{_teacher_name(teacher)}\n"
                        f"日期：{_date_label(event.get('event_date'))}\n"
                        f"項目：{event.get('type_name')} {_points_label(event.get('points'))}\n"
                        f"原因：{text[:500]}\n\n"
                        "請到「教師考核」處理。"
                    ),
                }])
            except Exception as error:
                print("通知主管考核異議失敗：", error)

        return "✅ 已收到你的異議原因，主管會再跟你確認。"
    except Exception as error:
        print("記錄考核異議原因失敗：", error)
        return None
