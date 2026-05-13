const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "dashboard-public")));
app.use("/test-results", express.static(path.join(__dirname, "test-results")));
app.use("/trace-viewer", express.static(path.join(__dirname, "node_modules/playwright-core/lib/vite/traceViewer")));

const TEST_DATA_PATH = path.join(__dirname, "tests/fixtures/test-data.ts");
const PHARMACIES_PATH = path.join(__dirname, "tests/fixtures/pharmacies.ts");

// ── Pharmacy + test discovery ─────────────────────────────────────────────────

function readPharmacies() {
  const src = fs.readFileSync(PHARMACIES_PATH, "utf8");
  const list = [];
  const re = /\{\s*name:\s*"([^"]+)"\s*,\s*baseURL:\s*"([^"]+)"(?:\s*,\s*ciSkip:\s*(true|false))?\s*\}/g;
  let m;
  while ((m = re.exec(src))) {
    list.push({ name: m[1], baseURL: m[2], ciSkip: m[3] === "true" });
  }
  return list;
}

let _testListCache = null;
let _testListCacheAt = 0;
const TEST_LIST_TTL_MS = 30_000;
let lastRunStartTime = 0;
const activeProcs = new Map(); // runId → { proc, startTime }
const completedRunIds = new Set(); // prevent EventSource auto-reconnect from restarting tests
const MAX_RUN_MS = 10 * 60 * 1000; // 10-minute hard timeout per run

function flattenSuites(suites, parentTitles = [], depth = 0) {
  const out = [];
  for (const s of suites || []) {
    // Skip file-level suite title (depth 0); keep describe titles
    const titles = depth === 0 ? parentTitles : [...parentTitles, s.title].filter(Boolean);
    for (const spec of s.specs || []) {
      out.push({
        title: spec.title,
        fullTitle: [...titles, spec.title].filter(Boolean).join(" > "),
        file: spec.file || s.file || "",
        line: spec.line || 0,
      });
    }
    if (s.suites) out.push(...flattenSuites(s.suites, titles, depth + 1));
  }
  return out;
}

