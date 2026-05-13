// import { test, expect } from "@playwright/test";
// import { TEST_USER } from "../fixtures/test-data";
// import { FLOW_CONFIGS } from "../fixtures/flow-configs";
// import { runConditionFlow } from "../helpers/run-flow";

// /**
//  * Category 0: Journey Flow Permutations.
//  *
//  * Each pharmacy site can route the same condition through different
//  * step orders. Rather than re-implement the whole flow, we re-use
//  * runConditionFlow() (which already follows a detect-and-dispatch loop)
//  * and capture the order in which steps appear.
//  *
//  * The test passes if the recorded sequence ends in a "success" step or
//  * makes monotonic progress through known steps. The recorded sequence
//  * is logged for human review per pharmacy.
//  */

// const KNOWN_STEPS = new Set([
//   "questionnaire_submit",
//   "sign_up",
//   "appointment_booking",
//   "payment",
//   "success",
// ]);

// const probeFlow =
//   FLOW_CONFIGS.find((c) => c.conditionJourneyType === "nhs") ?? FLOW_CONFIGS[0];

// test.describe("Journey Flow Permutations", () => {
//   test(`record step sequence — ${probeFlow.name}`, async ({
//     page,
//     baseURL,
//   }, testInfo) => {
//     const sequence: string[] = [];
//     const originalLog = console.log.bind(console);

//     // run-flow.ts logs lines like:  "→ Detected step: sign_up"
//     console.log = (...args: unknown[]) => {
//       const line = args.map(String).join(" ");
//       const m = line.match(/detected step\s*=\s*"([a-z_]+)"/i);
//       if (m) {
//         const step = m[1];
//         if (sequence[sequence.length - 1] !== step) sequence.push(step);
//       }
//       originalLog(...args);
//     };

//     try {
//       await runConditionFlow(page, probeFlow, TEST_USER, baseURL);
//     } finally {
//       console.log = originalLog;
//     }

//     testInfo.annotations.push({
//       type: "journey-sequence",
//       description: sequence.join(" → ") || "(no steps detected)",
//     });
//     originalLog(`📋 Journey sequence: ${sequence.join(" → ")}`);

//     expect(sequence.length, "at least one known step should be detected").toBeGreaterThan(0);
//     for (const s of sequence) {
//       expect(KNOWN_STEPS.has(s), `unknown step: ${s}`).toBe(true);
//     }
//   });
// });
