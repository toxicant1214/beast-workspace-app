import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";
import CampCard from "../components/camp/CampCard";
import CampFormModal from "../components/camp/CampFormModal";
import CampDetailPage from "./CampDetailPage";
import "../components/camp/camp.css";

function CampPage() {
  const [camps, setCamps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCamp, setSelectedCamp] = useState(null);

  useEffect(() => {
    loadCamps();
  }, []);

  async function loadCamps() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("camps")
        .select(
          `
          id,
          name,
          camp_type,
          start_date,
          end_date,
          status,
          notes,
          created_at,
          updated_at
          `
        )
        .order("start_date", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setCamps(data ?? []);
    } catch (error) {
      console.error("讀取營隊資料失敗：", error);
      setErrorMessage(
        `讀取營隊資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateCamp(formData) {
    const { data, error } = await supabase
      .from("camps")
      .insert({
        name: formData.name.trim(),
        camp_type: formData.campType,
        start_date: formData.startDate,
        end_date: formData.endDate,
        status: "PLANNING",
        notes: formData.notes.trim() || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    setCamps((current) =>
      [data, ...current].sort((a, b) =>
        String(b.start_date).localeCompare(
          String(a.start_date)
        )
      )
    );

    setIsFormOpen(false);
  }

  async function handleUpdateCamp(campId, formData) {
    const { data: periodRows, error: periodError } = await supabase
      .from("camp_periods")
      .select("id, name, start_date, end_date")
      .eq("camp_id", campId)
      .order("start_date", { ascending: true });

    if (periodError) {
      throw periodError;
    }

    const outsidePeriod = (periodRows ?? []).find(
      (period) =>
        period.start_date < formData.startDate ||
        period.end_date > formData.endDate
    );

    if (outsidePeriod) {
      throw new Error(
        `「${outsidePeriod.name}」的日期為 ${outsidePeriod.start_date}～${outsidePeriod.end_date}，請先調整該梯次，或將營隊總期間涵蓋這段日期。`
      );
    }

    const { data, error } = await supabase
      .from("camps")
      .update({
        name: formData.name.trim(),
        camp_type: formData.campType,
        start_date: formData.startDate,
        end_date: formData.endDate,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    setCamps((current) =>
      current
        .map((camp) =>
          camp.id === data.id ? data : camp
        )
        .sort((a, b) =>
          String(b.start_date).localeCompare(
            String(a.start_date)
          )
        )
    );

    setSelectedCamp(data);

    return data;
  }

  const activeCampCount = useMemo(
    () =>
      camps.filter(
        (camp) => camp.status !== "ARCHIVED"
      ).length,
    [camps]
  );

  if (selectedCamp) {
    return (
      <CampDetailPage
        camp={selectedCamp}
        onBack={() => setSelectedCamp(null)}
        onUpdateCamp={handleUpdateCamp}
      />
    );
  }

  return (
    <div className="campPage">
      <header className="campPage__header">
        <div>
          <p className="campEyebrow">
            CAMP MANAGEMENT
          </p>

          <h1>營隊管理</h1>

          <p className="campPage__summary">
            每一次寒暑假營隊都是獨立資料夾，
            學生、編班、工作人員、排班與清潔互不共用。
          </p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={() => setIsFormOpen(true)}
        >
          ＋ 建立新營隊
        </button>
      </header>

      <section className="campPage__stats">
        <div className="campStatCard">
          <span>全部營隊</span>
          <strong>{camps.length}</strong>
        </div>

        <div className="campStatCard">
          <span>目前使用中</span>
          <strong>{activeCampCount}</strong>
        </div>
      </section>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="campEmptyState">
          <div className="campEmptyState__icon">📁</div>
          <strong>正在讀取營隊資料……</strong>
        </div>
      ) : camps.length === 0 ? (
        <div className="campEmptyState">
          <div className="campEmptyState__icon">📁</div>

          <strong>還沒有建立營隊資料夾</strong>

          <p>
            建立第一個寒假或暑假營隊後，
            學生、編班與排班資料都會收在該營隊裡。
          </p>

          <button
            type="button"
            className="campSecondaryButton"
            onClick={() => setIsFormOpen(true)}
          >
            建立第一個營隊
          </button>
        </div>
      ) : (
        <section className="campFolderGrid">
          {camps.map((camp) => (
            <CampCard
              key={camp.id}
              camp={camp}
              onOpen={() => setSelectedCamp(camp)}
            />
          ))}
        </section>
      )}

      <CampFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateCamp}
      />
    </div>
  );
}

export default CampPage;