import TaskDrawer from "../components/TaskDrawer";
import { useEffect, useState } from "react";
import {
  getTodos,
  getCompletedTodos,
  completeTodo,
  deleteTodo,
  reopenTodo,
} from "../services/todoService";

function TaskPage() {
  const [activeTasks, setActiveTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    const active = await getTodos();
    const completed = await getCompletedTodos();
    setActiveTasks(active);
    setCompletedTasks(completed);
  }

  async function handleCompleteTask(id) {
    await completeTodo(id);
    await loadTasks();
  }

  async function handleDeleteTask(id) {
    await deleteTodo(id);
    await loadTasks();
  }

  async function handleReopenTask(id) {
    await reopenTodo(id);
    await loadTasks();
  }
  function handleOpenTask(task) {
  setSelectedTask(task);
  setDrawerOpen(true);
}

  function formatDeadline(task) {
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

  function formatDate(dateString) {
    return new Date(dateString).toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getDeadlineStatus(task) {
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
    <div className="taskPage">
      <section className="pageHeader">
        <p className="eyebrow">TASK CENTER</p>
        <h1>任務中心</h1>
        <p className="summary">
          查看未完成任務、已完成紀錄，並清除測試或誤植資料。
        </p>
      </section>

      <div className="taskPageGrid">
        <section className="taskPanel">
          <div className="taskPanelHeader">
            <div>
              <p className="eyebrow">ACTIVE</p>
              <h2>未完成任務</h2>
            </div>
            <span className="taskCount">{activeTasks.length}</span>
          </div>

          <div className="taskList">
            {activeTasks.length === 0 ? (
              <div className="emptyText">目前沒有未完成任務</div>
            ) : (
              activeTasks.map((task) => (
                <div
  key={task.id}
  className="taskRow"
  onClick={() => handleOpenTask(task)}
>
                  <button
                    type="button"
                    className="taskCheck"
                    onClick={() => handleCompleteTask(task.id)}
                  >
                    □
                  </button>

                  <div className="taskContent">
                    <span className="taskTitle">{task.title}</span>
                    <span className="taskMeta">
                      <span className={`deadlineBadge ${getDeadlineStatus(task)}`}>
                        {getDeadlineLabel(task)}
                      </span>
                      {formatDeadline(task)}
                    </span>
                  </div>

                  <button
  type="button"
  className="taskDelete"
  onClick={(event) => {
    event.stopPropagation();
    handleDeleteTask(task.id);
  }}
>
  刪除
</button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="taskPanel">
          <div className="taskPanelHeader">
            <div>
              <p className="eyebrow">DONE</p>
              <h2>已完成紀錄</h2>
            </div>
            <span className="taskCount">{completedTasks.length}</span>
          </div>

          <div className="taskList">
            {completedTasks.length === 0 ? (
              <div className="emptyText">目前沒有已完成紀錄</div>
            ) : (
              completedTasks.map((task) => (
                <div key={task.id} className="taskRow completedTask">
                  <span className="taskDoneIcon">✓</span>

                  <div className="taskContent">
                    <span className="taskTitle">{task.title}</span>
                    <span className="taskDate">
                      完成於 {formatDate(task.completed_at)}
                    </span>
                  </div>

                  <div className="taskActions">
                    <button
                      type="button"
                      className="taskRestore"
                      onClick={() => handleReopenTask(task.id)}
                    >
                      復原
                    </button>

                    <button
                      type="button"
                      className="taskDelete"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <TaskDrawer
  open={drawerOpen}
  task={selectedTask}
  onClose={() => setDrawerOpen(false)}
  onSaved={loadTasks}
/>
    </div>
    
  );
}

export default TaskPage;