const form = document.querySelector("#lesson-form");
const generateButton = document.querySelector("#generate-button");
const downloadButton = document.querySelector("#download-button");
const copyButton = document.querySelector("#copy-button");
const errorBox = document.querySelector("#form-error");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const report = document.querySelector("#report");
const resultContent = document.querySelector("#result-content");
const resultStatus = document.querySelector("#result-status");

let latestReport = "";

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setBusy(isBusy) {
  generateButton.disabled = isBusy;
  generateButton.querySelector(".button-label").textContent = isBusy ? "초안을 작성하고 있어요" : "세특 초안 만들기";
  resultContent.setAttribute("aria-busy", String(isBusy));
  emptyState.hidden = true;
  report.hidden = true;
  loadingState.hidden = !isBusy;
  if (isBusy) resultStatus.textContent = "세특 초안을 생성하고 있습니다";
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const payload = {
    apiKey: value("api-key"),
    gradeTerm: value("gradeTerm"),
    courseUnit: value("courseUnit"),
    achievementStandard: value("achievementStandard"),
    career: value("career"),
    careerConnection: value("careerConnection"),
    assessmentItem: value("assessmentItem"),
    rubric: value("rubric"),
    assessmentResult: value("assessmentResult"),
    evidence: value("evidence"),
    project: value("project"),
    contribution: value("contribution"),
    problemSolving: value("problemSolving"),
    competencies: value("competencies"),
    observation: value("observation"),
    reflection: value("reflection"),
    charLimit: Number(value("charLimit")) || 500,
    charBasis: value("charBasis"),
    requiredContent: value("requiredContent"),
    excludedContent: value("excludedContent"),
  };

  if (!payload.apiKey || !payload.gradeTerm || !payload.courseUnit || !payload.achievementStandard) {
    showError("API 키, 학년·학기, 과목·단원, 성취기준을 입력해 주세요.");
    return;
  }
  if (!payload.evidence && !payload.contribution && !payload.observation && !payload.problemSolving && !payload.reflection) {
    showError("학생의 수행 근거, 개인 기여, 문제 해결 과정, 관찰 메모, 성찰 중 하나 이상 입력해 주세요.");
    return;
  }

  latestReport = "";
  downloadButton.disabled = true;
  copyButton.disabled = true;
  setBusy(true);
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");

    latestReport = data.text.trim();
    report.innerHTML = `<p>${escapeHtml(latestReport).replace(/\n/g, "<br>")}</p>`;
    loadingState.hidden = true;
    emptyState.hidden = true;
    report.hidden = false;
    downloadButton.disabled = false;
    copyButton.disabled = false;
    const length = payload.charBasis === "공백 제외" ? latestReport.replace(/\s/g, "").length : latestReport.length;
    resultStatus.textContent = `초안 생성 완료 · ${length.toLocaleString("ko-KR")}자 (${payload.charBasis || "공백 포함"})`;
  } catch (error) {
    loadingState.hidden = true;
    emptyState.hidden = false;
    resultStatus.textContent = "생성 결과가 여기에 표시됩니다";
    showError(error.message || "오류가 발생했습니다. 입력 내용을 확인해 주세요.");
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector(".button-label").textContent = "세특 초안 만들기";
    resultContent.setAttribute("aria-busy", "false");
  }
});

copyButton.addEventListener("click", async () => {
  if (!latestReport) return;
  try {
    await navigator.clipboard.writeText(latestReport);
    resultStatus.textContent = "초안을 클립보드에 복사했습니다";
  } catch {
    showError("복사 권한을 사용할 수 없습니다. 결과 문장을 선택해 복사해 주세요.");
  }
});

downloadButton.addEventListener("click", () => {
  if (!latestReport) return;
  const filenamePart = value("studentId").replace(/[\\/:*?"<>|]/g, "-") || "학생";
  const blob = new Blob(["\uFEFF" + latestReport], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePart}_기술세특_초안.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});