function listTests() {
  if (_testListCache && Date.now() - _testListCacheAt < TEST_LIST_TTL_MS) {
    return Promise.resolve(_testListCache);
  }
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["playwright", "test", "--list", "--reporter=json"], {
      cwd: __dirname,
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("close", () => {
      try {
        const json = JSON.parse(out);
        // Dedupe by fullTitle (same test repeats per project)
        const all = flattenSuites(json.suites || []);
        const seen = new Set();
        const unique = [];
        for (const t of all) {
          const key = `${t.file}::${t.fullTitle}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
          }
        }
        _testListCache = unique;
        _testListCacheAt = Date.now();
        resolve(unique);
      } catch (e) {
        reject(new Error(`Failed to list tests: ${e.message}\n${err}`));
      }
    });
  });
}

// ── Flow configs (mirrors flow-configs.ts — JS copy for dashboard) ────────────
const FLOW_CONFIGS = [
  { name: "NHS — next available slot",              group: "NHS",     conditionJourneyType: "nhs" },
  { name: "NHS — specific date and time",           group: "NHS",     conditionJourneyType: "nhs" },
  { name: "Private — next available slot, new card",  group: "Private", conditionJourneyType: "private" },
  { name: "Private — next available slot, saved card", group: "Private", conditionJourneyType: "private" },
  { name: "Private — specific date, new card",      group: "Private", conditionJourneyType: "private" },
  { name: "Private — specific date, saved card",    group: "Private", conditionJourneyType: "private" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readTestData() {
  const src = fs.readFileSync(TEST_DATA_PATH, "utf8");

  const get = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m ? m[1] : "";
  };
  const getNum = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const getBool = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*(true|false)`));
    return m ? m[1] === "true" : false;
  };

  // Active condition — find uncommented journeyType line
  const activeMatch = src.match(/journeyType:\s*"(nhs|private|lifestyle)"\s+as\s+ConditionJourneyType,?\s*\n(?!\s*\/\/)/);
  // Simpler: find the uncommented journeyType line inside ACTIVE_CONDITION block
  const activeCondBlock = src.match(/ACTIVE_CONDITION\s*=\s*\{([^}]+)\}/s);
  let journeyType = "nhs";
  if (activeCondBlock) {
    const uncommented = activeCondBlock[1]
      .split("\n")
      .find((l) => l.includes("journeyType") && !l.trim().startsWith("//"));
    if (uncommented) {
      const jm = uncommented.match(/"(nhs|private|lifestyle)"/);
      if (jm) journeyType = jm[1];
    }
  }

  return {
    user: {
      gender: get("gender"),
      firstName: get("firstName"),
      lastName: get("lastName"),
      postcode: get("postcode"),
      email: get("email"),
      phone: get("phone"),
      guardianName: get("guardianName"),
      dobDay: get("day"),
      dobMonth: get("month"),
      dobYear: get("year"),
      password: get("password"),
      confirmPassword: get("confirmPassword"),
    },
    payment: {
      cardholderName: get("cardholderName"),
      cardNumber: get("cardNumber"),
      expiryDate: get("expiryDate"),
      securityCode: get("securityCode"),
    },
    condition: { journeyType },
    booking: {
      appointmentType: get("appointmentType"),
      useNextAvailableSlot: getBool("useNextAvailableSlot"),
      preferredMonth: get("preferredMonth"),
      preferredDate: get("preferredDate"),
      preferredTime: get("preferredTime"),
      autoMoveToNextDate: getBool("autoMoveToNextDate"),
      maxDateAttempts: getNum("maxDateAttempts"),
    },
    drug: {
      strength: get("strength"),
      packSize: get("packSize"),
    },
    cart: {
      quantityAction: get("quantityAction"),
      quantityClicks: getNum("quantityClicks"),
      deleteProduct: getBool("deleteProduct"),
      couponCode: (() => { const m = src.match(/couponCode:\s*"([^"]*)"/); return m ? m[1] : ""; })(),
      action: (() => { const m = src.match(/CART_PREFERENCES[\s\S]*?action:\s*"([^"]*)"/); return m ? m[1] : "Proceed To Checkout"; })(),
    },
    shipping: {
      shippingMode: get("shippingMode"),
      addressType: get("addressType"),
      addressLine1: get("addressLine1"),
      addressLine2: (() => { const m = src.match(/addressLine2:\s*"([^"]*)"/); return m ? m[1] : ""; })(),
      townCity: get("townCity"),
      postalCode: get("postalCode"),
      addressAction: get("addressAction"),
      paymentMethod: get("paymentMethod"),
    },
    thankYou: {
      action: (() => { const m = src.match(/THANK_YOU_PREFERENCES[\s\S]*?action:\s*"([^"]*)"/); return m ? m[1] : "My Orders"; })(),
    },
  };
}

function writeTestData(data) {
  let src = fs.readFileSync(TEST_DATA_PATH, "utf8");

  // Load current file values so empty incoming fields fall back to defaults
  const defs = readTestData();
  // s(val, def): return val if non-empty, else def
  const s = (val, def) => (val != null && String(val).trim() !== "") ? String(val) : String(def ?? "");

  // Use a function replacement to avoid treating $ in val as a special replacement pattern
  const setStr = (key, val) => {
    src = src.replace(new RegExp(`(${key}:\\s*)"[^"]*"`), (_, prefix) => `${prefix}"${val}"`);
  };
  const setBool = (key, val) => {
    src = src.replace(
      new RegExp(`(${key}:\\s*)(true|false)`),
      `$1${val ? "true" : "false"}`
    );
  };
  const setNum = (key, val) => {
    src = src.replace(new RegExp(`(${key}:\\s*)\\d+`), `$1${val}`);
  };

  const u = data.user || {};
  setStr("gender",          s(u.gender,          defs.user.gender));
  setStr("firstName",       s(u.firstName,        defs.user.firstName));
  setStr("lastName",        s(u.lastName,         defs.user.lastName));
  setStr("postcode",        s(u.postcode,         defs.user.postcode));
  setStr("email",           s(u.email,            defs.user.email));
  setStr("phone",           s(u.phone,            defs.user.phone));
  setStr("guardianName",    s(u.guardianName,     defs.user.guardianName));
  setStr("password",        s(u.password,         defs.user.password));
  setStr("confirmPassword", s(u.confirmPassword,  defs.user.confirmPassword));
  // DOB — fall back to defaults if any part is empty
  const dobDay   = s(u.dobDay,   defs.user.dobDay);
  const dobMonth = s(u.dobMonth, defs.user.dobMonth);
  const dobYear  = s(u.dobYear,  defs.user.dobYear);
  src = src.replace(/(day:\s*)"[^"]*"/, `$1"${dobDay}"`);
  src = src.replace(/(month:\s*)"[^"]*"/, `$1"${dobMonth}"`);
  src = src.replace(/(year:\s*)"[^"]*"/, `$1"${dobYear}"`);
  // ISO and display derived
  const iso = `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`;
  const display = `${dobDay.padStart(2, "0")}/${dobMonth.padStart(2, "0")}/${dobYear}`;
  src = src.replace(/(iso:\s*)"[^"]*"/, `$1"${iso}"`);
  src = src.replace(/(display:\s*)"[^"]*"/, `$1"${display}"`);

  const p = data.payment || {};
  setStr("cardholderName", s(p.cardholderName, defs.payment?.cardholderName));
  setStr("cardNumber",     s(p.cardNumber,     defs.payment?.cardNumber));
  setStr("expiryDate",     s(p.expiryDate,     defs.payment?.expiryDate));
  setStr("securityCode",   s(p.securityCode,   defs.payment?.securityCode));

  const b = data.booking || {};
  setStr("appointmentType", s(b.appointmentType, defs.booking.appointmentType));
  setBool("useNextAvailableSlot", b.useNextAvailableSlot ?? defs.booking.useNextAvailableSlot);
  setStr("preferredMonth", s(b.preferredMonth, defs.booking.preferredMonth));
  setStr("preferredDate",  s(b.preferredDate,  defs.booking.preferredDate));
  setStr("preferredTime",  s(b.preferredTime,  defs.booking.preferredTime));
  setBool("autoMoveToNextDate", b.autoMoveToNextDate ?? defs.booking.autoMoveToNextDate);
  setNum("maxDateAttempts", b.maxDateAttempts ?? defs.booking.maxDateAttempts);

  const d = data.drug || {};
  setStr("strength", s(d.strength, defs.drug?.strength));
  setStr("packSize",  s(d.packSize,  defs.drug?.packSize));

  const c = data.cart || {};
  setStr("quantityAction", s(c.quantityAction, defs.cart?.quantityAction) || "none");
  setNum("quantityClicks", c.quantityClicks ?? defs.cart?.quantityClicks ?? 0);
  setBool("deleteProduct", c.deleteProduct ?? defs.cart?.deleteProduct ?? false);
  setStr("couponCode", s(c.couponCode, defs.cart?.couponCode));
  src = src.replace(/(CART_PREFERENCES[\s\S]*?action:\s*)"[^"]*"/, `$1"${s(c.action, defs.cart?.action) || "Proceed To Checkout"}"`);

  const sh = data.shipping || {};
  setStr("shippingMode",   s(sh.shippingMode,   defs.shipping?.shippingMode)   || "delivery");
  setStr("addressType",    s(sh.addressType,    defs.shipping?.addressType)    || "Home");
  setStr("addressLine1",   s(sh.addressLine1,   defs.shipping?.addressLine1));
  src = src.replace(/(SHIPPING_ADDRESS_PREFERENCES[\s\S]*?addressLine2:\s*)"[^"]*"/, `$1"${s(sh.addressLine2, defs.shipping?.addressLine2)}"`);
  setStr("townCity",       s(sh.townCity,       defs.shipping?.townCity));
  setStr("postalCode",     s(sh.postalCode,     defs.shipping?.postalCode));
  setStr("addressAction",  s(sh.addressAction,  defs.shipping?.addressAction)  || "save");
  setStr("paymentMethod",  s(sh.paymentMethod,  defs.shipping?.paymentMethod)  || "Cash on delivery");

  const ty = data.thankYou || {};
  src = src.replace(/(THANK_YOU_PREFERENCES[\s\S]*?action:\s*)"[^"]*"/, `$1"${s(ty.action, defs.thankYou?.action) || "My Orders"}"`);

  // Active condition — comment out all, uncomment chosen
  const jt = s(data.condition?.journeyType, defs.condition?.journeyType) || "nhs";
  src = src.replace(
    /(ACTIVE_CONDITION\s*=\s*\{[^}]*\})/s,
    (block) => {
      return block
        .replace(/^\s*\/\/\s*(journeyType:\s*"(?:nhs|private|lifestyle)"[^,\n]*),?\s*$/gm, (line) => {
          const m = line.match(/"(nhs|private|lifestyle)"/);
          if (m && m[1] === jt) return line.replace(/^(\s*)\/\/\s*/, "$1");
          return line;
        })
        .replace(/^(\s*)(journeyType:\s*"(?:nhs|private|lifestyle)"[^,\n]*),?(\s*)$/gm, (line, indent, content, trail) => {
          const m = line.match(/"(nhs|private|lifestyle)"/);
          if (m && m[1] !== jt) return `${indent}// ${content},${trail}`;
          return line;
        });
    }
  );

  fs.writeFileSync(TEST_DATA_PATH, src, "utf8");
}

// ── Playwright UI process ─────────────────────────────────────────────────────

const UI_PORT = 8081;
let uiProc = null;
let uiReady = false;

function launchUI() {
  if (uiProc) return { already: true };

  uiReady = false;
  uiProc = spawn(
    "npx",
    ["playwright", "test", "--ui", `--ui-host=127.0.0.1`, `--ui-port=${UI_PORT}`],
    { cwd: __dirname, env: { ...process.env } }
  );

  const onData = (chunk) => {
    const text = chunk.toString();
    if (text.includes("listening") || text.includes(String(UI_PORT)) || text.includes("Listening")) {
      uiReady = true;
    }
  };

  uiProc.stdout.on("data", onData);
  uiProc.stderr.on("data", onData);

  // Give it time to boot even if we miss the log line
  setTimeout(() => { uiReady = true; }, 4000);

  uiProc.on("close", () => {
    uiProc = null;
    uiReady = false;
  });

  return { started: true };
}

function stopUI() {
  if (!uiProc) return { already: true };
  uiProc.kill();
  uiProc = null;
  uiReady = false;
  return { stopped: true };
}

// ── Artifact discovery ───────────────────────────────────────────────────────

function findArtifactsAfter(since) {
  const dir = path.join(__dirname, "test-results");
  const artifacts = { videos: [], traces: [] };
  if (!fs.existsSync(dir)) return artifacts;

  function scan(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= since) {
            const url = "/" + path.relative(__dirname, full).replace(/\\/g, "/");
            if (entry.name.endsWith(".webm")) artifacts.videos.push(url);
            else if (entry.name === "trace.zip") artifacts.traces.push(url);
          }
        } catch (_) {}
      }
    }
  }

  scan(dir);
  return artifacts;
}

