# Pharmacy E2E Automation — User Guide

**Purpose:** Step-by-step instructions for running automated patient journey tests using the Playwright Test Dashboard
**Last updated:** June 2026

---

## What Is This App?

The Playwright Test Dashboard is a web-based tool that automatically tests patient journeys on Healthya pharmacy websites — from clicking "Get Started", through answering questionnaire questions, all the way to booking an appointment or completing a payment.

You do not need to write any code. Everything is done through a simple point-and-click interface in your web browser.

---

## Before You Start

### 1. Make sure the server is running

The dashboard runs locally on your computer. Before opening it, someone technical needs to have started the server by running the following command in their terminal:

```
npm run dashboard
```

You will know it is ready when the terminal shows:

```
Dashboard running at http://localhost:5002
```

Leave that terminal window open the entire time you are using the dashboard. If you close it, the app will stop working.

### 2. Open the dashboard

Open any web browser (Chrome recommended) and go to:

```
http://localhost:5002
```

You should see a dark header bar with the 🎭 logo and the title **Playwright Runner**.

---

## The Dashboard at a Glance

```
┌────────────────────────────────────────────────────────────────────┐
│  🎭 Playwright Runner  [Pharmacy ▾]  [Branch ▾]   ▶ Run All  ■ Stop  ☀️ │  ← Header
├────────────────────────────────────────────────────────────────────┤
│  ● Select a pharmacy to load tests                                 │  ← Status bar
├──────────────────────┬─────────────────────────────────────────────┤
│                      │  🖥  Video player                           │
│  🔍 Search test cases│                                             │
│                      ├─────────────────────────────────────────────┤
│  Functional Test     │  Output │ Artifacts │ Results │ ⚙ Test Data │
│  Cases               │                                             │
│  (left sidebar)      │  (log output / video / settings appear here)│
└──────────────────────┴─────────────────────────────────────────────┘
```

| Area | What it does |
|---|---|
| Header | Select a pharmacy and branch, run all tests, stop a run, toggle dark/light mode |
| Status bar | Shows what is happening right now — idle, running, and pass/fail/skip counts |
| Left sidebar | Search box and the full list of available automated tests, grouped by journey type |
| Video player | Plays back a recording of the browser session from the last test that ran |
| Output tab | Shows the live step-by-step log as a test runs |
| Artifacts tab | Stores videos and traces after each run |
| Results tab | Browse and delete past test result folders |
| ⚙ Test Data tab | Where you configure the patient details, payment card, shipping, and appointment settings |

---

## Step-by-Step: Running Your First Test

### Step 1 — Select a Pharmacy

At the top-left of the header, click the **pharmacy dropdown** (it will say "Loading pharmacies…" briefly, then show the available sites).

The three available pharmacies are:

| Pharmacy | Website |
|---|---|
| The Pharmacist | thepharmacist.healthya.co.uk |
| Pharmaease | pharmaease.healthya.co.uk |
| Paydens | paydens-pharmacy.healthya.co.uk |

Once you select a pharmacy, the sidebar will load all the available tests for that site. The status bar will confirm: **Loading tests for [pharmacy name]…**

### Step 2 — Select a Branch (if applicable)

Some pharmacies have multiple physical locations. If the selected pharmacy has branches, a second dropdown will appear in the header next to the pharmacy selector, showing **⛶** and the branch name.

Click it to choose which branch location you want to test. The test list will update to show conditions relevant to that branch.

If no branch dropdown appears, the pharmacy has only one location and you can skip this step.

### Step 3 — Choose Which Test to Run

In the left sidebar you will see tests grouped into categories (called Journey types). Click any category header to expand it and see the tests inside.

**To run a single test:**
1. Hover over the test name in the sidebar
2. A small **▶** (play) button will appear on the right side of the row
3. Click it to start that test

**To run all tests for a journey group:**
1. Hover over the journey group header (e.g. "NHS", "LIFESTYLE")
2. A **▶ Run** button will appear on the right side of that header row
3. Click it to queue and run every test in that group one after another

**To run every test for the selected pharmacy:**
- Click the **▶ Run All** button in the top-right of the header

**To find a specific test quickly:**
- Use the 🔍 **Search test cases** box at the top of the sidebar — type a condition name (e.g. "shingles", "weight") and the list will filter instantly

