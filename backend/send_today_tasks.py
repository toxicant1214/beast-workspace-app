from services.task_service import get_active_tasks
from services.message_service import build_daily_task_message
from services.line_service import send_line_message


def main():
    tasks = get_active_tasks()
    message = build_daily_task_message(tasks)

    print(message)
    send_line_message(message)


if __name__ == "__main__":
    main()