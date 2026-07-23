import { useState } from "react";

const REMINDER_OPTIONS = [
  {
    value: "same_day",
    label: "當天提醒",
  },
  {
    value: "1_day",
    label: "一天前提醒",
  },
  {
    value: "2_days",
    label: "兩天前提醒",
  },
  {
    value: "1_week",
    label: "一週前提醒",
  },
];

function TaskCard({ tasks = [], onComplete, onAdd, onDelete }) {
  const [title, setTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reminderOffsets, setReminderOffsets] = useState([]);
  const [showDetails, setShowDetails] = useState(false);

  function toggleReminder(reminderValue) {
    setReminderOffsets((current) => {
      if (current.includes(reminderValue)) {
        return current.filter((item) => item !== reminderValue);
      }

      return [...current, reminderValue];
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) return;

    let deadline_at = null;
    let has_time = false;

    if (deadlineDate) {
      const time = deadlineTime || "23:59";

      has_time = Boolean(deadlineTime);

      // 明確指定台灣時區，避免正式環境發生 8 小時誤差。
      deadline_at = new Date(
        `${deadlineDate}T${time}:00+08:00`
      ).toISOString();
    }

    onAdd({
      title: title.trim(),
      priority,
      deadline_at,
      has_time,
      reminder_offsets: deadlineDate
        ? reminderOffsets
        : [],
    });

    setTitle("");
    setDeadlineDate("");
    setDeadlineTime("");
    setPriority("normal");
    setReminderOffsets([]);
    setShowDetails(false);
  }

  function getPriorityLabel(taskPriority) {
    if (taskPriority === "urgent") return "非常重要";
    if (taskPriority === "high") return "重要";

    return "一般";
  }

  function formatReminderText(reminders) {
    if (!Array.isArray(reminders) || reminders.length === 0) {
      return "不提醒";
    }

    const reminderLabels = {
      same_day: "當天",
      "1_day": "一天前",
      "2_days": "兩天前",
      "1_week": "一週前",
    };

    return reminders
      .map((item) => reminderLabels[item] || item)
      .join("、");
  }

  function formatDeadline(task) {
    if (!task.deadline_at) return "未設定日期";

    const date = new Date(task.deadline_at);

    if (!task.has_time) {
      return date.toLocaleDateString("zh-TW", {
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Taipei",
      });
    }

    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    });
  }

  function getDeadlineStatus(task) {
    if (!task.deadline_at) return "soon";

    const now = new Date();
    const deadline = new Date(task.deadline_at);

    const diffMs = deadline - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffMs < 0) return "overdue";
    if (diffDays <= 7) return "soon";

    return "later";
  }

  function getDeadlineLabel(task) {
    const status = getDeadlineStatus(task);

    if (status === "overdue") return "已逾期";
    if (status === "soon") return "7 天內";

    return "一週後";
  }

  return (
    <section className="dashboardCard">
      <p className="eyebrow">TASK CENTER</p>
      <h2>我的待辦</h2>

      <form
        className="taskForm taskFormVertical"
        onSubmit={handleSubmit}
      >
        <div className="taskQuickRow">
          <input
            className="taskInput"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="新增一個待辦事項..."
          />

          <button
            type="submit"
            className="taskAddButton"
          >
            新增
          </button>
        </div>

        <button
          type="button"
          className="taskDetailToggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails
            ? "收起詳細設定"
            : "＋ 詳細設定"}
        </button>

        {showDetails && (
          <div className="taskDetails">
            <input
              className="taskSmallInput"
              type="date"
              value={deadlineDate}
              onChange={(event) =>
                setDeadlineDate(event.target.value)
              }
              required
            />

            <input
              className="taskSmallInput"
              type="time"
              value={deadlineTime}
              onChange={(event) =>
                setDeadlineTime(event.target.value)
              }
            />

            <select
              className="taskSmallInput"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value)
              }
            >
              <option value="normal">一般</option>
              <option value="high">重要</option>
              <option value="urgent">非常重要</option>
            </select>

            <div className="taskReminderOptions">
              <div className="taskReminderTitle">
                LINE 提醒時間（可複選）
              </div>

              {REMINDER_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="taskReminderOption"
                >
                  <input
                    type="checkbox"
                    checked={reminderOffsets.includes(
                      option.value
                    )}
                    disabled={!deadlineDate}
                    onChange={() =>
                      toggleReminder(option.value)
                    }
                  />

                  <span>{option.label}</span>
                </label>
              ))}

              {!deadlineDate && (
                <div className="emptyText">
                  請先選擇截止日期
                </div>
              )}
            </div>
          </div>
        )}
      </form>

      <div className="pendingList">
        {tasks.length === 0 ? (
          <div className="emptyText">
            目前沒有待辦事項
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="taskItem"
            >
              <button
                type="button"
                className="taskCheck"
                onClick={() => onComplete(task.id)}
              >
                □
              </button>

              <div className="taskContent">
                <span className="taskTitle">
                  {task.title}
                </span>

                <span className="taskMeta">
                  <span
                    className={`deadlineBadge ${getDeadlineStatus(
                      task
                    )}`}
                  >
                    {getDeadlineLabel(task)}
                  </span>

                  {formatDeadline(task)}
                  {" · "}
                  {getPriorityLabel(task.priority)}
                  {" · 提醒："}
                  {formatReminderText(
                    task.reminder_offsets
                  )}
                </span>
              </div>

              <button
                type="button"
                className="taskDelete"
                onClick={() => onDelete(task.id)}
              >
                刪除
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default TaskCard;