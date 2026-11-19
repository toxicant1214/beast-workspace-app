"""
請假流程：LINE 通知與晨報段落

這個檔案的所有「晨報用」函式都不會丟出錯誤：
讀取或組字失敗時，直接回傳原本的晨報內容，確保原本的晨報照常發送。
"""

import os

import requests

from services.line_service import get_headers
from services.teacher_service import supabase


WEB_APP_URL = os.getenv(
    "LEAVE_WEB_APP_URL",
    "https://beastworkspace.netlify.app",
).rstrip("/")

WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"]


# =========================================================
# 小工具
# =========================================================

def _teacher_name(teacher):
    teacher = teacher or {}
    return (
        teacher.get("chinese_name")
        or teacher.get("english_name")
        or "老師"
    )


def _date_label(date_text):
    if not date_text:
        return ""
    from datetime import date

    year, month, day = [int(x) for x in str(date_text).split("-")]
    weekday = date(year, month, day).weekday()
    return f"{month}/{day}（{WEEKDAY_LABELS[weekday]}）"


def _time_label(item):
    if item.get("category") == "slot":
        return item.get("title") or ""
    start = str(item.get("start_time") or "")[:5]
    end = str(item.get("end_time") or "")[:5]
    if start and end:
        return f"{start}–{end}"
    return start or "未設定時間"


def _present_students(item):
    return [
        s for s in (item.get("students") or [])
        if s.get("status") == "present"
    ]


def _needs_coverage(item):
    if item.get("category") != "slot":
        return True
    return len(_present_students(item)) > 0


def _item_line(item):
    kids = _present_students(item)
    title = "" if item.get("category") == "slot" else f" {item.get('title') or ''}"
    tags = item.get("activity_tags") or []
    if tags:
        title += f"｜{'、'.join(tags)}"
    count = f"｜{len(kids)} 人" if kids else ""
    return f"{_time_label(item)}{title}{count}"


def _to_min(t):
    t = str(t or "")[:5]
    if not t:
        return None
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def merge_item_lines(items, with_date=True):
    """
    精簡顯示：同一天、時間相連（間隔 10 分鐘內）的班級時段合併成一行；
    接送、美語等其他格子各自一行。
    """
    lines = []
    current = None  # [date, start, end, count]

    def flush():
        if current:
            date_text = f"{_date_label(current[0])} " if with_date else ""
            span = f"{current[1]}–{current[2]}"
            extra = f"（{current[3]} 個時段）" if current[3] > 1 else ""
            lines.append(f"・{date_text}{span} 班級照顧{extra}")

    for item in _sorted_items(items):
        if item.get("category") == "slot":
            start = str(item.get("start_time") or "")[:5]
            end = str(item.get("end_time") or "")[:5]
            if (
                current
                and current[0] == item.get("item_date")
                and _to_min(start) is not None
                and _to_min(current[2]) is not None
                and 0 <= _to_min(start) - _to_min(current[2]) <= 10
            ):
                current[2] = end
                current[3] += 1
                continue
            flush()
            current = [item.get("item_date"), start, end, 1]
        else:
            flush()
            current = None
            date_text = f"{_date_label(item.get('item_date'))} " if with_date else ""
            lines.append(f"・{date_text}{_time_label(item)} {item.get('title') or ''}".rstrip())
    flush()
    return lines


def leave_url(request_id):
    return f"{WEB_APP_URL}/?leave={request_id}"


def _date_range_text(request):
    start = request.get("start_date")
    end = request.get("end_date")
    if not end or end == start:
        return _date_label(start)
    return f"{_date_label(start)}～{_date_label(end)}"


# =========================================================
# 讀資料
# =========================================================

