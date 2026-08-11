function EnglishClassDrawer({
  form,
  setForm,
  schedules,
  setSchedules,
  onClose,
  onSave,
  isSaving,
}) {
  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSchedule(index, field, value) {
    setSchedules((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function addSchedule() {
    setSchedules((current) => [
      ...current,
      {
        weekday: "1",
        start_time: "",
        end_time: "",
      },
    ]);
  }

  function removeSchedule(index) {
    setSchedules((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index
      )
    );
  }

  return (
    <div
      className="englishClassDrawer__backdrop"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <form
        className="englishClassDrawer"
        onSubmit={onSave}
      >
        <header className="englishClassDrawer__header">
          <div>
            <p>NEW ENGLISH CLASS</p>
            <h2>新增美語班</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="englishClassDrawer__body">
          <section className="englishClassDrawer__section">
            <h3>班級基本資料</h3>

            <label>
              <span>班級名稱</span>

              <input
                required
                value={form.class_name}
                placeholder="例如：E3A"
                onChange={(event) =>
                  updateField(
                    "class_name",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              <span>課程／級別</span>

              <input
                value={form.course_name}
                placeholder="例如：Level 3"
                onChange={(event) =>
                  updateField(
                    "course_name",
                    event.target.value
                  )
                }
              />
            </label>
          </section>

          <section className="englishClassDrawer__section">
            <h3>學期資訊</h3>

            <div className="englishClassDrawer__grid">
              <label>
                <span>學年度</span>

                <input
                  value={form.academic_year}
                  placeholder="例如：115學年度"
                  onChange={(event) =>
                    updateField(
                      "academic_year",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>學期</span>

                <select
                  value={form.term}
                  onChange={(event) =>
                    updateField(
                      "term",
                      event.target.value
                    )
                  }
                >
                  <option value="">未設定</option>
                  <option value="上學期">
                    上學期
                  </option>
                  <option value="下學期">
                    下學期
                  </option>
                  <option value="全年">
                    全年
                  </option>
                </select>
              </label>

              <label>
                <span>開始日期</span>

                <input
                  type="date"
                  value={form.start_date}
                  onChange={(event) =>
                    updateField(
                      "start_date",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>結束日期</span>

                <input
                  type="date"
                  value={form.end_date}
                  min={
                    form.start_date ||
                    undefined
                  }
                  onChange={(event) =>
                    updateField(
                      "end_date",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="englishClassDrawer__section">
            <h3>授課老師</h3>

            <label>
              <span>授課老師</span>

              <input
                value={form.teacher_name}
                placeholder="例如：Frank"
                onChange={(event) =>
                  updateField(
                    "teacher_name",
                    event.target.value
                  )
                }
              />
            </label>
          </section>

          <section className="englishClassDrawer__section">
            <div className="englishClassDrawer__scheduleHeader">
              <div>
                <h3>每週上課時段</h3>

                <p>
                  同一個美語班可設定多個不同星期與時間。
                </p>
              </div>

              <button
                type="button"
                onClick={addSchedule}
              >
                ＋ 新增時段
              </button>
            </div>

            <div className="englishClassDrawer__scheduleList">
              {schedules.map(
                (schedule, index) => (
                  <div
                    key={index}
                    className="englishClassDrawer__scheduleItem"
                  >
                    <select
                      value={schedule.weekday}
                      onChange={(event) =>
                        updateSchedule(
                          index,
                          "weekday",
                          event.target.value
                        )
                      }
                    >
                      <option value="1">
                        星期一
                      </option>
                      <option value="2">
                        星期二
                      </option>
                      <option value="3">
                        星期三
                      </option>
                      <option value="4">
                        星期四
                      </option>
                      <option value="5">
                        星期五
                      </option>
                      <option value="6">
                        星期六
                      </option>
                      <option value="7">
                        星期日
                      </option>
                    </select>

                    <input
                      type="time"
                      value={schedule.start_time}
                      onChange={(event) =>
                        updateSchedule(
                          index,
                          "start_time",
                          event.target.value
                        )
                      }
                    />

                    <span>－</span>

                    <input
                      type="time"
                      value={schedule.end_time}
                      onChange={(event) =>
                        updateSchedule(
                          index,
                          "end_time",
                          event.target.value
                        )
                      }
                    />

                    <button
                      type="button"
                      onClick={() =>
                        removeSchedule(index)
                      }
                      disabled={
                        schedules.length === 1
                      }
                      aria-label="刪除時段"
                    >
                      ×
                    </button>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="englishClassDrawer__section">
            <h3>狀態與備註</h3>

            <label className="englishClassDrawer__toggle">
              <span>啟用班級</span>

              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  updateField(
                    "is_active",
                    event.target.checked
                  )
                }
              />
            </label>

            <label>
              <span>備註</span>

              <textarea
                rows="4"
                value={form.note}
                placeholder="可記錄教材、程度或其他班級說明..."
                onChange={(event) =>
                  updateField(
                    "note",
                    event.target.value
                  )
                }
              />
            </label>
          </section>
        </div>

        <footer className="englishClassDrawer__footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="submit"
            className="englishClassDrawer__save"
            disabled={isSaving}
          >
            {isSaving
              ? "儲存中……"
              : "建立美語班"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default EnglishClassDrawer;