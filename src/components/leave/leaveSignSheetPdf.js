import { jsPDF } from "jspdf";

import { formatDateLabel, needsCoverage, sortItems } from "../../services/leaveWorkflowService";

/*
 * 代班確認單（A4 直式，向量 PDF）
 * 每位代班老師一頁（內容多會自動接續下一頁），最下方簽名欄。
 * 字型與「休假月報 PDF」相同：芫荽體。
 */

const FONT_URL = "https://cdn.jsdelivr.net/gh/ButTaiwan/iansui@main/fonts/ttf/Iansui-Regular.ttf";
let fontBase64Cache = null;

async function loadFontBase64() {
  if (fontBase64Cache) return fontBase64Cache;
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error(`芫荽體載入失敗（${response.status}）`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  fontBase64Cache = btoa(binary);
  return fontBase64Cache;
}

function teacherName(t) {
  return t?.chinese_name || t?.english_name || "";
}

function substituteName(item) {
  if (item.substitute_teacher) return teacherName(item.substitute_teacher);
  if (item.substitute_external) return item.substitute_external.name;
  if (item.substitute_name) return item.substitute_name;
  return "（尚未排代理）";
}

function timeText(item) {
  if (item.category === "slot") return item.title || "";
  const s = String(item.start_time || "").slice(0, 5);
  const e = String(item.end_time || "").slice(0, 5);
  return s && e ? `${s}–${e}` : s || "";
}

function dutyText(item) {
  if (item.category === "slot") {
    const tags = item.activity_tags || [];
    return tags.length ? `班級照顧｜${tags.join("、")}` : "班級照顧";
  }
  if (item.category === "pickup") return `接送｜${item.title || ""}`;
  if (item.category === "english") return `美語課｜${item.title || ""}`;
  return item.title || "其他";
}

const WD = ["日", "一", "二", "三", "四", "五", "六"];
function shortDate(dateString) {
  if (!dateString) return "";
  const [y, m, d] = String(dateString).split("-").map(Number);
  return `${m}/${d}(${WD[new Date(y, m - 1, d).getDay()]})`;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function buildSignSheetPdf(request, { onlyTeacherId } = {}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("Iansui-Regular.ttf", await loadFontBase64());
  pdf.addFont("Iansui-Regular.ttf", "Iansui", "normal");
  pdf.setFont("Iansui", "normal");

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const mx = 14;
  const contentW = pageW - mx * 2;
  const bottom = pageH - 14;

  const leaveName = teacherName(request.teachers);
  const leaveType = request.leave_types?.name || "";
  const dateRange =
    request.start_date === request.end_date
      ? formatDateLabel(request.start_date)
      : `${formatDateLabel(request.start_date)} ～ ${formatDateLabel(request.end_date)}`;

  const items = sortItems(request.leave_request_items || [])
    .filter(needsCoverage)
    .filter((item) => !onlyTeacherId || String(item.substitute_teacher_id) === String(onlyTeacherId));

  // 依代班老師分組
  const groups = [];
  items.forEach((item) => {
    const name = substituteName(item);
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });

  if (!groups.length) throw new Error("這筆請假沒有需要代班的格子。");

  const cols = [
    { key: "date", label: "日期", w: 25 },
    { key: "time", label: "時段", w: 26 },
    { key: "duty", label: "職責", w: 24 },
    { key: "kids", label: "在班孩子", w: 72 },
    { key: "note", label: "不在班", w: contentW - 25 - 26 - 24 - 72 },
  ];
  const fontSize = 8.5;
  const lineH = 4.1;
  const padY = 2.2;

  let y = 0;

  function drawHeader(group, continued) {
    y = 16;
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(9);
    pdf.text("倍思學院 四維分校", mx, y);
    pdf.setFontSize(17);
    pdf.text(`代班確認單${continued ? "（續）" : ""}`, pageW / 2, y + 2, { align: "center" });
    y += 11;

    pdf.setDrawColor(60, 60, 60);
    pdf.setLineWidth(0.3);
    pdf.line(mx, y, pageW - mx, y);
    y += 6;

    pdf.setFontSize(10);
    pdf.text(`代班老師：${group.name}`, mx, y);
    pdf.text(`請假老師：${leaveName}（${leaveType}）`, mx + 70, y);
    y += 6;
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`請假日期：${dateRange}`, mx, y);
    if (request.approved_at) pdf.text(`主管確認：${formatDateTime(request.approved_at)}`, mx + 70, y);
    pdf.setTextColor(30, 30, 30);
    y += 7;
  }

  function drawTableHead() {
    pdf.setFillColor(238, 236, 230);
    pdf.rect(mx, y, contentW, 7, "F");
    pdf.setFontSize(fontSize);
    let x = mx;
    cols.forEach((c) => {
      pdf.text(c.label, x + 1.8, y + 4.8);
      x += c.w;
    });
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.2);
    pdf.rect(mx, y, contentW, 7);
    y += 7;
  }

  function rowCells(item) {
    const list = item.students || [];
    const present = list.filter((s) => s.status === "present").map((s) => s.name);
    const absent = list.filter((s) => s.status === "absent").map((s) => s.name);
    const english = list.filter((s) => s.status === "english").map((s) => s.name);
    const left = list.filter((s) => s.status === "left").map((s) => s.name);
    const notes = [];
    if (left.length) notes.push(`已離班：${left.join("、")}`);
    if (absent.length) notes.push(`不到：${absent.join("、")}`);
    if (english.length) notes.push(`美語：${english.join("、")}`);
    return {
      date: shortDate(item.item_date),
      time: timeText(item),
      duty: dutyText(item),
      kids: present.length ? `${present.length} 人：${present.join("、")}` : "—",
      note: notes.join("\n") || "—",
    };
  }

  function drawRow(cells, group) {
    pdf.setFontSize(fontSize);
    const wrapped = cols.map((c) =>
      String(cells[c.key])
        .split("\n")
        .flatMap((part) => pdf.splitTextToSize(part, c.w - 3.6))
    );
    const lines = Math.max(...wrapped.map((w) => w.length));
    const h = lines * lineH + padY * 2;

    if (y + h > bottom - 4) {
      pdf.addPage();
      drawHeader(group, true);
      drawTableHead();
    }

    let x = mx;
    cols.forEach((c, i) => {
      wrapped[i].forEach((line, li) => {
        pdf.text(line, x + 1.8, y + padY + lineH * (li + 1) - 1);
      });
      pdf.rect(x, y, c.w, h);
      x += c.w;
    });
    y += h;
  }

  function drawHandover(group) {
    const seen = new Set();
    const blocks = [];
    group.items.forEach((item) => {
      const fields = [
        ["進度／作業", item.handover_progress],
        ["注意孩子", item.handover_students],
        ["家長交代", item.handover_parents],
        ["教材／其他", item.handover_materials],
      ].filter(([, v]) => v && String(v).trim());
      if (!fields.length) return;
      const key = JSON.stringify(fields);
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({ date: shortDate(item.item_date), fields });
    });
    if (!blocks.length) return;

    if (y + 16 > bottom) {
      pdf.addPage();
      drawHeader(group, true);
    }
    y += 6;
    pdf.setFontSize(11);
    pdf.text("交接內容", mx, y);
    y += 5;
    pdf.setFontSize(fontSize);

    blocks.forEach((block) => {
      block.fields.forEach(([label, value], index) => {
        const text = `${index === 0 ? `${block.date}　` : "　　　　　"}${label}：${value}`;
        const lines = pdf.splitTextToSize(text, contentW);
        if (y + lines.length * lineH > bottom) {
          pdf.addPage();
          drawHeader(group, true);
          pdf.setFontSize(fontSize);
        }
        lines.forEach((line) => {
          pdf.text(line, mx, y + 3);
          y += lineH;
        });
      });
      y += 1.5;
    });
  }

  function drawSignatures(group) {
    const need = 34;
    if (y + need > bottom) {
      pdf.addPage();
      drawHeader(group, true);
    }
    y = Math.max(y + 8, bottom - need + 6);

    pdf.setFontSize(8.5);
    pdf.setTextColor(80, 80, 80);
    pdf.text("本人已了解以上代班時段、孩子名單與交接內容。", mx, y);
    pdf.setTextColor(30, 30, 30);
    y += 12;

    const boxW = contentW / 3;
    const labels = ["代班老師簽名", "請假老師簽名", "主管簽名"];
    pdf.setFontSize(9.5);
    pdf.setDrawColor(60, 60, 60);
    pdf.setLineWidth(0.3);
    labels.forEach((label, i) => {
      const x = mx + boxW * i;
      pdf.text(label, x, y);
      pdf.line(x, y + 9, x + boxW - 8, y + 9);
      pdf.setFontSize(7.5);
      pdf.setTextColor(120, 120, 120);
      pdf.text("日期：　　／　　", x, y + 14);
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(9.5);
    });
  }

  groups.forEach((group, index) => {
    if (index > 0) pdf.addPage();
    drawHeader(group, false);
    drawTableHead();
    group.items.forEach((item) => drawRow(rowCells(item), group));
    drawHandover(group);
    drawSignatures(group);
  });

  return pdf;
}

export async function downloadSignSheetPdf(request) {
  const pdf = await buildSignSheetPdf(request);
  const fileDate = String(request.start_date || "").replaceAll("-", "");
  pdf.save(`${fileDate}_${teacherName(request.teachers)}_代班確認單.pdf`);
}