function findArtifactsInDir(dir) {
  const artifacts = { videos: [], traces: [] };
  if (!fs.existsSync(dir)) return artifacts;

  function scan(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile()) {
        const url = "/" + path.relative(__dirname, full).replace(/\\/g, "/");
        if (entry.name.endsWith(".webm")) artifacts.videos.push(url);
        else if (entry.name === "trace.zip") artifacts.traces.push(url);
      }
    }
  }

  scan(dir);
  return artifacts;
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/test-data", (req, res) => {
  try {
    res.json(readTestData());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/test-data", (req, res) => {
  try {
    writeTestData(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/flow-configs", (_req, res) => {
  res.json(FLOW_CONFIGS);
});

app.get("/api/pharmacies", (_req, res) => {
  try {
    res.json(readPharmacies());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/tests", async (_req, res) => {
  try {
    const tests = await listTests();
    res.json(tests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE stream for running tests
app.get("/api/run-tests", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type, data) => {
    try {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch (_) {}
  };

  const runId = req.query.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // EventSource auto-reconnects when server closes the stream — prevent restarting a completed run
  if (completedRunIds.has(runId)) {
    send("done", { code: 0, success: true, reconnect: true, passed: "", failed: "", skipped: "", artifacts: { videos: [], traces: [] } });
    res.end();
    return;
  }

  const grep = req.query.grep;
  const project = req.query.project;
  const file = req.query.file;
  const line = req.query.line;
  const label = req.query.label;
  const tdOverridesB64 = req.query.td; // base64 JSON test data overrides from browser
  const parts = [];
  if (project) parts.push(project);
  parts.push(label || (file ? `${file}${line ? ":" + line : ""}` : "all tests"));
  send("start", `Starting Playwright — ${parts.join(" · ")}...`);

  const runStartTime = Date.now();
  lastRunStartTime = runStartTime;

  // Apply test data overrides for this run only (restore originals after playwright exits)
  let originalTDContent = null;
  if (tdOverridesB64) {
    try {
      const overrideData = JSON.parse(Buffer.from(tdOverridesB64, "base64").toString("utf8"));
      originalTDContent = fs.readFileSync(TEST_DATA_PATH, "utf8");
      const firstName = overrideData.user?.firstName;
      if (firstName) send("log", `📋 Test data override: firstName="${firstName}"`);
      writeTestData(overrideData);
    } catch (e) {
      send("log", `⚠ Could not apply test data overrides: ${e.message}`);
    }
  }

  const runOutputDir = path.join(__dirname, "test-results", `run-${runId}`);
  const args = ["playwright", "test", "--reporter=list", `--output=${runOutputDir}`];
  if (project) args.push(`--project=${project}`);
  // Prefer file:line targeting. Also allow grep within a file if no line number.
  if (file) {
    args.push(line ? `${file}:${line}` : file);
    if (grep && !line) args.push("--grep", grep);
  } else if (grep) {
    args.push("--grep", grep);
  }

  const proc = spawn("npx", args, {
    cwd: __dirname,
    env: { ...process.env },
    detached: true, // allows killing the whole process group
  });
  activeProcs.set(runId, { proc, startTime: runStartTime });

  let stdout = "";
  let stderr = "";
  let finished = false;

  // Heartbeat — keeps SSE alive and prevents proxy timeouts
  const heartbeat = setInterval(() => send("ping", null), 15_000);

  // Hard timeout — kill stuck processes after MAX_RUN_MS
  const killTimeout = setTimeout(() => {
    if (!finished) {
      send("log", `⚠ Process timed out after ${MAX_RUN_MS / 60000} minutes — killing.`);
      try { process.kill(-proc.pid, "SIGKILL"); } catch (_) { try { proc.kill("SIGKILL"); } catch (_2) {} }
    }
  }, MAX_RUN_MS);

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    text.split("\n").forEach((line) => {
      if (line.trim()) send("log", line);
    });
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    text.split("\n").forEach((line) => {
      if (line.trim()) send("log", line);
    });
  });

  proc.on("exit", (code) => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    clearTimeout(killTimeout);
    activeProcs.delete(runId);
    completedRunIds.add(runId);
    // Trim completedRunIds to avoid unbounded growth
    if (completedRunIds.size > 500) {
      const [oldest] = completedRunIds;
      completedRunIds.delete(oldest);
    }
    // Force-drain stdio — browser subprocesses can hold pipes open even after playwright exits
    try { proc.stdout.destroy(); } catch (_) {}
    try { proc.stderr.destroy(); } catch (_) {}
    // Restore test-data.ts if we temporarily modified it
    if (originalTDContent) {
      try { fs.writeFileSync(TEST_DATA_PATH, originalTDContent, "utf8"); } catch (_) {}
      originalTDContent = null;
    }
    // Delay scan to allow Playwright to finish flushing .webm video files to disk
    setTimeout(() => {
      const passed = (stdout.match(/\d+ passed/)?.[0] || "").trim();
      const failed = (stdout.match(/\d+ failed/)?.[0] || "").trim();
      const skipped = (stdout.match(/\d+ skipped/)?.[0] || "").trim();
      const artifacts = findArtifactsInDir(runOutputDir);
      send("done", { code, passed, failed, skipped, success: code === 0, artifacts });
      res.end();
    }, 1500);
  });

  req.on("close", () => {
    // Client disconnected — only kill if not already finished
    if (!finished) {
      activeProcs.delete(runId);
      // Restore test-data.ts if we modified it
      if (originalTDContent) {
        try { fs.writeFileSync(TEST_DATA_PATH, originalTDContent, "utf8"); } catch (_) {}
        originalTDContent = null;
      }
      try { process.kill(-proc.pid, "SIGKILL"); } catch (_) { try { proc.kill(); } catch (_2) {} }
    }
    clearInterval(heartbeat);
    clearTimeout(killTimeout);
  });
});

app.get("/api/latest-artifacts", (req, res) => {
  res.json(findArtifactsAfter(lastRunStartTime - 1000));
});

app.post("/api/stop-test", (req, res) => {
  const { runId } = req.body || {};
  if (runId) {
    const entry = activeProcs.get(runId);
    if (!entry) return res.json({ stopped: false, reason: "run not found" });
    try { process.kill(-entry.proc.pid, "SIGKILL"); } catch (_) {
      try { entry.proc.kill("SIGKILL"); } catch (_2) {}
    }
    activeProcs.delete(runId);
    return res.json({ stopped: true });
  }
  // Stop all
  let count = 0;
  for (const [, entry] of activeProcs) {
    try { process.kill(-entry.proc.pid, "SIGKILL"); } catch (_) {
      try { entry.proc.kill("SIGKILL"); } catch (_2) {}
    }
    count++;
  }
  activeProcs.clear();
  res.json({ stopped: count > 0, count });
});

app.post("/api/launch-ui", (req, res) => {
  try {
    writeTestData(req.body);
  } catch (_) {}
  res.json({ ...launchUI(), port: UI_PORT });
});

app.post("/api/stop-ui", (_req, res) => {
  res.json(stopUI());
});

app.get("/api/ui-status", (_req, res) => {
  res.json({ running: !!uiProc, ready: uiReady, port: UI_PORT });
});

app.get("/api/last-result", (req, res) => {
  const lastRun = path.join(__dirname, "test-results/.last-run.json");
  if (fs.existsSync(lastRun)) {
    res.json(JSON.parse(fs.readFileSync(lastRun, "utf8")));
  } else {
    res.json(null);
  }
});

// ── Serve dashboard ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard-public/index.html"));
});

const PORT = 7890;
app.listen(PORT, () => {
  console.log(`\n  Dashboard running at http://localhost:${PORT}\n`);
});
