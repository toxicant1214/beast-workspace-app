import os
import requests
from dotenv import load_dotenv

load_dotenv()

LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")


def send_line_message(text):
    url = "https://api.line.me/v2/bot/message/broadcast"

    headers = {
        "Authorization": f"Bearer {LINE_TOKEN}",
        "Content-Type": "application/json",
    }

    data = {
        "messages": [
            {
                "type": "text",
                "text": text,
            }
        ]
    }

    response = requests.post(url, headers=headers, json=data)

    print(response.status_code)
    print(response.text)