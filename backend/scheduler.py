import schedule
import time
from datetime import datetime
from send_today_tasks import main as send_today_tasks


def morning_report():
    print("=================================")
    print("☀️ 開始發送每日待辦")
    print(datetime.now())
    print("=================================")

    send_today_tasks()


# 測試用：每 10 秒發一次
schedule.every().day.at("09:00").do(morning_report)

print("⏳ 排程已啟動，每天 09:00 發送每日待辦。")
print("保持這個程式執行，才會自動發送。")

while True:
    schedule.run_pending()
    time.sleep(1)