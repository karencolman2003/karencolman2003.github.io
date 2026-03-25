const TIME_BLOCKS = ["8-10 AM", "10 AM-12 PM", "12-2 PM", "2-5 PM", "5-8 PM", "8-10 PM"];
const ALL_TIMES = "All Times";
// Swap this path if you move the local campus image.
const MAP_IMAGE_PATH = "assets/smith-campus-map.jpeg";

// Percentage coordinates tuned for the full downloadable campus image, including the left legend.
const buildingPositions = {
  "Neilson Library": { x: 44, y: 50 },
  "Campus Center": { x: 49.5, y: 53.5 },
  "Seelye Hall": { x: 56.5, y: 53 },
  "Sabin-Reed Hall": { x: 38.5, y: 60.5 },
  "Ford Hall": { x: 50, y: 70.5 },
  "Wright Hall": { x: 42.5, y: 55 },
  "Burton Hall": { x: 41, y: 62.5 },
  "Young Science Library": { x: 47.5, y: 59.5 },
  "Schacht Center": { x: 38.8, y: 76 },
  "Scott Gymnasium": { x: 35.8, y: 79 },
  "Sage Hall": { x: 34.5, y: 69.5 },
  "Chapin House": { x: 41.5, y: 37.5 },
  "Lamont House": { x: 48.5, y: 34 },
  "Cutter House": { x: 49, y: 42 },
  "Northrop House": { x: 47, y: 49 },
  "John M. Greene Hall": { x: 53.5, y: 54.5 },
  "Museum of Art": { x: 61.8, y: 60.5 },
  "Stoddard Hall": { x: 67.5, y: 61.8 }
};

const labelPositions = {
  "Neilson Library": "left",
  "Campus Center": "bottom",
  "Seelye Hall": "left",
  "Sabin-Reed Hall": "right",
  "Ford Hall": "top",
  "Wright Hall": "right",
  "Burton Hall": "right",
  "Young Science Library": "top",
  "Schacht Center": "right",
  "Scott Gymnasium": "right",
  "Sage Hall": "left",
  "Chapin House": "right",
  "Lamont House": "right",
  "Cutter House": "left",
  "Northrop House": "left",
  "John M. Greene Hall": "left",
  "Museum of Art": "top",
  "Stoddard Hall": "top"
};

const state = {
  timeBlock: ALL_TIMES,
  searchTerm: "",
  activeTab: "heatmap",
  selectedBuilding: "Campus Center"
};

const elements = {
  timeFilter: document.getElementById("timeFilter"),
  buildingSearch: document.getElementById("buildingSearch"),
  resetButton: document.getElementById("resetFilters"),
  highestRiskName: document.getElementById("highestRiskName"),
  highestRiskMeta: document.getElementById("highestRiskMeta"),
  lowestRiskName: document.getElementById("lowestRiskName"),
  lowestRiskMeta: document.getElementById("lowestRiskMeta"),
  peakWindowName: document.getElementById("peakWindowName"),
  peakWindowMeta: document.getElementById("peakWindowMeta"),
  heatmapChart: document.getElementById("heatmapChart"),
  mapMarkers: document.getElementById("mapMarkers"),
  findingsList: document.getElementById("findingsList"),
  detailHeading: document.getElementById("detailHeading"),
  detailCurrent: document.getElementById("detailCurrent"),
  detailHigh: document.getElementById("detailHigh"),
  detailLow: document.getElementById("detailLow"),
  detailReason: document.getElementById("detailReason"),
  detailInterpretation: document.getElementById("detailInterpretation"),
  detailTimeline: document.getElementById("detailTimeline"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  campusImage: document.querySelector(".campus-image")
};

elements.campusImage.src = MAP_IMAGE_PATH;

function init() {
  bindEvents();
  renderAll();
}

function bindEvents() {
  elements.timeFilter.addEventListener("change", (event) => {
    state.timeBlock = event.target.value;
    renderAll();
  });

  elements.buildingSearch.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    syncSelectedBuilding();
    renderAll();
  });

  elements.resetButton.addEventListener("click", () => {
    state.timeBlock = ALL_TIMES;
    state.searchTerm = "";
    state.selectedBuilding = "Campus Center";
    elements.timeFilter.value = ALL_TIMES;
    elements.buildingSearch.value = "";
    renderAll();
  });

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      updateTabs();
      if (state.activeTab === "heatmap") {
        renderHeatmap();
      }
    });
  });
}