def get_leave_request(request_id):
    response = (
        supabase
        .table("leave_requests")
        .select(
            """
            *,
            teachers:teacher_id ( id, chinese_name, english_name, line_user_id ),
            leave_types ( id, name ),
            leave_request_items (
              *,
              substitute_teacher:substitute_teacher_id ( id, chinese_name, english_name, line_user_id ),
              substitute_external:substitute_external_id ( id, name )
            )
            """
        )
        .eq("id", request_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _sorted_items(items):
    return sorted(
        items or [],
        key=lambda i: (
            i.get("item_date") or "",
            str(i.get("start_time") or ""),
            float(i.get("sort_order") or 0),
        ),
    )


# =========================================================
# LINE 卡片（只放「打開查看」按鈕）
# =========================================================

def push_link_card(to, alt_text, title, lines, button_label, url, extra_buttons=None):
    if not to:
        raise ValueError("缺少 LINE User ID")

    body_contents = [
        {
            "type": "text",
            "text": title,
            "weight": "bold",
            "size": "lg",
            "wrap": True,
        }
    ]

    for line in lines[:25]:
        body_contents.append(
            {
                "type": "text",
                "text": line or " ",
                "size": "sm",
                "wrap": True,
                "color": "#555555",
            }
        )

    data = {
        "to": to,
        "messages": [
            {
                "type": "flex",
                "altText": alt_text[:400],
                "contents": {
                    "type": "bubble",
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "sm",
                        "contents": body_contents,
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "button",
                                "style": "primary",
                                "color": "#2B2B2B",
                                "action": {
                                    "type": "uri",
                                    "label": button_label,
                                    "uri": url,
                                },
                            }
                        ]
                        + [
                            {
                                "type": "button",
                                "style": "secondary",
                                "action": {"type": "uri", "label": label, "uri": link},
                            }
                            for label, link in (extra_buttons or [])
                            if link
                        ],
                    },
                },
            }
        ],
    }

    response = requests.post(
        "https://api.line.me/v2/bot/message/push",
        headers=get_headers(),
        json=data,
        timeout=15,
    )
    print("LINE leave card:", to, response.status_code, response.text)
    response.raise_for_status()


# =========================================================
# 通知①：老師送出 → 通知主管
# =========================================================

def notify_admin_submitted(request_id, admin_line_user_id):
    request = get_leave_request(request_id)
    if not request:
        return {"success": False, "message": "找不到這筆請假。"}
    if not request.get("submitted_at"):
        return {"success": False, "message": "這筆請假還沒送出。"}

    items = [i for i in _sorted_items(request.get("leave_request_items")) if _needs_coverage(i)]
    name = _teacher_name(request.get("teachers"))
    leave_type = (request.get("leave_types") or {}).get("name") or ""

    substitutes = []
    for item in items:
        sub = item.get("substitute_teacher") or item.get("substitute_external") or {}
        sub_name = sub.get("chinese_name") or sub.get("name") or item.get("substitute_name") or ""
        if sub_name and sub_name not in substitutes:
            substitutes.append(sub_name)

    lines = [
        f"{name}｜{leave_type}",
        _date_range_text(request),
        f"共 {len(items)} 格，代理：{'、'.join(substitutes) or '—'}",
    ]
    if request.get("reason"):
        lines.append(f"原因：{request['reason']}")
    if request.get("is_last_minute"):
        lines.append("⚠ 臨時假")

    push_link_card(
        to=admin_line_user_id,
        alt_text=f"{name} 送出請假，待主管確認",
        title="📝 請假待主管確認",
        lines=lines,
        button_label="打開查看",
        url=leave_url(request_id),
    )
    return {"success": True}


# =========================================================
# 通知②：主管確認 → 通知每位代理老師
# =========================================================

SHEET_BUCKET = "leave-sheets"
SHEET_LINK_SECONDS = 7 * 24 * 60 * 60


def sheet_signed_url(request_id, teacher_id):
    """代班老師自己那頁確認單的 7 天連結；沒有檔案或失敗就回 None（不擋通知）。"""
    try:
        result = supabase.storage.from_(SHEET_BUCKET).create_signed_url(
            f"{request_id}/{teacher_id}.pdf", SHEET_LINK_SECONDS
        )
        if isinstance(result, dict):
            return result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
        return getattr(result, "signed_url", None)
    except Exception as error:
        print("代班確認單連結失敗：", teacher_id, error)
        return None


