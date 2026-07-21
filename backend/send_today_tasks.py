import os

from dotenv import load_dotenv

from services.task_service import get_active_tasks
from services.message_service import build_daily_task_message
from services.line_service import send_line_message_to_user


load_dotenv()

ADMIN_LINE_USER_ID = os.getenv("ADMIN_LINE_USER_ID")


def main():
    if not ADMIN_LINE_USER_ID:
        raise RuntimeError(
            "缺少 ADMIN_LINE_USER_ID，無法發送個人待辦晨報。"
        )

    tasks = get_active_tasks()
    message = build_daily_task_message(tasks)

    print(message)

    send_line_message_to_user(
        ADMIN_LINE_USER_ID,
        message,
    )


if __name__ == "__main__":
    main()