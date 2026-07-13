import { useEffect, useState } from "react";
import { updateTodo } from "../services/todoService";

function TaskDrawer({ open, task, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reminderOffsets, setReminderOffsets] = useState([]);

  useEffect(() => {
    if (!task) return;

    const date = task.deadline_at ? new Date(task.deadline_at) : null;

    setTitle(task.title || "");
    setDeadlineDate(date ? date.toISOString().slice(0, 10) : "");
    setDeadlineTime(date && task.has_time ? date.toTimeString().slice(0, 5) : "");
    setPriority(task.priority || "normal");
    setReminderOffsets(task.reminder_offsets || []);
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
    const deadline_at = new Date(`${deadlineDate}T${time}`).toISOString();

    await updateTodo(task.id, {
      title,
      priority,
      deadline_at,
      has_time: Boolean(deadlineTime),
      reminder_offsets: reminderOffsets,
    });

    onSaved();
    onClose();
  }

  return (
    <div className="drawerBackdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawerHeader">
          <h2>編輯任務</h2>
          <button onClick={onClose}>×</button>
        </div>

        <label>
          任務名稱
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label>
          截止日期
          <input
            type="date"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
            required
          />
        </label>

        <label>
          截止時間
          <input
            type="time"
            value={deadlineTime}
            onChange={(e) => setDeadlineTime(e.target.value)}
          />
        </label>

        <label>
          重要程度
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="normal">一般</option>
            <option value="high">重要</option>
            <option value="urgent">非常重要</option>
          </select>
        </label>

        <div className="drawerSection">
          <p className="drawerSectionTitle">提醒設定</p>

          <label className="reminderOption">
            <input
              type="checkbox"
              checked={reminderOffsets.includes("same_day")}
              onChange={() => toggleReminder("same_day")}
            />
            當天提醒
          </label>

          <label className="reminderOption">
            <input
              type="checkbox"
              checked={reminderOffsets.includes("one_day_before")}
              onChange={() => toggleReminder("one_day_before")}
            />
            一天前提醒
          </label>

          <label className="reminderOption">
            <input
              type="checkbox"
              checked={reminderOffsets.includes("two_days_before")}
              onChange={() => toggleReminder("two_days_before")}
            />
            兩天前提醒
          </label>

          <label className="reminderOption">
            <input
              type="checkbox"
              checked={reminderOffsets.includes("one_week_before")}
              onChange={() => toggleReminder("one_week_before")}
            />
            一週前提醒
          </label>
        </div>

        <div className="drawerActions">
          <button onClick={onClose}>取消</button>
          <button onClick={handleSave}>儲存</button>
        </div>
      </div>
    </div>
  );
}

export default TaskDrawer;