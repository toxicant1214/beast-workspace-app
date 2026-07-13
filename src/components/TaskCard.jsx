import { useState } from "react";

function TaskCard({ tasks = [], onComplete, onAdd, onDelete }) {
  const [title, setTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [showDetails, setShowDetails] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) return;

    let deadline_at = null;
    let has_time = false;

    if (deadlineDate) {
      const time = deadlineTime || "23:59";
      has_time = Boolean(deadlineTime);
      deadline_at = new Date(`${deadlineDate}T${time}`).toISOString();
    }

    onAdd({
      title: title.trim(),
      priority,
      deadline_at,
      has_time,
    });

    setTitle("");
    setDeadlineDate("");
    setDeadlineTime("");
    setPriority("normal");
    setShowDetails(false);
  }

  function getPriorityLabel(priority) {
    if (priority === "urgent") return "非常重要";
    if (priority === "high") return "重要";
    return "一般";
  }

  function formatDeadline(task) {
    if (!task.deadline_at) return "未設定日期";

    const date = new Date(task.deadline_at);

    if (!task.has_time) {
      return date.toLocaleDateString("zh-TW", {
        month: "2-digit",
        day: "2-digit",
      });
    }

    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
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

      <form className="taskForm taskFormVertical" onSubmit={handleSubmit}>
        <div className="taskQuickRow">
          <input
            className="taskInput"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="新增一個待辦事項..."
          />

          <button type="submit" className="taskAddButton">
            新增
          </button>
        </div>

        <button
          type="button"
          className="taskDetailToggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "收起詳細設定" : "＋ 詳細設定"}
        </button>

        {showDetails && (
          <div className="taskDetails">
            <input
              className="taskSmallInput"
              type="date"
              value={deadlineDate}
              onChange={(event) => setDeadlineDate(event.target.value)}
              required
            />

            <input
              className="taskSmallInput"
              type="time"
              value={deadlineTime}
              onChange={(event) => setDeadlineTime(event.target.value)}
            />

            <select
              className="taskSmallInput"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="normal">一般</option>
              <option value="high">重要</option>
              <option value="urgent">非常重要</option>
            </select>
          </div>
        )}
      </form>

      <div className="pendingList">
        {tasks.length === 0 ? (
          <div className="emptyText">目前沒有待辦事項</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="taskItem">
              <button
                type="button"
                className="taskCheck"
                onClick={() => onComplete(task.id)}
              >
                □
              </button>

              <div className="taskContent">
                <span className="taskTitle">{task.title}</span>
                <span className="taskMeta">
                  <span className={`deadlineBadge ${getDeadlineStatus(task)}`}>
                    {getDeadlineLabel(task)}
                  </span>
                  {formatDeadline(task)} · {getPriorityLabel(task.priority)}
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