const elements = {
  apiKey: document.getElementById("api-key"),
  sentence: document.getElementById("sentence-input"),
  button: document.getElementById("diagram-btn"),
  status: document.getElementById("status"),
  area: document.getElementById("diagram-area"),
  legend: document.getElementById("legend"),
  exampleButtons: Array.from(document.querySelectorAll("[data-example]"))
};

const COLORS = {
  ink: "#181612",
  muted: "#6d645a"
};

elements.exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    elements.sentence.value = button.dataset.example;
    elements.sentence.focus();
  });
});

elements.button.addEventListener("click", diagramSentence);
elements.sentence.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    diagramSentence();
  }
});

function setStatus(message) {
  elements.status.textContent = message;
}

function setBusy(isBusy) {
  elements.button.disabled = isBusy;
}

function clearDiagram() {
  elements.area.innerHTML = "";
  elements.legend.hidden = true;
}

function showEmptyState(message) {
  clearDiagram();
  const empty = document.createElement("p");
  empty.className = "status";
  empty.textContent = message;
  elements.area.appendChild(empty);
}

async function diagramSentence() {
  const sentence = elements.sentence.value.trim();
  const apiKey = elements.apiKey.value.trim();

  if (!sentence) {
    setStatus("Type a sentence first.");
    clearDiagram();
    return;
  }

  if (!apiKey) {
    setStatus("Paste an Anthropic API key first.");
    clearDiagram();
    return;
  }

  setBusy(true);
  setStatus("Parsing sentence...");
  clearDiagram();

  try {
    const parsed = await fetchSentenceStructure(sentence, apiKey);
    drawDiagram(parsed);
    setStatus("");
    elements.legend.hidden = false;
  } catch (error) {
    console.error(error);
    showEmptyState(error.message || "The diagram could not be rendered.");
    setStatus("The sentence could not be parsed.");
  } finally {
    setBusy(false);
  }
}

async function fetchSentenceStructure(sentence, apiKey) {
  const prompt = `You are a grammatical parser for Reed-Kellogg sentence diagramming.
Return only valid JSON with this exact schema:
{
  "subject": "word",
  "verb": "word",
  "object": "word or null",
  "indirect_object": "word or null",
  "subject_complement": "word or null",
  "subject_modifiers": ["words"],
  "verb_modifiers": ["words"],
  "object_modifiers": ["words"],
  "prepositional_phrases": [
    {"preposition": "word", "object": "word", "modifies": "subject|verb|object"}
  ]
}

Rules:
- Use only words from the sentence.
- Keep arrays empty when absent.
- Use null when a field does not exist.
- Do not include any explanation or markdown.

Sentence: "${sentence}"`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    const message = payload?.error?.message || `Anthropic request failed (${response.status}).`;
    throw new Error(message);
  }

  const text = payload?.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("Claude did not return parsable JSON.");
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("The parser response was not valid JSON.");
  }

  return normalizeParse(parsed);
}

function normalizeParse(parsed) {
  const normalized = {
    subject: parsed.subject || "",
    verb: parsed.verb || "",
    object: parsed.object || null,
    indirect_object: parsed.indirect_object || null,
    subject_complement: parsed.subject_complement || null,
    subject_modifiers: Array.isArray(parsed.subject_modifiers) ? parsed.subject_modifiers.filter(Boolean) : [],
    verb_modifiers: Array.isArray(parsed.verb_modifiers) ? parsed.verb_modifiers.filter(Boolean) : [],
    object_modifiers: Array.isArray(parsed.object_modifiers) ? parsed.object_modifiers.filter(Boolean) : [],
    prepositional_phrases: Array.isArray(parsed.prepositional_phrases)
      ? parsed.prepositional_phrases.filter((item) => item?.preposition && item?.object)
      : []
  };

  if (!normalized.subject || !normalized.verb) {
    throw new Error("The response was missing a subject or verb.");
  }

  return normalized;
}

