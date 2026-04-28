export function initSessionIntroWalkthrough() {
  const HAS_SEEN_KEY = 'session_intro_seen';
  if (localStorage.getItem(HAS_SEEN_KEY) === 'true') {
    return;
  }

  // Ensure styles are loaded
  if (!document.getElementById('session-intro-style')) {
    const link = document.createElement('link');
    link.id = 'session-intro-style';
    link.rel = 'stylesheet';
    link.href = 'styles/components/sessionIntroWalkthrough.css';
    document.head.appendChild(link);
  }

  const container = document.getElementById('session-intro-container');
  if (!container) return; // Wait for it to be injected if missing

  container.innerHTML = `
    <div id="session-intro-card">
      <div id="session-intro-text" class="session-intro-text"></div>
      <div class="session-intro-actions">
        <button id="session-intro-btn" class="session-intro-btn">Next</button>
      </div>
    </div>
  `;

  const card = document.getElementById('session-intro-card');
  const textEl = document.getElementById('session-intro-text');
  const btn = document.getElementById('session-intro-btn');

  const steps = [
    {
      text: "This is Kido. You teach here by explaining concepts in your own words.",
      pos: "intro-pos-right"
    },
    {
      text: "This panel shows your learning content and structure.",
      pos: "intro-pos-left"
    },
    {
      text: "Use this area to teach Kido. Your explanations drive the session.",
      pos: "intro-pos-chat-pill"
    },
    {
      text: "This icon opens interactive widgets to help you think.",
      pos: "intro-pos-chat-pill"
    },
    {
      text: "View your slides here. You cannot copy — you must understand.",
      pos: "intro-pos-chat-pill"
    },
    {
      text: "Use hints if you get stuck.",
      pos: "intro-pos-chat-pill"
    },
    {
      text: "You're ready. Start teaching Kido now.",
      pos: "intro-pos-center",
      btnText: "Start"
    }
  ];

  let currentStep = 0;

  function renderStep(index) {
    if (index >= steps.length) {
      finish();
      return;
    }

    const step = steps[index];
    textEl.textContent = step.text;
    btn.textContent = step.btnText || "Next";
    card.className = step.pos;
  }

  function finish() {
    localStorage.setItem(HAS_SEEN_KEY, 'true');
    container.style.display = 'none';
  }

  btn.addEventListener('click', () => {
    currentStep++;
    renderStep(currentStep);
  });

  // Start the walkthrough
  renderStep(0);
}
