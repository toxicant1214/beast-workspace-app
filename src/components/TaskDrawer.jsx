import { useEffect, useState } from "react";
import { updateTodo } from "../services/todoService";

const REMINDER_OPTIONS = [
  {
    value: "30_minutes",
    label: "30 分鐘前提醒",
    requiresTime: true,
  },
  {
    value: "1_hour",
    label: "1 小時前提醒",
    requiresTime: true,
  },
  {
    value: "2_hours",
    label: "2 小時前提醒",
    requiresTime: true,
  },
  {
    value: "1_day",
    label: "一天前提醒",
    requiresTime: false,
  },
  {
    value: "2_days",
    label: "兩天前提醒",
    requiresTime: false,
  },
  {
    value: "1_week",
    label: "一週前提醒",
    requiresTime: false,
  },
];

function TaskDrawer({ open, task, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reminderOffsets, setReminderOffsets] = useState([]);

  useEffect(() => {
    if (!task) return;

    const date = task.deadline_at
      ? new Date(task.deadline_at)
      : null;

    setTitle(task.title || "");
    setPriority(task.priority || "normal");
    setReminderOffsets(task.reminder_offsets || []);

    if (!date) {
      setDeadlineDate("");
      setDeadlineTime("");
      return;
    }

    const taipeiParts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).formatToParts(date);

    const parts = Object.fromEntries(
      taipeiParts.map((part) => [
        part.type,
        part.value,
      ])
    );

    setDeadlineDate(
      `${parts.year}-${parts.month}-${parts.day}`
    );

    setDeadlineTime(
      task.has_time
        ? `${parts.hour}:${parts.minute}`
        : ""
    );
  }, [task]);

  if (!open || !task) return null;

  function toggleReminder(value) {
    setReminderOffsets((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  }

  async function handleSave() {
    const time = deadlineTime || "23:59";

    const deadline_at = new Date(
      `${deadlineDate}T${time}:00+08:00`
    ).toISOString();

    const validReminderOffsets = reminderOffsets.filter(
      (item) => {
        const option = REMINDER_OPTIONS.find(
          (reminder) => reminder.value === item
        );

        if (!option) return false;

        return !option.requiresTime || Boolean(deadlineTime);
      }
    );

    await updateTodo(task.id, {
      title,
      priority,
      deadline_at,
      has_time: Boolean(deadlineTime),
      reminder_offsets: validReminderOffsets,
    });

    onSaved();
    onClose();
  }

  return (
    <div
      className="drawerBackdrop"
      onClick={onClose}
    >
      <div
        className="drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawerHeader">
          <h2>編輯任務</h2>

          <button
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label>
          任務名稱
          <input
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
          />
        </label>

        <label>
          截止日期
          <input
            type="date"
            value={deadlineDate}
            onChange={(event) =>
              setDeadlineDate(event.target.value)
            }
            required
          />
        </label>

        <label>
          截止時間
          <input
            type="time"
            value={deadlineTime}
            onChange={(event) =>
              setDeadlineTime(event.target.value)
            }
          />
        </label>

        <label>
          重要程度
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value)
            }
          >
            <option value="normal">一般</option>
            <option value="high">重要</option>
            <option value="urgent">
              非常重要
            </option>
          </select>
        </label>

        <div className="drawerSection">
          <p className="drawerSectionTitle">
            提醒設定（可複選）
          </p>

          {REMINDER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="reminderOption"
            >
              <input
                type="checkbox"
                checked={reminderOffsets.includes(
                  option.value
                )}
                disabled={
                  !deadlineDate ||
                  (option.requiresTime &&
                    !deadlineTime)
                }
                onChange={() =>
                  toggleReminder(option.value)
                }
              />

              {option.label}
            </label>
          ))}

          {!deadlineDate && (
            <div className="emptyText">
              請先選擇截止日期
            </div>
          )}

          {deadlineDate && !deadlineTime && (
            <div className="emptyText">
              30 分鐘、1 小時及 2 小時前提醒，需要先設定截止時間
            </div>
          )}
        </div>

        <div className="drawerActions">
          <button
            type="button"
            onClick={onClose}
          >
            取消
          </button>

          <button
            type="button"
            onClick={handleSave}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDrawer;