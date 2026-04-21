export const dom = {
  // Topic nav
  btnPrev: document.getElementById('btn-prev-topic'),
  btnNext: document.getElementById('btn-next-topic'),
  topicCounter: document.getElementById('topic-counter'),
  topicTitle: document.getElementById('topic-title'),
  headerTopic: document.getElementById('header-topic'),

  // Progress
  progressFill: document.getElementById('progress-fill'),
  progressValue: document.getElementById('progress-value'),
  progressCard: document.getElementById('progress-card'),

  // Chat
  chatPanel: document.getElementById('chat-panel'),
  chatMessages: document.getElementById('chat-messages'),
  chatInputField: document.getElementById('chat-input-field'),
  btnSend: document.getElementById('btn-send'),
  btnRequestGraph: document.getElementById('btn-request-graph'),

  // Slides / action cards
  btnOpenSlides: document.getElementById('btn-open-slides'),
  btnBackStatus: document.getElementById('btn-back-status'),
  statusView: document.getElementById('status-view'),
  slidesView: document.getElementById('slides-view'),
  slideIframe: document.getElementById('slide-iframe'),
  slidePlaceholder: document.getElementById('slide-placeholder'),

  // Concept Card (left panel)
  conceptCard: document.getElementById('concept-card'),
  conceptCardText: document.getElementById('concept-card-text'),
  conceptCardTitle: document.getElementById('concept-card-title'),
  conceptGhostFill1: document.getElementById('concept-ghost-fill-1'),
  conceptGhostFill2: document.getElementById('concept-ghost-fill-2'),
  conceptGhostOutline: document.getElementById('concept-ghost-outline'),
  conceptProgressBadge: document.getElementById('concept-progress-badge'),

  // KWL View
  btnKidoLearned: document.getElementById('btn-kido-learned'),
  btnBackKwl: document.getElementById('btn-back-kwl'),
  kwlView: document.getElementById('kwl-view'),
  kwlList: document.getElementById('kwl-list'),
  kwlEmpty: document.getElementById('kwl-empty'),
  kwlCountBadge: document.getElementById('kwl-count-badge'),

  // Panel buttons
  btnCollapseLeft: document.getElementById('btn-collapse-left'),
  btnCollapseRight: document.getElementById('btn-collapse-right'),
  btnExpandLeft: document.getElementById('btn-expand-left'),
  btnExpandRight: document.getElementById('btn-expand-right'),
  aiPanel: document.getElementById('ai-panel'),
  rightPanel: document.getElementById('right-panel'),

  // PDF Overlay
  slideDeckOverlay: document.getElementById('slide-deck-overlay'),
  btnCloseSlides: document.getElementById('btn-close-slides'),

  // PDF controls
  pdfCanvas: document.getElementById('pdf-canvas'),
  pdfPlaceholder: document.getElementById('pdf-placeholder'),
  pdfPageNav: document.getElementById('pdf-page-nav'),
  pdfPageInfo: document.getElementById('pdf-page-info'),
  btnPdfZoomIn: document.getElementById('btn-pdf-zoom-in'),
  btnPdfZoomOut: document.getElementById('btn-pdf-zoom-out'),
  btnZoomReset: document.getElementById('btn-zoom-reset'),
  pdfZoomLevel: document.getElementById('pdf-zoom-level'),
  btnPdfHighlight: document.getElementById('btn-pdf-highlight'),
  btnPdfPrev: document.getElementById('btn-pdf-prev'),
  btnPdfNext: document.getElementById('btn-pdf-next'),

  // Stubs & Kido
  kidoAvatar: document.getElementById('btn-expand-left'),
  kidoNotifBadge: document.getElementById('kido-notif-badge'),
  stubRingFill: document.getElementById('stub-ring-fill'),
  stubRingPct: document.getElementById('stub-ring-pct'),
  peekTopic: document.getElementById('peek-topic'),
  peekPct: document.getElementById('peek-pct'),
  peekBarFill: document.getElementById('peek-bar-fill'),
  peekLearningsCount: document.getElementById('peek-learnings-count'),

  // HUD
  hudEl: document.getElementById('kido-hud'),
  hudProgressFill: document.getElementById('hud-progress-fill'),
  hudProgressPct: document.getElementById('hud-progress-pct'),
  hudBadgeIcon: document.getElementById('hud-badge-icon'),
  hudBadgeText: document.getElementById('hud-badge-text'),

  // Topics
  topicList: document.getElementById('topic-list'),

  // Modal
  modalSkip: document.getElementById('modal-skip-topic'),
  skipTopicName: document.getElementById('skip-topic-name'),
  skipTargetName: document.getElementById('skip-target-name'),
  btnModalCancelSkip: document.getElementById('btn-modal-cancel-skip'),
  btnModalConfirmSkip: document.getElementById('btn-modal-confirm-skip'),

  // Unified nav
  btnNavBack: document.querySelector('.nav-bar__back'),
  btnNavPause: document.getElementById('btn-pause'),
  btnNavFinish: document.getElementById('btn-finish'),

  // Header / Session
  btnMuteSounds: document.getElementById('btn-mute-sounds'),
  iconVolumeOn: document.getElementById('icon-volume-on'),
  iconVolumeOff: document.getElementById('icon-volume-off'),
  textMuteSounds: document.getElementById('text-mute-sounds'),
  btnHeaderActions: document.getElementById('btn-header-actions'),
  headerDropdown: document.getElementById('header-dropdown'),
  sessionTitle: document.querySelector('.nav-bar__session'),

  modalCrossroads: document.getElementById('modal-crossroads'),
  btnModalSaveCrossroads: document.getElementById('btn-modal-save-crossroads'),
  btnModalFinalizeCrossroads: document.getElementById('btn-modal-finalize-crossroads'),
  btnModalCancelCrossroads: document.getElementById('btn-modal-cancel-crossroads'),

  modalFinalize: document.getElementById('modal-finalize'),
  btnModalGrade: document.getElementById('btn-modal-grade'),
  btnModalCancelFinalize: document.getElementById('btn-modal-cancel-finalize'),
};
