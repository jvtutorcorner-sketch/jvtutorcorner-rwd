/**
 * generate-test-pdfs.js
 *
 * Generates E2E test PDF fixtures with real content (rich text, layout sections)
 * for use in classroom whiteboard sync tests.
 *
 * Usage: node scripts/generate-test-pdfs.js
 * Output: public/test-pdfs/test-*.pdf
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { jsPDF } = require('jspdf');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'test-pdfs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Draw a full-page layout with:
 *  - A header bar
 *  - A large title
 *  - 3 content sections (heading + body paragraph)
 *  - A footer
 */
function drawPage(doc, pageNum, totalPages, title, sections) {
  const W = doc.internal.pageSize.getWidth();   // 595 pt (A4)
  const H = doc.internal.pageSize.getHeight();  // 842 pt (A4)
  const MARGIN = 50;

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(30, 80, 160);
  doc.rect(0, 0, W, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('JV Tutor Corner — E2E Classroom Sync Test', MARGIN, 24);

  // Page indicator (right-aligned in header)
  const pageLabel = `Page ${pageNum} / ${totalPages}`;
  const pageLabelW = doc.getTextWidth(pageLabel);
  doc.text(pageLabel, W - MARGIN - pageLabelW, 24);

  // ── Large title ─────────────────────────────────────────────────────────
  let y = 72;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(title, MARGIN, y);
  y += 16;

  // Decorative underline
  doc.setDrawColor(30, 80, 160);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 24;

  // ── Content sections ────────────────────────────────────────────────────
  const sectionColors = [
    [0, 100, 60],
    [130, 50, 0],
    [0, 70, 130],
  ];

  sections.forEach((section, idx) => {
    const [r, g, b] = sectionColors[idx % sectionColors.length];

    // Section heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(r, g, b);
    doc.text(`${idx + 1}. ${section.heading}`, MARGIN, y);
    y += 10;

    // Thin rule under heading
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 14;

    // Body paragraphs — split into lines
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(section.body, W - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 7.5 + 20;
  });

  // ── Bottom decorative box ────────────────────────────────────────────────
  if (y < H - 100) {
    doc.setFillColor(245, 247, 252);
    doc.setDrawColor(180, 190, 210);
    doc.setLineWidth(0.5);
    const boxH = Math.min(H - 100 - y, 70);
    if (boxH > 20) {
      doc.rect(MARGIN, y, W - MARGIN * 2, boxH, 'FD');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10.5);
      doc.setTextColor(100, 110, 130);
      const note = `This page was generated automatically for whiteboard PDF synchronisation testing. Course ID is embedded in session metadata.`;
      const noteLines = doc.splitTextToSize(note, W - MARGIN * 2 - 20);
      doc.text(noteLines, MARGIN + 10, y + 16);
      y += boxH + 10;
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFillColor(220, 225, 235);
  doc.rect(0, H - 28, W, 28, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 100);
  doc.text(`© JV Tutor Corner  ·  Whiteboard Sync Test Fixture  ·  Page ${pageNum} of ${totalPages}`, MARGIN, H - 10);
}

// ─── Shared content blocks ─────────────────────────────────────────────────

const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

const EDU = `The flipped classroom model places new instruction at home through video lectures and reserves in-class time for exercises, projects, and discussions. Research indicates that students who engage actively with material through collaborative problem-solving demonstrate significantly higher retention rates compared to passive listening. The teacher's role shifts from lecturer to facilitator, providing targeted assistance while students work through higher-order thinking tasks.`;

const SYNC = `Real-time whiteboard synchronisation relies on an event-driven WebSocket protocol. When a teacher moves a page index, the SDK emits a scene-change event that propagates to all participants in the room within milliseconds. Participants poll the shared scene state at 1-second intervals to handle reconnection scenarios. A PDF document uploaded before session start is converted to a series of whiteboard scenes, each corresponding to one page, enabling seamless teacher-controlled navigation.`;

// ─── Generator functions ───────────────────────────────────────────────────

function makeSinglePage() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  drawPage(doc, 1, 1, 'Single Page Classroom Fixture', [
    { heading: 'Lesson Overview', body: EDU },
    { heading: 'Whiteboard Synchronisation', body: SYNC },
    { heading: 'Additional Notes', body: LOREM },
  ]);
  return Buffer.from(doc.output('arraybuffer'));
}

function makeMultiPage(pageCount = 5) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const topics = [
    { title: 'Introduction & Learning Objectives', sections: [
      { heading: 'Lesson Overview', body: EDU },
      { heading: 'Real-Time Sync Protocol', body: SYNC },
      { heading: 'Session Notes', body: LOREM },
    ]},
    { title: 'Core Concepts — Part 1', sections: [
      { heading: 'Conceptual Framework', body: LOREM },
      { heading: 'Pedagogical Approach', body: EDU },
      { heading: 'Technical Background', body: SYNC },
    ]},
    { title: 'Core Concepts — Part 2', sections: [
      { heading: 'Deep Dive: WebSocket Events', body: SYNC },
      { heading: 'Classroom Isolation', body: `Each classroom session is identified by a unique UUID derived from the course ID and timestamp. Session state is persisted in DynamoDB, ensuring that concurrent classroom sessions — even those running on the same server — remain fully isolated. No participant state, whiteboard content, or PDF attachment from one session can bleed into another.` },
      { heading: 'Further Reading', body: LOREM },
    ]},
    { title: 'Practice Exercises', sections: [
      { heading: 'Exercise A — Concept Map', body: `Draw a concept map connecting the following terms: WebSocket, DynamoDB, Scene Index, PDF Upload, Session Key, Broadcast Channel. For each connection, annotate the direction and nature of the data flow. Use the whiteboard tools to draw and annotate your map directly on this page.` },
      { heading: 'Exercise B — Discussion Questions', body: `1. Why is it important to use a sequential ready-click pattern rather than a parallel one when multiple groups are joining simultaneously?\n2. How does the DynamoDB write model prevent race conditions during high-concurrency classroom entry?\n3. What fallback mechanisms exist when the Agora RTM channel is unavailable?` },
      { heading: 'Group Activity', body: LOREM },
    ]},
    { title: 'Summary & Assessment', sections: [
      { heading: 'Key Takeaways', body: `After completing this module, students should be able to: (1) explain the end-to-end flow of a classroom PDF sync event; (2) describe how session isolation is achieved using unique UUID keys; (3) identify potential failure points and apply the appropriate diagnostic sequence; (4) configure SLO thresholds for whiteboard sync latency in a production environment.` },
      { heading: 'Self-Assessment Checklist', body: `□ I can explain the role of sessionReadyKey in PDF metadata storage.\n□ I understand why PDF upload must happen before entering the classroom room.\n□ I can read the Agora whiteboard scene state from the browser console.\n□ I know how to use the load-escalation test suite to verify concurrent session stability.` },
      { heading: 'References', body: LOREM },
    ]},
  ];

  for (let i = 0; i < pageCount; i++) {
    if (i > 0) doc.addPage();
    const t = topics[i % topics.length];
    drawPage(doc, i + 1, pageCount, `[Page ${i + 1}] ${t.title}`, t.sections);
  }

  return Buffer.from(doc.output('arraybuffer'));
}

function makeLongDoc(pageCount = 10) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  for (let i = 0; i < pageCount; i++) {
    if (i > 0) doc.addPage();
    drawPage(doc, i + 1, pageCount, `Chapter ${i + 1} — Advanced Topic ${i + 1}`, [
      { heading: `Section ${i + 1}.1 — Theory`, body: EDU },
      { heading: `Section ${i + 1}.2 — Implementation`, body: SYNC },
      { heading: `Section ${i + 1}.3 — Exercises`, body: LOREM },
    ]);
  }
  return Buffer.from(doc.output('arraybuffer'));
}

function makeBlankPage() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  // One mostly-blank page with just minimal header so Agora can parse it
  drawPage(doc, 1, 1, 'Blank Template', [
    { heading: 'Empty Workspace', body: '(This page is intentionally left blank for freehand drawing.)' },
  ]);
  return Buffer.from(doc.output('arraybuffer'));
}

// ─── Main ──────────────────────────────────────────────────────────────────

const files = [
  { name: 'test-single-page.pdf', buf: makeSinglePage() },
  { name: 'test-multi-page.pdf',  buf: makeMultiPage(5) },
  { name: 'test-long-doc.pdf',    buf: makeLongDoc(10) },
  { name: 'test-blank.pdf',       buf: makeBlankPage() },
];

for (const { name, buf } of files) {
  const dest = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(dest, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`✅ ${name}  (${kb} KB)`);
}

console.log(`\nAll PDFs written to: ${OUTPUT_DIR}`);
