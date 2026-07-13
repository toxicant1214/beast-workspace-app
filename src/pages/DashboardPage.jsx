import { useEffect, useState } from "react";
import { getWeather } from "../services/weatherService";
import TaskCard from "../components/TaskCard";
import { getTodos, completeTodo, addTodo, deleteTodo } from "../services/todoService";

function DashboardPage() {
  const [weather, setWeather] = useState(null);
  const [tasks, setTasks] = useState([]);

  const today = new Date();

  const dateText = today.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });

  const hour = new Date().getHours();

  let greeting = "早安";

  if (hour >= 11 && hour < 17) {
    greeting = "午安";
  } else if (hour >= 17 && hour < 24) {
    greeting = "晚安";
  } else if (hour >= 0 && hour < 5) {
    greeting = "夜深了";
  }

  useEffect(() => {
    async function loadWeather() {
      try {
        const data = await getWeather();
        setWeather(data);
      } catch (error) {
        console.error(error);
      }
    }

    loadWeather();
    loadTodos();
  }, []);

  async function loadTodos() {
    try {
      const data = await getTodos();
      setTasks(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleCompleteTask(id) {
    try {
      await completeTodo(id);
      await loadTodos();
    } catch (error) {
      console.error(error);
    }
  }
  async function handleAddTask(task) {
  try {
    await addTodo(task);
    await loadTodos();
  } catch (error) {
    console.error(error);
  }
}
async function handleDeleteTask(id) {
  try {
    await deleteTodo(id);
    await loadTodos();
  } catch (error) {
    console.error(error);
  }
}

  function getWeatherEmoji(condition) {
    if (!condition) return "🌤️";

    if (condition.includes("晴")) return "☀️";
    if (condition.includes("雲")) return "☁️";
    if (condition.includes("雨")) return "🌧️";
    if (condition.includes("雷")) return "⛈️";
    if (condition.includes("霧")) return "🌫️";

    return "🌤️";
  }

  return (
    <div className="dashboardPage">
      <section className="welcomeCard">
        <div>
          <p className="eyebrow">TODAY WORKSPACE</p>
          <h1>{greeting}，Lin</h1>
          <p className="summary">
            今天是 {dateText}，先看看今天需要注意的事情。
          </p>
        </div>

        <div className="weatherBox">
          {weather ? (
            <>
              <div className="weatherEmoji">
                {getWeatherEmoji(weather.condition)}
              </div>

              <div>
                <div className="weatherLocation">林口</div>
                <div className="weatherText">
                  {weather.condition}｜{weather.temperature}°C
                </div>
                <div className="weatherRain">濕度 {weather.humidity}%</div>
              </div>
            </>
          ) : (
            <div className="weatherText">天氣讀取中...</div>
          )}
        </div>
      </section>

      <div className="dashboardGrid">
        <section className="dashboardCard">
          <p className="eyebrow">TODAY</p>
          <h2>今日概況</h2>

          <div className="todoList">
            <div>🚌 接送提醒</div>
            <div>🎂 今日生日</div>
            <div>📌 待辦事項</div>
            <div>🏕️ 營隊安排</div>
          </div>
        </section>

        <TaskCard
  tasks={tasks.slice(0, 5)}
  onComplete={handleCompleteTask}
  onAdd={handleAddTask}
  onDelete={handleDeleteTask}
/>
      </div>
    </div>
  );
}

export default DashboardPage;