### Step 4 — Configure Test Data (First Time Only)

Before running tests, check that the patient details are set up correctly. Click the **⚙ Test Data** tab in the bottom panel.

You will see four collapsible sections — click any section header to expand it.

---

#### 👤 User Info

This is the fictional patient the tool uses to fill in forms.

| Field | Example value | Notes |
|---|---|---|
| First Name | John | Used in all sign-up forms |
| Last Name | Smith | Used in all sign-up forms |
| Email | lloyd.p2@yopmail.com | Does not need to be a real inbox |
| Phone | 447467059973 | UK format — no spaces or + sign |
| Country | United Kingdom | Select from the dropdown |
| Postcode | SW1A 1AA | Must be a valid UK postcode format |
| Gender | Male | Male or Female |
| Guardian Name | Tonny Stark | Used only in specific flows |
| DOB Day | 01 | Two digits (e.g. 01, 15) |
| DOB Month | 01 | Two digits (e.g. 01, 06) |
| DOB Year | 1990 | Four digits (e.g. 1990) |
| Password | Test@1234 | Used when creating a new account |
| Confirm Password | Test@1234 | Must match Password |

**NHS toggle:** If you are running an NHS journey, click the **NHS** toggle switch at the top-right of the User Info section header. It will highlight all NHS-required fields with a blue border, making it clear which fields are important for that flow.

**Contact Recovery:** If you want to test the flow where a patient uses a different email or phone for their appointment, tick the **"Trigger I'm no longer using this number or email flow"** checkbox. Extra fields will appear for the new phone number, confirmation phone number, new email address, and confirmation email address.

---

#### 💳 Payment Card

The tool uses a test payment card — it does not charge real money. Fill in these fields to use a custom card, or leave them empty to use the system defaults.

| Field | Default value |
|---|---|
| Cardholder Name | Jhon Smith |
| Card Number | 5555 5555 5555 4444 |
| Expiry Date (MM/YY) | 01/32 |
| Security Code | 123 |

> These are test card numbers provided by the payment processor for testing purposes. No real transaction takes place.

---

#### 🚚 Shipping

Used for lifestyle journeys (e.g. Erectile Dysfunction) where a physical medication is ordered and shipped.

| Field | Options | What it means |
|---|---|---|
| Shipping Mode | Delivery, Pharmacy | Whether the medication is delivered to an address or collected from a pharmacy |
| Address Type | Home, Work, Other | Label for the saved address |
| Address Line 1 | 221B Baker Street | Street address |
| Address Line 2 | (optional) | Flat number, building name, etc. |
| Town / City | London | |
| Postal Code | SW1A 1AA | |
| Address Action | Save, Cancel | Whether to save the address or cancel |
| Payment Method | Cash on Delivery, Credit Card | How the order is paid for |

---

#### 📅 Appointment

Controls how the tool books an appointment slot.

| Field | Options | What it means |
|---|---|---|
| Session Type | Video, In-Person, Phone Call | The type of consultation to book |

> After filling in any of the above sections, your settings are saved automatically in your browser. They will still be there the next time you open the dashboard.

---

### Step 5 — Watch the Test Run

Once a test starts, several things happen at once:

- The **status bar** turns blue and shows **Running…** with a pulsing dot
- The **video player** shows a near-live recording of what the browser is doing
- The **Output tab** fills with a step-by-step log of every action

Typical steps you will see in the Output log:

```
✔ Direct patient flow start URL: https://...
✔ Cookie consent dismissed (Accept All)
✔ Landing page detected with journey: Sign Up -> Questionnaire -> Booking — clicking Get Started
→ Handling questionnaire step
→ Handling sign-up step
→ Handling booking step
✔ Booking success state reached!
```

The URL bar above the video updates as the browser moves between pages — you can follow along exactly where the automation is at each moment.

A **Runs** panel will also appear at the bottom of the left sidebar, listing every active and recently completed run. Click any run card to switch the video and log output to that run.

---

### Step 6 — Read the Result

When the test finishes, the status bar updates:

| Status colour | Meaning |
|---|---|
| 🟢 Green | Test passed — the patient journey completed successfully |
| 🔴 Red | Test failed — something went wrong during the journey |
| 🟡 Yellow | Test skipped — the run was skipped or had no valid starting point |