def notify_substitutes_approved(request_id, only_unacked=False, item_ids=None):
    request = get_leave_request(request_id)
    if not request:
        return {"success": False, "message": "找不到這筆請假。"}
    if not request.get("approved_at"):
        return {"success": False, "message": "這筆請假還沒主管確認。"}

    leave_name = _teacher_name(request.get("teachers"))
    items = [i for i in _sorted_items(request.get("leave_request_items")) if _needs_coverage(i)]

    by_teacher = {}
    no_line = []
    wanted = {str(i) for i in (item_ids or [])}
    for item in items:
        if only_unacked and item.get("ack_at"):
            continue
        if wanted and str(item.get("id")) not in wanted:
            continue
        sub = item.get("substitute_teacher")
        if not sub:
            external = item.get("substitute_external")
            other_name = (external or {}).get("name") or item.get("substitute_name")
            if other_name and other_name not in no_line:
                no_line.append(other_name)
            continue
        by_teacher.setdefault(sub["id"], {"teacher": sub, "items": []})
        by_teacher[sub["id"]]["items"].append(item)

    sent = []
    failed = []
    for entry in by_teacher.values():
        teacher = entry["teacher"]
        sub_name = _teacher_name(teacher)
        if not teacher.get("line_user_id"):
            no_line.append(sub_name)
            continue

        lines = [f"代 {leave_name} 老師", ""] + merge_item_lines(entry["items"])

        try:
            push_link_card(
                to=teacher["line_user_id"],
                alt_text=f"代班通知：代 {leave_name} 老師",
                title="🔁 代班通知",
                lines=lines + ["", "孩子名單和交接內容請點下方按鈕查看，並按「我已了解」。"],
                button_label="打開查看並確認",
                url=leave_url(request_id),
                extra_buttons=[("查看我的代班確認單", sheet_signed_url(request_id, teacher["id"]))],
            )
            sent.append(sub_name)
        except Exception as error:
            print("代班通知失敗：", sub_name, error)
            failed.append(sub_name)

    return {
        "success": True,
        "sent": sent,
        "failed": failed,
        "no_line": no_line,
    }


# =========================================================
# 通知③：主管確認後換掉代理人、或取消請假 → 通知原本的代理老師
# =========================================================

def notify_removed_substitutes(request_id, teacher_ids, item_ids=None, reason="changed"):
    request = get_leave_request(request_id)
    if not request:
        return {"success": False, "message": "找不到這筆請假。"}
    if not request.get("approved_at"):
        return {"success": True, "sent": [], "skipped": "還沒主管確認，不用通知。"}

    ids = [str(t) for t in (teacher_ids or []) if t]
    if not ids:
        return {"success": True, "sent": []}

    teachers = (
        supabase
        .table("teachers")
        .select("id, chinese_name, english_name, line_user_id")
        .in_("id", ids)
        .execute()
    ).data or []

    leave_name = _teacher_name(request.get("teachers"))
    all_items = {str(i.get("id")): i for i in (request.get("leave_request_items") or [])}
    wanted_items = [all_items[str(i)] for i in (item_ids or []) if str(i) in all_items]

    sent, no_line, failed = [], [], []
    for teacher in teachers:
        name = _teacher_name(teacher)
        if not teacher.get("line_user_id"):
            no_line.append(name)
            continue

        if reason == "cancelled":
            title = "❎ 代班取消"
            lines = [f"{leave_name} 老師的請假已取消，", "原本安排給你的代班都不用了。", "", _date_range_text(request)]
        else:
            title = "🔄 代班異動"
            lines = [f"代 {leave_name} 老師的以下時段，", "已改由其他老師負責，你不用代班了：", ""]
            lines += merge_item_lines(wanted_items)

        try:
            push_link_card(
                to=teacher["line_user_id"],
                alt_text=f"{title}：{leave_name} 老師",
                title=title,
                lines=lines,
                button_label="打開查看",
                url=leave_url(request_id),
            )
            sent.append(name)
        except Exception as error:
            print("代班異動通知失敗：", name, error)
            failed.append(name)

    return {"success": True, "sent": sent, "failed": failed, "no_line": no_line}


# =========================================================
# 晨報：老師「今日代班」段落（絕不丟錯）
# =========================================================

def get_today_substitute_items(teacher_id, today_date):
    response = (
        supabase
        .table("leave_request_items")
        .select(
            """
            *,
            leave_requests!inner (
              id, status, approved_at,
              teachers:teacher_id ( chinese_name, english_name )
            )
            """
        )
        .eq("substitute_teacher_id", teacher_id)
        .eq("item_date", today_date)
        .execute()
    )
    rows = []
    for item in response.data or []:
        request = item.get("leave_requests") or {}
        if request.get("status") == "cancelled":
            continue
        if not request.get("approved_at"):
            continue
        if not _needs_coverage(item):
            continue
        rows.append(item)
    return _sorted_items(rows)


