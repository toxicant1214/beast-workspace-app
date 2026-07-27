function ClassDrawer({
  selectedClass,
  form,
  setForm,
  isSaving,
  onClose,
  onSave,
}) {
  function updateField(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  return (
    <div
      className="classDrawer__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        className="classDrawer"
        onSubmit={onSave}
      >
        <header className="classDrawer__header">
          <div>
            <p className="classDrawer__eyebrow">
              {selectedClass
                ? "EDIT CLASS"
                : "NEW CLASS"}
            </p>

            <h2>
              {selectedClass
                ? "編輯班級"
                : "新增班級"}
            </h2>
          </div>

          <button
            type="button"
            className="classDrawer__close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="classDrawer__body">
          <section className="classDrawer__section">
            <div className="classDrawer__sectionHeading">
              <span>01</span>

              <div>
                <h3>班級基本資料</h3>
                <p>設定安親行政班級的名稱。</p>
              </div>
            </div>

            <label className="classDrawer__field">
              <span>
                班級名稱
                <b>必填</b>
              </span>

              <input
                required
                autoFocus
                value={form.class_name}
                placeholder="例如：G1A、G2B、中年級A班"
                onChange={(event) =>
                  updateField(
                    "class_name",
                    event.target.value
                  )
                }
              />
            </label>
          </section>

          <section className="classDrawer__section">
            <div className="classDrawer__sectionHeading">
              <span>02</span>

              <div>
                <h3>學期資訊</h3>
                <p>用來辨識不同學年度與學期的班級資料。</p>
              </div>
            </div>

            <div className="classDrawer__fieldGrid">
              <label className="classDrawer__field">
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

              <label className="classDrawer__field">
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
            </div>
          </section>

          <section className="classDrawer__section">
            <div className="classDrawer__sectionHeading">
              <span>03</span>

              <div>
                <h3>班級期間</h3>
                <p>設定這個班級適用的開始與結束日期。</p>
              </div>
            </div>

            <div className="classDrawer__fieldGrid">
              <label className="classDrawer__field">
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

              <label className="classDrawer__field">
                <span>結束日期</span>

                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
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

          <section className="classDrawer__section">
            <div className="classDrawer__sectionHeading">
              <span>04</span>

              <div>
                <h3>狀態與備註</h3>
                <p>停用後仍會保留班級與歷史資料。</p>
              </div>
            </div>

            <label className="classDrawer__toggleField">
              <div>
                <strong>啟用班級</strong>

                <p>
                  啟用後可供學生加入這個安親班級。
                </p>
              </div>

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

            <label className="classDrawer__field">
              <span>班級備註</span>

              <textarea
                rows="5"
                value={form.note}
                placeholder="可記錄導師、教室位置或其他管理說明……"
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

        <footer className="classDrawer__footer">
          <button
            type="button"
            className="classDrawer__cancelButton"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="submit"
            className="classDrawer__saveButton"
            disabled={isSaving}
          >
            {isSaving
              ? "儲存中……"
              : selectedClass
                ? "儲存修改"
                : "建立班級"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default ClassDrawer;