function drawDiagram(parsed) {
  const svgNS = "http://www.w3.org/2000/svg";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const fontFamily = "'IBM Plex Mono', monospace";
  const baseFontSize = 16;
  const smallFontSize = 13;

  const paddingX = 52;
  const baselineY = 108;
  const bottomPadding = 50;
  const dividerHeight = 52;
  const segmentPadding = 28;
  const minSegmentWidth = 110;
  const modifierDrop = 38;
  const modifierRowGap = 34;
  const prepSectionGap = 38;
  const prepRowHeight = 82;
  const prepStemHeight = 26;
  const prepGap = 18;

  const segments = buildSegments(parsed);
  const segmentWidths = segments.map((segment) =>
    Math.max(minSegmentWidth, measureText(segment.text, false) + segmentPadding * 2)
  );

  const segmentPositions = [];
  let cursorX = paddingX;
  segmentWidths.forEach((width, index) => {
    const start = cursorX;
    const end = start + width;
    segmentPositions.push({
      ...segments[index],
      width,
      start,
      end,
      center: start + width / 2
    });
    cursorX = end;
  });

  const lastSegment = segmentPositions[segmentPositions.length - 1];
  const baselineEnd = lastSegment.end + 20;
  const modifierMaxRows = Math.max(
    parsed.subject_modifiers.length,
    parsed.verb_modifiers.length,
    parsed.object_modifiers.length,
    0
  );
  const modifierSectionHeight = modifierMaxRows
    ? modifierDrop + modifierMaxRows * modifierRowGap
    : 0;

  const prepStartY = baselineY + modifierSectionHeight + prepSectionGap;
  const preps = parsed.prepositional_phrases;
  const totalHeight = prepStartY + preps.length * prepRowHeight + bottomPadding;
  const totalWidth = Math.max(720, baselineEnd + paddingX);

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "diagram");
  svg.setAttribute("width", String(totalWidth));
  svg.setAttribute("height", String(Math.max(260, totalHeight)));
  svg.setAttribute("viewBox", `0 0 ${totalWidth} ${Math.max(260, totalHeight)}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Sentence diagram");

  const title = document.createElementNS(svgNS, "title");
  title.textContent = "Sentence diagram";
  svg.appendChild(title);

  const baselineStart = segmentPositions[0].start;
  line(svg, baselineStart, baselineY, baselineEnd, baselineY);

  segmentPositions.forEach((segment, index) => {
    text(svg, segment.text, segment.center, baselineY - 14, { size: baseFontSize });

    if (index === segmentPositions.length - 1) {
      return;
    }

    const x = segment.end;
    if (segmentPositions[index + 1].kind === "subject_complement") {
      line(svg, x, baselineY + dividerHeight / 2, x + dividerHeight * 0.7, baselineY - dividerHeight / 2);
      return;
    }

    line(svg, x, baselineY - dividerHeight / 2, x, baselineY + dividerHeight / 2);
  });

  drawModifiers(svg, parsed.subject_modifiers, segmentPositions[0], baselineY, measureText, {
    rowGap: modifierRowGap,
    drop: modifierDrop,
    smallFontSize
  });
  drawModifiers(svg, parsed.verb_modifiers, segmentPositions[1], baselineY, measureText, {
    rowGap: modifierRowGap,
    drop: modifierDrop,
    smallFontSize
  });

  const objectSegment = segmentPositions.find((segment) =>
    segment.kind === "object" || segment.kind === "subject_complement" || segment.kind === "indirect_object"
  );

  if (parsed.object_modifiers.length) {
    const modifierAnchor =
      segmentPositions.find((segment) => segment.kind === "object") ||
      segmentPositions.find((segment) => segment.kind === "subject_complement") ||
      objectSegment;

    if (modifierAnchor) {
      drawModifiers(svg, parsed.object_modifiers, modifierAnchor, baselineY, measureText, {
        rowGap: modifierRowGap,
        drop: modifierDrop,
        smallFontSize
      });
    }
  }

  preps.forEach((phrase, index) => {
    const anchor = getPrepAnchor(segmentPositions, phrase.modifies);
    const rowY = prepStartY + index * prepRowHeight;
    const prepWidth = Math.max(78, measureText(phrase.preposition, true) + 22);
    const objectWidth = Math.max(82, measureText(phrase.object, true) + 26);
    const phraseWidth = Math.max(prepWidth, objectWidth);
    const left = clamp(anchor.center - phraseWidth / 2, paddingX, totalWidth - paddingX - phraseWidth);
    const centerX = left + phraseWidth / 2;

    line(svg, anchor.center, baselineY + 6, centerX, rowY - prepGap, {
      stroke: COLORS.muted,
      width: 1,
      dash: "4 5"
    });
    line(svg, left, rowY, left + phraseWidth, rowY, { stroke: COLORS.ink, width: 1.1 });
    text(svg, phrase.preposition, centerX, rowY - 7, { size: smallFontSize, fill: COLORS.muted });
    line(svg, centerX, rowY, centerX, rowY + prepStemHeight);
    line(svg, centerX - objectWidth / 2, rowY + prepStemHeight, centerX + objectWidth / 2, rowY + prepStemHeight);
    text(svg, phrase.object, centerX, rowY + prepStemHeight - 7, {
      size: smallFontSize,
      fill: COLORS.muted
    });
  });

  elements.area.innerHTML = "";
  elements.area.appendChild(svg);

  function measureText(value, isSmall) {
    ctx.font = `${isSmall ? smallFontSize : baseFontSize}px ${fontFamily}`;
    return ctx.measureText(value).width;
  }

  function line(root, x1, y1, x2, y2, options = {}) {
    const node = document.createElementNS(svgNS, "line");
    node.setAttribute("x1", x1);
    node.setAttribute("y1", y1);
    node.setAttribute("x2", x2);
    node.setAttribute("y2", y2);
    node.setAttribute("stroke", options.stroke || COLORS.ink);
    node.setAttribute("stroke-width", options.width || 1.2);
    if (options.dash) {
      node.setAttribute("stroke-dasharray", options.dash);
    }
    root.appendChild(node);
  }

  function text(root, value, x, y, options = {}) {
    const node = document.createElementNS(svgNS, "text");
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    node.setAttribute("text-anchor", options.anchor || "middle");
    node.setAttribute("font-family", fontFamily);
    node.setAttribute("font-size", options.size || baseFontSize);
    node.setAttribute("fill", options.fill || COLORS.ink);
    node.textContent = value;
    root.appendChild(node);
  }
}

function buildSegments(parsed) {
  const segments = [
    { kind: "subject", text: parsed.subject },
    { kind: "verb", text: parsed.verb }
  ];

  if (parsed.indirect_object) {
    segments.push({ kind: "indirect_object", text: parsed.indirect_object });
  }

  if (parsed.object) {
    segments.push({ kind: "object", text: parsed.object });
  } else if (parsed.subject_complement) {
    segments.push({ kind: "subject_complement", text: parsed.subject_complement });
  }

  return segments;
}

function drawModifiers(svg, modifiers, segment, baselineY, measureText, options) {
  modifiers.forEach((modifier, index) => {
    const startX = segment.start + 14;
    const rowY = baselineY + options.drop + index * options.rowGap;
    const diagonalEndX = Math.min(startX + 22, segment.end - 18);
    const shelfStartX = diagonalEndX;
    const shelfWidth = Math.min(
      Math.max(48, measureText(modifier, true) + 16),
      Math.max(48, segment.width - 28)
    );

    const diagonal = document.createElementNS("http://www.w3.org/2000/svg", "line");
    diagonal.setAttribute("x1", startX);
    diagonal.setAttribute("y1", baselineY);
    diagonal.setAttribute("x2", diagonalEndX);
    diagonal.setAttribute("y2", rowY);
    diagonal.setAttribute("stroke", COLORS.ink);
    diagonal.setAttribute("stroke-width", "1.1");
    svg.appendChild(diagonal);

    const shelf = document.createElementNS("http://www.w3.org/2000/svg", "line");
    shelf.setAttribute("x1", shelfStartX);
    shelf.setAttribute("y1", rowY);
    shelf.setAttribute("x2", shelfStartX + shelfWidth);
    shelf.setAttribute("y2", rowY);
    shelf.setAttribute("stroke", COLORS.ink);
    shelf.setAttribute("stroke-width", "1.1");
    svg.appendChild(shelf);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", shelfStartX + 6);
    label.setAttribute("y", rowY - 7);
    label.setAttribute("text-anchor", "start");
    label.setAttribute("font-family", "'IBM Plex Mono', monospace");
    label.setAttribute("font-size", String(options.smallFontSize));
    label.setAttribute("fill", COLORS.muted);
    label.textContent = modifier;
    svg.appendChild(label);
  });
}

function getPrepAnchor(segmentPositions, modifies) {
  if (modifies === "subject") {
    return segmentPositions[0];
  }

  if (modifies === "object") {
    return (
      segmentPositions.find((segment) => segment.kind === "object") ||
      segmentPositions[segmentPositions.length - 1]
    );
  }

  return segmentPositions[1];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
