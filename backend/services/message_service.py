from datetime import datetime, timezone


def parse_deadline(task):
    deadline = task.get("deadline_at")
    if not deadline:
        return None
    return datetime.fromisoformat(deadline.replace("Z", "+00:00"))


def format_deadline(task):
    dt = parse_deadline(task)
    if not dt:
        return "未設定日期"

    if task.get("has_time"):
        return dt.strftime("%m/%d %H:%M")

    return dt.strftime("%m/%d")


def get_priority_text(priority):
    if priority == "urgent":
        return "🔴 非常重要"
    if priority == "high":
        return "🟠 重要"
    return "🟢 一般"


def split_tasks(tasks):
    now = datetime.now(timezone.utc)

    overdue = []
    soon = []
    later = []
    no_date = []

    for task in tasks:
        deadline = parse_deadline(task)

        if not deadline:
            no_date.append(task)
            continue

        diff_days = (deadline - now).total_seconds() / 86400

        if deadline < now:
            overdue.append(task)
        elif diff_days <= 7:
            soon.append(task)
        else:
            later.append(task)

    return overdue, soon, later, no_date


def add_section(lines, title, tasks, start_index):
    if not tasks:
        return start_index

    lines.append(title)

    index = start_index
    for task in tasks:
        task_title = task.get("title", "未命名任務")
        deadline = format_deadline(task)
        priority = get_priority_text(task.get("priority", "normal"))

        lines.append(f"{index}. {task_title}")
        lines.append(f"   📅 {deadline}｜{priority}")
        lines.append("")
        index += 1

    return index


def build_daily_task_message(tasks):
    if not tasks:
        return "☀️ BEAST Workspace 每日晨報\n\n目前沒有未完成待辦。"

    overdue, soon, later, no_date = split_tasks(tasks)

    lines = ["☀️ BEAST Workspace 每日晨報", ""]

    index = 1
    index = add_section(lines, "🚨 已逾期", overdue, index)
    index = add_section(lines, "🔥 7 天內", soon, index)
    index = add_section(lines, "🌿 一週後", later, index)
    index = add_section(lines, "🗂 未設定日期", no_date, index)

    return "\n".join(lines)
def get_tasks_in_display_order(tasks):
    overdue, soon, later, no_date = split_tasks(tasks)

    return overdue + soon + later + no_date