The pass / fail / skip counts are shown at the right end of the status bar.

---

## Understanding Test Outcomes

### When a journey completes successfully ✅

The test log will show one of these messages:

| Log message | What it means |
|---|---|
| `✔ Booking success state reached!` | An appointment was booked — consultation journey complete |
| `✔ Thank-you page detected! Journey completed successfully.` | A medication order was placed — lifestyle journey complete |
| `✔ Payment completed — ending test flow` | Payment step finished and the flow closed |

Nothing further is needed.

### When a journey reaches a dead-end ⏹

A dead-end is not always an error — it means the questionnaire answers led to a clinical outcome other than booking. The tool handles this gracefully.

| Log message | What it means |
|---|---|
| `✔ Dead-end terminal state reached — ending flow gracefully` | The questionnaire routed to self-care, GP referral, or an ineligible result |
| `✔ Flow intentionally ended via End Assessment` | An NHS 111 emergency popup was detected and the assessment was stopped safely |
| `✔ Gender-specific ineligibility popup detected` | The condition is not available for the patient's gender — the tool clicked "Back to Home" |

These outcomes are expected for certain conditions and certain questionnaire answers. They are not failures.

### When a test fails ❌

Click the failed run in the **Runs** section of the left sidebar. Then:

1. **Watch the video** — the recording shows exactly where the browser stopped
2. **Read the Output tab** — the last few lines will describe the error
3. **Check the Artifacts tab** — a screenshot of the failure moment is saved there

**Common failure reasons:**

| What you see in the log | What it likely means |
|---|---|
| `⚠ Stuck: step "questionnaire_submit" visited 6 times` | The questionnaire got into a loop. Report the condition name to the development team. |
| `⚠ Unknown step at URL: … — stopping loop` | The browser landed on a page the tool did not recognise. Try running the test again. |
| `net::ERR_NAME_NOT_RESOLVED` | The pharmacy website URL is wrong or the site is temporarily down. |
| `Timeout exceeded` | The page took too long to load. Could be a slow connection or a site issue. |

**What to do when a test fails:** If the same test fails consistently, take a screenshot of the Output tab and report it to the development team along with the condition name and the pharmacy you were testing.

---

## Journey Types — What the Tool Tests

The sidebar groups tests into the following journey types. Click a group header to expand it.

| Journey type | What it tests |
|---|---|
| **SEO HEALTH** | Checks that the pharmacy sitemap and key pages are accessible |
| **NHS** | NHS-funded journeys: Sign-up → Questionnaire → Appointment booking (free) |
| **PRIVATE** | Private-pay journeys: Questionnaire → Sign-up → Appointment → Payment |
| **LIFESTYLE** | Lifestyle medication journeys: Drug selection → Cart → Shipping → Payment |
| **ELIGIBILITY** | Validates eligibility-check screens and rules |
| **USER JOURNEY** | End-to-end user flow permutations (labelled F1, F2, etc.) |
| **BOOKING** | Specific appointment booking scenarios (labelled B1, B2, etc.) |
| **PAYMENT** | Payment flow scenarios (labelled P1, P2, etc.) |
| **CONDITION RULES** | Questionnaire rule-logic validation for specific conditions (labelled CR1, CR2, etc.) |
| **ALL CONDITIONS** | Bulk run across every supported condition for a pharmacy |

Hover over the small **ⓘ** icon on any test row to read a description of what that specific test case validates.

---

## The Artifacts Tab — Finding Videos and Traces

After any test run, click the **Artifacts** tab to find:

**📹 Videos**
A full recording of the browser session. Click the filename to play it in the video player above. Use the **‹** and **›** arrows in the video overlay to navigate between multiple recordings.

**🔍 Traces**
A detailed trace file that records every action, screenshot, and network request frame-by-frame. This is mainly used by developers for in-depth debugging. You do not need to open these unless someone from the development team asks you to.

---

## The Results Tab — Browsing Past Runs

Click the **Results** tab to see a list of all saved test result folders on your computer.

- Tick the checkbox next to one or more results, then click **Delete selected** to clean up old runs
- Tick **Select all** to select every result at once
- Click **Refresh** to update the list if new results have just finished saving

