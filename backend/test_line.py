from dotenv import load_dotenv
import os
import requests

load_dotenv()

TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
print("TOKEN length:", len(TOKEN) if TOKEN else "NO TOKEN")

url = "https://api.line.me/v2/bot/message/broadcast"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

data = {
    "messages": [
        {
            "type": "text",
            "text": "🎉 BEAST Workspace 提醒系統測試成功！"
        }
    ]
}

response = requests.post(url, headers=headers, json=data)

print(response.status_code)
print(response.text)