const form = document.querySelector("#situation-form");
const textarea = document.querySelector("#situation");
const submitButton = document.querySelector("#submit-button");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const riskBadge = document.querySelector("#risk-badge");
const situationType = document.querySelector("#situation-type");
const actionsList = document.querySelector("#actions-list");
const messageText = document.querySelector("#message-text");
const scenarioButtons = document.querySelectorAll(".scenario-chip");

function setLoadingState(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Analyzing..." : "Analyze Situation";
}

function renderResult(data) {
  riskBadge.textContent = data.risk_level;
  riskBadge.className = `risk-badge ${data.risk_level}`;
  situationType.textContent = data.situation_type;
  messageText.textContent = data.message;
  actionsList.innerHTML = "";

  data.actions.forEach((action) => {
    const item = document.createElement("li");
    item.textContent = action;
    actionsList.appendChild(item);
  });

  results.classList.remove("hidden");
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const situation = textarea.value.trim();
  if (!situation) {
    setStatus("Enter a situation before running the analysis.", true);
    return;
  }

  setLoadingState(true);
  setStatus("Contacting Nemotron and validating the response...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Analysis failed.");
    }

    renderResult(payload);
    setStatus("Analysis complete.");
  } catch (error) {
    results.classList.add("hidden");
    setStatus(error.message, true);
  } finally {
    setLoadingState(false);
  }
});

scenarioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    textarea.value = button.dataset.scenario;
    textarea.focus();
  });
});