def build_substitute_section(items):
    """晨報「今日代班」：依請假老師分組、連續時段合併，不列孩子名字。"""
    if not items:
        return []

    lines = ["", "🔁 今日代班"]
    groups = {}
    for item in items:
        request = item.get("leave_requests") or {}
        key = request.get("id") or "?"
        groups.setdefault(key, {"name": _teacher_name(request.get("teachers")), "items": []})
        groups[key]["items"].append(item)

    for group in groups.values():
        lines.append(f"代 {group['name']} 老師：")
        lines += [f"  {line}" for line in merge_item_lines(group["items"], with_date=False)]

        tags = []
        for item in group["items"]:
            for tag in item.get("activity_tags") or []:
                if tag not in tags:
                    tags.append(tag)
        if tags:
            lines.append(f"  內容：{'、'.join(tags)}")

        notes = []
        for item in group["items"]:
            for value in (
                item.get("handover_students"),
                item.get("handover_parents"),
                item.get("handover_progress"),
            ):
                value = (value or "").strip()
                if value and value not in notes:
                    notes.append(value)
        for note in notes[:3]:
            lines.append(f"  ・{note}")
        if len(notes) > 3:
            lines.append("  （其他交接請到系統查看）")

    return lines


def append_substitute_section(message, teacher_id, today_date):
    """把「今日代班」插在晨報問候語後面。出錯就原封不動回傳。"""
    try:
        items = get_today_substitute_items(teacher_id, today_date)
        section = build_substitute_section(items)
        if not section:
            return message
        lines = message.split("\n")
        insert_at = 3 if len(lines) >= 3 else len(lines)
        return "\n".join(lines[:insert_at] + section + lines[insert_at:])
    except Exception as error:
        print("晨報代班段落略過：", error)
        return message


# =========================================================
# 主管晨報：「今日請假與代班總覽」（絕不丟錯）
# =========================================================

def build_admin_leave_overview(today_date):
    response = (
        supabase
        .table("leave_requests")
        .select(
            """
            *,
            teachers:teacher_id ( chinese_name, english_name ),
            leave_types ( name ),
            leave_request_items (
              *,
              substitute_teacher:substitute_teacher_id ( chinese_name, english_name ),
              substitute_external:substitute_external_id ( name )
            )
            """
        )
        .neq("status", "cancelled")
        .lte("start_date", today_date)
        .gte("end_date", today_date)
        .execute()
    )

    lines = ["", "🗓 今日請假與代班"]
    requests_today = response.data or []

    if not requests_today:
        lines.append("今天沒有老師請假。")
        return lines

    for request in requests_today:
        items = [
            i for i in (request.get("leave_request_items") or [])
            if i.get("item_date") == today_date and _needs_coverage(i)
        ]
        name = _teacher_name(request.get("teachers"))
        leave_type = (request.get("leave_types") or {}).get("name") or "請假"

        substitutes = []
        for item in _sorted_items(items):
            sub = item.get("substitute_teacher") or item.get("substitute_external") or {}
            sub_name = sub.get("chinese_name") or sub.get("english_name") or sub.get("name") or item.get("substitute_name")
            if sub_name and sub_name not in substitutes:
                substitutes.append(sub_name)

        lines.append(
            f"・{name}（{leave_type}）今天 {len(items)} 格"
            f"，代理：{'、'.join(substitutes) or '—'}"
        )

        uncovered = [
            i for i in items
            if not i.get("substitute_teacher_id")
            and not i.get("substitute_external_id")
            and not (i.get("substitute_name") or "").strip()
        ]
        unacked = [i for i in items if not i.get("ack_at")]

        if uncovered:
            lines.append(f"  ⚠ 還有 {len(uncovered)} 格沒排代理")
        if not request.get("submitted_at"):
            lines.append("  ⚠ 老師還沒送出")
        elif not request.get("approved_at"):
            lines.append("  ⚠ 還沒主管確認")
        if unacked and request.get("approved_at"):
            lines.append(f"  ⚠ {len(unacked)} 格代理人還沒按確認")

    return lines


def append_admin_leave_overview(message, today_date):
    try:
        return message + "\n" + "\n".join(build_admin_leave_overview(today_date))
    except Exception as error:
        print("主管晨報請假段落略過：", error)
        return message