---

## The Output Tab — Live Log

The **Output** tab shows a colour-coded step-by-step log of everything the automation is doing:

| Colour | Meaning |
|---|---|
| Blue (italic) | Test starting — initial information |
| Green | Successful step |
| Red | Error or failure |
| Yellow/Amber | Warning or skipped step |

This is the most useful tab for understanding what happened when a test fails.

---

## Stopping a Test Mid-Run

If you need to stop a test that is currently running:

- Click the **■ Stop** button in the top-right corner of the header

The button is only visible while a test is actively running. After you click Stop, the run will be marked as stopped and the video will be saved.

---

## Frequently Asked Questions

**Q: The dashboard page will not open. What do I do?**
A: The server is not running. Ask a developer to run `npm run dashboard` in the project folder. Leave that terminal window open.

**Q: I selected a pharmacy but no tests appeared in the sidebar.**
A: Wait a few seconds — the dashboard is loading the test list. If it still shows empty after 10 seconds, try refreshing the page (F5) and selecting the pharmacy again.

**Q: A branch dropdown appeared but I am not sure which branch to pick.**
A: Choose the branch that matches the patient link or the location you are testing. If you are not sure, ask the person who gave you the task.

**Q: A cookie consent popup appeared and the test stopped.**
A: Cookie consent is now handled automatically — the tool clicks "Accept All" whenever it appears. If you see `✔ Cookie consent dismissed (Accept All)` in the log, it was handled correctly. If the test still stopped, the issue is something else — check the Output tab for the next error.

**Q: The video player shows a black screen.**
A: The test may still be processing the video. Wait 10–15 seconds and click **Refresh** in the Results tab. If it remains blank, check the Artifacts tab for a video file you can download and play locally.

**Q: The test ran but chose the wrong appointment type (e.g. Phone Call instead of Video).**
A: Go to **⚙ Test Data → 📅 Appointment** and change the **Session Type** to your preference. Settings are saved automatically when you click away from the field.

**Q: The test keeps saying "Stuck: step visited 6 times".**
A: The tool got into a loop — usually at the questionnaire. This typically means the questionnaire has an unexpected new question or screen. Report the condition name and the Output log to the development team.

**Q: Can I run multiple tests one after another automatically?**
A: Yes. Click **▶ Run All** in the header to queue and run every visible test. You can also hover over a journey group header (e.g. "LIFESTYLE") and click the **▶ Run** button that appears to run only that group.

**Q: How do I switch between dark mode and light mode?**
A: Click the **☀️ / 🌙** button in the top-right corner of the header.

**Q: What happens if I close the browser while a test is running?**
A: The test will continue running in the background (the server keeps it going). Re-open the dashboard at http://localhost:5002 to see the results. To stop a running test, click **■ Stop** in the header before closing.

**Q: Nothing happens when I click ▶ Run All.**
A: Make sure you have selected a pharmacy first. The Run All button is disabled until a pharmacy is chosen and its tests have loaded.

---

## Quick Reference Card

| I want to… | I should… |
|---|---|
| Run a single test | Find it in the sidebar → hover → click ▶ |
| Run all tests in a group | Hover over the group header → click ▶ Run |
| Run every test for a pharmacy | Select pharmacy → click ▶ Run All in header |
| Stop a test mid-run | Click ■ Stop in the header |
| Change patient details | Click ⚙ Test Data → expand 👤 User Info → edit fields |
| Change appointment type | Click ⚙ Test Data → expand 📅 Appointment → choose Session Type |
| Change payment card | Click ⚙ Test Data → expand 💳 Payment Card → edit fields |
| Change shipping address | Click ⚙ Test Data → expand 🚚 Shipping → edit fields |
| Watch what the test did | Look at the Video player or click Artifacts tab |
| See why a test failed | Check Output tab or Artifacts tab |
| Switch to dark / light mode | Click ☀️ / 🌙 in the header |
| Clean up old results | Click Results tab → tick checkboxes → Delete selected |
| Search for a specific test | Type the condition name in the 🔍 Search box in the sidebar |

---

> **For technical issues or to report a bug**, contact the development team with a screenshot of the Output tab, the condition or pharmacy you were testing, and a description of what you expected to happen versus what actually happened.