function renderAll() {
  syncSelectedBuilding();
  updateSummaryCards();
  renderHeatmap();
  renderMapMarkers();
  renderDetailPanel();
  renderFindings();
  updateTabs();
}

function syncSelectedBuilding() {
  const visibleBuildings = getVisibleBuildings();
  if (!visibleBuildings.includes(state.selectedBuilding)) {
    state.selectedBuilding = visibleBuildings[0] || avoidanceData[0].building;
  }
}

function getVisibleBuildings() {
  const buildings = [...new Set(avoidanceData.map((record) => record.building))];
  if (!state.searchTerm) {
    return buildings;
  }

  return buildings.filter((building) =>
    building.toLowerCase().includes(state.searchTerm)
  );
}

function getRecordsForTime(timeBlock) {
  return timeBlock === ALL_TIMES
    ? avoidanceData
    : avoidanceData.filter((record) => record.time_block === timeBlock);
}

function getVisibleRecords() {
  const visibleBuildings = new Set(getVisibleBuildings());
  return getRecordsForTime(state.timeBlock).filter((record) =>
    visibleBuildings.has(record.building)
  );
}

function aggregateByBuilding(records) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!grouped.has(record.building)) {
      grouped.set(record.building, []);
    }
    grouped.get(record.building).push(record);
  });

  return [...grouped.entries()].map(([building, buildingRecords]) => {
    const avgRisk = Math.round(
      buildingRecords.reduce((sum, record) => sum + record.avg_risk, 0) / buildingRecords.length
    );
    const avgResponse = Math.round(
      buildingRecords.reduce((sum, record) => sum + record.response_count, 0) / buildingRecords.length
    );
    return {
      building,
      avg_risk: avgRisk,
      response_count: avgResponse,
      top_reason: getTopReason(buildingRecords),
      sample_size: buildingRecords.length
    };
  });
}

