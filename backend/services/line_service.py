import os

import requests
from dotenv import load_dotenv


load_dotenv()

LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")


def get_headers():
    return {
        "Authorization": f"Bearer {LINE_TOKEN}",
        "Content-Type": "application/json",
    }


def send_line_message(text):
    """廣播給全部好友，用於每日晨報。"""

    url = "https://api.line.me/v2/bot/message/broadcast"

    data = {
        "messages": [
            {
                "type": "text",
                "text": text,
            }
        ]
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE broadcast:", response.status_code, response.text)
    response.raise_for_status()


def reply_message(reply_token, text):
    """回覆目前傳訊息給 Workspace 的使用者。"""

    url = "https://api.line.me/v2/bot/message/reply"

    data = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "text",
                "text": text,
            }
        ],
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE reply:", response.status_code, response.text)
    response.raise_for_status()


def reply_date_options(reply_token):
    """回覆截止日期快捷選項。"""

    url = "https://api.line.me/v2/bot/message/reply"

    data = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "template",
                "altText": "請選擇截止日期",
                "template": {
                    "type": "buttons",
                    "text": "📅 請選擇截止日期",
                    "actions": [
                        {
                            "type": "postback",
                            "label": "今天",
                            "data": "action=set_task_date&date_option=today",
                            "displayText": "截止日期：今天",
                        },
                        {
                            "type": "postback",
                            "label": "明天",
                            "data": "action=set_task_date&date_option=tomorrow",
                            "displayText": "截止日期：明天",
                        },
                        {
                            "type": "postback",
                            "label": "後天",
                            "data": (
                                "action=set_task_date"
                                "&date_option=day_after_tomorrow"
                            ),
                            "displayText": "截止日期：後天",
                        },
                        {
                            "type": "postback",
                            "label": "自訂日期",
                            "data": "action=set_task_date&date_option=custom",
                            "displayText": "自訂截止日期",
                        },
                    ],
                },
            }
        ],
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE date options:", response.status_code, response.text)
    response.raise_for_status()


def reply_time_options(reply_token):
    """詢問待辦是否需要指定截止時間。"""

    url = "https://api.line.me/v2/bot/message/reply"

    data = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "template",
                "altText": "是否設定截止時間",
                "template": {
                    "type": "confirm",
                    "text": "🕒 是否要設定截止時間？",
                    "actions": [
                        {
                            "type": "postback",
                            "label": "不設定時間",
                            "data": (
                                "action=set_task_time_option"
                                "&time_option=no_time"
                            ),
                            "displayText": "不設定截止時間",
                        },
                        {
                            "type": "postback",
                            "label": "設定時間",
                            "data": (
                                "action=set_task_time_option"
                                "&time_option=custom_time"
                            ),
                            "displayText": "設定截止時間",
                        },
                    ],
                },
            }
        ],
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE time options:", response.status_code, response.text)
    response.raise_for_status()


def reply_priority_options(reply_token):
    """回覆待辦重要程度選項。"""

    url = "https://api.line.me/v2/bot/message/reply"

    data = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "template",
                "altText": "請選擇重要程度",
                "template": {
                    "type": "buttons",
                    "text": "請選擇重要程度",
                    "actions": [
                        {
                            "type": "postback",
                            "label": "🟢 一般",
                            "data": "action=set_task_priority&priority=normal",
                            "displayText": "重要程度：一般",
                        },
                        {
                            "type": "postback",
                            "label": "🟠 重要",
                            "data": "action=set_task_priority&priority=high",
                            "displayText": "重要程度：重要",
                        },
                        {
                            "type": "postback",
                            "label": "🔴 非常重要",
                            "data": "action=set_task_priority&priority=urgent",
                            "displayText": "重要程度：非常重要",
                        },
                    ],
                },
            }
        ],
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE priority options:", response.status_code, response.text)
    response.raise_for_status()


def reply_task_cards(reply_token, tasks):
    """回覆可直接點擊完成的待辦卡片。"""

    if not tasks:
        reply_message(reply_token, "📋 目前沒有未完成的待辦事項。")
        return

    bubbles = []

    for task in tasks[:10]:
        task_id = str(task["id"])
        title = task.get("title") or "未命名任務"

        deadline_text = "未設定日期"

        if task.get("deadline_at"):
            deadline_text = str(task["deadline_at"])[:10]

        priority = task.get("priority", "normal")

        if priority == "urgent":
            priority_text = "非常重要"
        elif priority == "high":
            priority_text = "重要"
        else:
            priority_text = "一般"

        bubbles.append(
            {
                "type": "bubble",
                "size": "kilo",
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": title,
                            "weight": "bold",
                            "size": "lg",
                            "wrap": True,
                        },
                        {
                            "type": "text",
                            "text": f"截止：{deadline_text}",
                            "size": "sm",
                            "color": "#777777",
                            "wrap": True,
                        },
                        {
                            "type": "text",
                            "text": f"重要程度：{priority_text}",
                            "size": "sm",
                            "color": "#777777",
                            "wrap": True,
                        },
                    ],
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "button",
                            "style": "primary",
                            "height": "sm",
                            "action": {
                                "type": "postback",
                                "label": "✅ 標記完成",
                                "data": (
                                    f"action=complete_task"
                                    f"&task_id={task_id}"
                                ),
                                "displayText": f"完成：{title}",
                            },
                        }
                    ],
                },
            }
        )

    url = "https://api.line.me/v2/bot/message/reply"

    data = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "flex",
                "altText": "BEAST Workspace 待辦清單",
                "contents": {
                    "type": "carousel",
                    "contents": bubbles,
                },
            }
        ],
    }

    response = requests.post(
        url,
        headers=get_headers(),
        json=data,
        timeout=15,
    )

    print("LINE task cards:", response.status_code, response.text)
    response.raise_for_status()