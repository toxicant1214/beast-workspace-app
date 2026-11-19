"""
預覽請假流程在晨報裡會長什麼樣子（只印出來，不會發 LINE）

用法（在 backend 資料夾）：
    python3 preview_leave_morning.py            # 今天
    python3 preview_leave_morning.py 2026-11-20 # 指定日期
"""

import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

from send_teacher_daily_summary import get_active_line_teachers  # noqa: E402
from services.leave_workflow_service import (  # noqa: E402
    build_admin_leave_overview,
    build_substitute_section,
    get_today_substitute_items,
)


def main():
    if len(sys.argv) > 1:
        day = sys.argv[1]
    else:
        day = datetime.now(ZoneInfo("Asia/Taipei")).date().isoformat()

    print(f"===== 主管晨報新增段落（{day}）=====")
    print("\n".join(build_admin_leave_overview(day)))

    print()
    print(f"===== 老師晨報「今日代班」（{day}）=====")
    found = False
    for teacher in get_active_line_teachers():
        items = get_today_substitute_items(teacher["id"], day)
        if not items:
            continue
        found = True
        print(f"\n--- {teacher.get('chinese_name')} ---")
        print("\n".join(build_substitute_section(items)))

    if not found:
        print("這天沒有已經主管確認的代班。")


if __name__ == "__main__":
    main()