function getTopReason(records) {
  const counts = new Map();

  records.forEach((record) => {
    counts.set(record.top_reason, (counts.get(record.top_reason) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function getSummaryDataset() {
  const records = getVisibleRecords();
  return state.timeBlock === ALL_TIMES ? aggregateByBuilding(records) : records;
}

function updateSummaryCards() {
  const summaryData = getSummaryDataset().slice().sort((a, b) => b.avg_risk - a.avg_risk);
  const highest = summaryData[0];
  const lowest = summaryData[summaryData.length - 1];
  const peakWindow = getPeakWindow();

  elements.highestRiskName.textContent = highest ? highest.building : "no match";
  elements.highestRiskMeta.textContent = highest
    ? `${highest.avg_risk} avoidance index${
        state.timeBlock === ALL_TIMES ? " average across all times" : ` at ${state.timeBlock}`
      }. ${highest.response_count} modeled responses.`
    : "adjust the search to bring a building back into view.";

  elements.lowestRiskName.textContent = lowest ? lowest.building : "no match";
  elements.lowestRiskMeta.textContent = lowest
    ? `${lowest.avg_risk} avoidance index${
        state.timeBlock === ALL_TIMES ? " average across all times" : ` at ${state.timeBlock}`
      }. ${lowest.response_count} modeled responses.`
    : "the current filter is hiding every building.";

  elements.peakWindowName.textContent = peakWindow.timeBlock;
  elements.peakWindowMeta.textContent = `${peakWindow.avgRisk} average risk across visible buildings. ${
    peakWindow.building
  } reaches the local maximum there.`;
}

function getPeakWindow() {
  const visibleBuildings = new Set(getVisibleBuildings());
  const byTime = TIME_BLOCKS.map((timeBlock) => {
    const records = avoidanceData.filter(
      (record) => record.time_block === timeBlock && visibleBuildings.has(record.building)
    );
    const avgRisk = records.length
      ? Math.round(records.reduce((sum, record) => sum + record.avg_risk, 0) / records.length)
      : 0;
    const topRecord = records.slice().sort((a, b) => b.avg_risk - a.avg_risk)[0];
    return {
      timeBlock,
      avgRisk,
      building: topRecord ? topRecord.building : "no building"
    };
  });

  return byTime.sort((a, b) => b.avgRisk - a.avgRisk)[0];
}

function renderHeatmap() {
  const buildings = getVisibleBuildings();
  if (!buildings.length) {
    Plotly.purge(elements.heatmapChart);
    elements.heatmapChart.innerHTML =
      '<div class="empty-state">no buildings match the current search.</div>';
    return;
  }

  const matrix = buildings.map((building) =>
    TIME_BLOCKS.map((timeBlock) => {
      const record = avoidanceData.find(
        (entry) => entry.building === building && entry.time_block === timeBlock
      );
      return record ? record.avg_risk : null;
    })
  );

  const customData = buildings.map((building) =>
    TIME_BLOCKS.map((timeBlock) => {
      const record = avoidanceData.find(
        (entry) => entry.building === building && entry.time_block === timeBlock
      );
      return record
        ? [record.building, record.time_block, record.response_count, record.top_reason]
        : [building, timeBlock, 0, "n/a"];
    })
  );

  const data = [
    {
      type: "heatmap",
      x: TIME_BLOCKS,
      y: buildings,
      z: matrix,
      customdata: customData,
      colorscale: [
        [0, "#f4e5df"],
        [0.35, "#e7c6be"],
        [0.7, "#ca7f71"],
        [1, "#8f3d36"]
      ],
      zmin: 8,
      zmax: 95,
      hovertemplate:
        "<b>%{customdata[0]}</b><br>" +
        "time block: %{customdata[1]}<br>" +
        "avoidance index: %{z}<br>" +
        "response count: %{customdata[2]}<br>" +
        "top reason: %{customdata[3]}<extra></extra>",
      showscale: false
    }
  ];

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 28, r: 18, b: 60, l: 140 },
    xaxis: {
      tickfont: { family: "Manrope, sans-serif", size: 12, color: "#6f655c" },
      showgrid: false,
      zeroline: false,
      fixedrange: true
    },
    yaxis: {
      automargin: true,
      tickfont: { family: "Manrope, sans-serif", size: 12, color: "#24201d" },
      showgrid: false,
      zeroline: false,
      autorange: "reversed",
      fixedrange: true
    },
    font: { family: "Manrope, sans-serif", color: "#24201d" },
    annotations:
      state.timeBlock === ALL_TIMES
        ? []
        : [
            {
              x: 0,
              y: 1.12,
              xref: "paper",
              yref: "paper",
              xanchor: "left",
              showarrow: false,
              text: `focused summary window: ${state.timeBlock}`,
              font: { family: "Manrope, sans-serif", size: 12, color: "#6f655c" }
            }
          ]
  };

  const config = {
    displayModeBar: false,
    responsive: true
  };

  Plotly.react(elements.heatmapChart, data, layout, config);
}

function renderMapMarkers() {
  const visibleBuildings = getVisibleBuildings();
  // When "All Times" is selected, markers show a building-level average rather than a single slot.
  const recordsByBuilding =
    state.timeBlock === ALL_TIMES
      ? aggregateByBuilding(avoidanceData.filter((record) => visibleBuildings.includes(record.building)))
      : avoidanceData.filter(
          (record) =>
            record.time_block === state.timeBlock && visibleBuildings.includes(record.building)
        );

  elements.mapMarkers.innerHTML = "";

  recordsByBuilding.forEach((record) => {
    const position = buildingPositions[record.building];
    if (!position) {
      return;
    }

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `marker${record.building === state.selectedBuilding ? " is-selected" : ""}`;
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.setAttribute("aria-label", `${record.building}, avoidance index ${record.avg_risk}`);
    marker.title =
      `${record.building}\n` +
      `time block: ${state.timeBlock === ALL_TIMES ? "all times" : state.timeBlock}\n` +
      `avoidance index: ${record.avg_risk}\n` +
      `response count: ${record.response_count}\n` +
      `top reason: ${record.top_reason}`;

    marker.addEventListener("click", () => {
      state.selectedBuilding = record.building;
      renderMapMarkers();
      renderDetailPanel();
    });

    const dot = document.createElement("span");
    dot.className = "marker-dot";
    const size = 14 + (record.response_count / 80) * 22;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.background = colorForRisk(record.avg_risk);

    const label = document.createElement("span");
    label.className = `marker-label${shouldHideLabel(record.building) ? " is-hidden" : ""}`;
    label.dataset.position = labelPositions[record.building] || "right";
    label.textContent = record.building;

    marker.append(dot, label);
    elements.mapMarkers.appendChild(marker);
  });
}

function shouldHideLabel(building) {
  if (window.innerWidth > 760) {
    return false;
  }

  return ["Museum of Art", "John M. Greene Hall", "Stoddard Hall", "Burton Hall"].includes(building);
}

function colorForRisk(avgRisk) {
  const min = 8;
  const max = 95;
  const normalized = (avgRisk - min) / (max - min);
  const start = [244, 229, 223];
  const end = [143, 61, 54];
  const channel = start.map((value, index) =>
    Math.round(value + (end[index] - value) * normalized)
  );
  return `rgb(${channel[0]}, ${channel[1]}, ${channel[2]})`;
}

function renderDetailPanel() {
  const buildingRecords = avoidanceData
    .filter((record) => record.building === state.selectedBuilding)
    .sort((a, b) => TIME_BLOCKS.indexOf(a.time_block) - TIME_BLOCKS.indexOf(b.time_block));

  const currentRecord =
    state.timeBlock === ALL_TIMES
      ? aggregateByBuilding(buildingRecords)[0]
      : buildingRecords.find((record) => record.time_block === state.timeBlock);

  const highest = buildingRecords.slice().sort((a, b) => b.avg_risk - a.avg_risk)[0];
  const lowest = buildingRecords.slice().sort((a, b) => a.avg_risk - b.avg_risk)[0];
  const recurringReason = getTopReason(buildingRecords);

  elements.detailHeading.textContent = state.selectedBuilding;
  elements.detailCurrent.textContent = currentRecord
    ? `${currentRecord.avg_risk} at ${state.timeBlock === ALL_TIMES ? "all times" : currentRecord.time_block}`
    : "no visible data";
  elements.detailHigh.textContent = `${highest.time_block} (${highest.avg_risk})`;
  elements.detailLow.textContent = `${lowest.time_block} (${lowest.avg_risk})`;
  elements.detailReason.textContent = recurringReason;
  elements.detailInterpretation.textContent = buildInterpretation(
    state.selectedBuilding,
    highest,
    recurringReason
  );

  elements.detailTimeline.innerHTML = "";

  buildingRecords.forEach((record) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const label = document.createElement("span");
    label.textContent = record.time_block;

    const track = document.createElement("div");
    track.className = "timeline-track";

    const fill = document.createElement("div");
    fill.className = "timeline-fill";
    fill.style.width = `${(record.avg_risk / 95) * 100}%`;

    const value = document.createElement("span");
    value.textContent = `${record.avg_risk}`;

    track.appendChild(fill);
    row.append(label, track, value);
    elements.detailTimeline.appendChild(row);
  });
}

function buildInterpretation(building, highestRecord, recurringReason) {
  const phrasingByTime = {
    "8-10 AM": "appears briefly as a morning concern",
    "10 AM-12 PM": "settles into a late-morning bottleneck",
    "12-2 PM": "becomes a predictable midday hazard",
    "2-5 PM": "holds its risk through the long afternoon",
    "5-8 PM": "turns quietly consequential in the early evening",
    "8-10 PM": "peaks late, with unexpectedly durable social exposure"
  };

  return `${building} ${phrasingByTime[highestRecord.time_block]}, driven mostly by ${recurringReason}.`;
}

function renderFindings() {
  const visibleRecords = getVisibleRecords();
  if (!visibleRecords.length) {
    elements.findingsList.innerHTML =
      "<li>no records match the current search. the model briefly recommends absence.</li>";
    return;
  }

  const summaryDataset = getSummaryDataset().slice().sort((a, b) => b.avg_risk - a.avg_risk);
  const top = summaryDataset[0];
  const bottom = summaryDataset[summaryDataset.length - 1];
  const peakWindow = getPeakWindow();
  const centralTrafficShare = Math.round(
    (visibleRecords.filter((record) => record.top_reason === "central traffic").length / visibleRecords.length) *
      100
  );

  const findings = [
    top
      ? `${top.building} currently leads the model ${
          state.timeBlock === ALL_TIMES ? "on average" : `during ${state.timeBlock}`
        }, suggesting that some forms of coincidence continue to prefer central infrastructure.`
      : "the current filter removes every building, which is one valid way to reduce risk.",
    `${peakWindow.timeBlock} remains the broadest exposure window across the visible dataset, which is an elegant way of saying lunch and class circulation still outperform strategic planning.`,
    `${centralTrafficShare}% of visible records cite central traffic, implying the campus pathway network is doing a great deal of the narrative work. ${
      bottom ? `${bottom.building} remains comparatively calm.` : ""
    }`
  ];

  elements.findingsList.innerHTML = findings.map((item) => `<li>${item}</li>`).join("");
}

function updateTabs() {
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  elements.tabPanels.forEach((panel) => {
    const shouldShow =
      (state.activeTab === "heatmap" && panel.id === "panel-heatmap") ||
      (state.activeTab === "map" && panel.id === "panel-map");
    panel.classList.toggle("is-active", shouldShow);
    panel.hidden = !shouldShow;
  });
}

window.addEventListener("resize", () => {
  renderMapMarkers();
});

init();
