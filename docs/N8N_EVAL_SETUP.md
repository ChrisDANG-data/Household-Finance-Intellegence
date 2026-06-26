# n8n Evaluations — Telegram workflow (`Add ledger, Plaid Q&A`)

Use this after the workflow is **Published** on n8n Cloud.

**Daily startup (Postgres, ngrok, app):** [`N8N_STARTUP.md`](./N8N_STARTUP.md).

**New to evaluations?** Start with the minimal importable tutorial (no AI agent):  
[`automation/n8n/eval/EVAL_TUTORIAL.md`](../automation/n8n/eval/EVAL_TUTORIAL.md) — import `eval-echo-tutorial.json` + `eval-echo-dataset.csv`.

**Evaluations tab not working on free/Starter?** Use [`eval-manual-batch.json`](../automation/n8n/eval/eval-manual-batch.json) — batch test without the Evaluations UI. n8n **Starter allows metric-based eval on one workflow only**; **Pro** = unlimited ([docs](https://docs.n8n.io/advanced-ai/evaluations/metric-based-evaluations/)).

## Dataset

Import from:

`automation/n8n/eval/telegram-agent-eval-dataset.csv`

| Column | Meaning |
|--------|---------|
| `message` | Simulated Telegram user text |
| `expected_output` | Short phrase for **String similarity** (no Code node) — must appear in the agent’s **text reply** |
| `should_save` | `true` = ledger row; for your manual review only (not auto-checked without Code) |
| `tool_reference` | Which tool *should* run — **for you / notes only**, not used in n8n expressions |
| `actual_output` / `similarity_score` / `pass_fail` | Filled by **Set outputs** after each run |
| `notes` | Extra context |

### Eval without a Code node

You **cannot** assert `expected_tool` automatically without **Code** or **Return intermediate steps** on the agent. Use this instead:

| Goal | How (no Code) |
|------|----------------|
| Pass/Fail on reply text | **Evaluation → Set metrics → String similarity** |
| Expected text | Column **`expected_output`** (e.g. `Saved:`, `balance`, `checking`) |
| Tool routing audit | Open execution → AI Agent → tool calls; compare to **`tool_reference`** by hand |

**Set metrics** expressions:

| Field | Expression |
|-------|------------|
| Actual answer | `{{ $('AI Agent1').item.json.output }}` |
| Expected answer | `{{ $('When fetching a dataset row1').item.json.expected_output }}` |

If your Google Sheet still uses column name **`should_contain`**, either rename it to **`expected_output`** or point Expected answer to `{{ $json.should_contain }}`.

**Pass threshold:** short `Saved:` alone scores **~0.10–0.17**. Match a **stable prefix** of the reply (e.g. `Saved: income salary` for `Saved: income salary $5,200.00 (monthly, from June 4, 2026).`) — often **~0.35–0.55**. Use **`>= 0.25`** in `pass_fail`; dates in the tail can change every run.

**`tool_reference`** keeps the old `add_ledger_event` / `get_plaid_account_balances` names for documentation — do **not** wire it into Set metrics unless you add a Code node later.

## Tool → API map (must match your workflow HTTP tools)

| Tool name in n8n | Method | URL |
|------------------|--------|-----|
| `add_ledger_event` | POST | `{APP_API_BASE_URL}/api/automation/ledger-event` |
| `ask_financial_question` | POST | `{APP_API_BASE_URL}/api/automation/financial-question` |
| `get_plaid_account_balances` | GET | `{APP_API_BASE_URL}/api/integrations/plaid/accounts?user_id=default&q=...` |
| `sync_plaid_balances` | POST | `{APP_API_BASE_URL}/api/integrations/plaid/sync` |

All automation routes: header `Authorization: Bearer {AUTOMATION_WEBHOOK_TOKEN}` (same as Vercel).

`ask_financial_question` body example:

```json
{
  "message": "<user question>"
}
```

Optional: `user_id` (default `default`), `months`, `forecast_start_month`, `use_llm`.

Response (use **`data.reply` verbatim** — do not recalculate from other fields):

```json
{
  "success": true,
  "data": {
    "reply": "Total income in July 2026: $7,600.00\n\n• salary ...",
    "route": "deterministic_ledger"
  }
}
```

**Telegram agent rule:** After calling `ask_financial_question`, send **`data.reply` exactly** to the user. Never multiply amounts or sum timeline months yourself.

Legacy `/api/scenario-chat` still works for the web UI but returns full timeline JSON — avoid for Telegram tools.

## Visual dashboard (like the YouTube eval tutorials)

Videos such as [n8n AI agent evaluation walkthroughs](https://www.youtube.com/watch?v=tn0C1VlkkQ4) show a **dashboard in the Evaluations tab**: each test case as a row, pass/fail markers, **metrics over time** when you re-run after prompt changes. That is **built into n8n** — you do not need LangSmith or a custom chart in this repo.

Official references:

- [Evaluations overview](https://docs.n8n.io/advanced-ai/evaluations/overview/)
- [Evaluation node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.evaluation/) (`Set Metrics`, `Check If Evaluating`)
- [Production AI playbook — evaluation](https://blog.n8n.io/production-ai-playbook-evaluation-and-monitoring/)

### Architecture (two entry paths, one agent)

```text
[Telegram Trigger] ──production──┐
                                 ├──► [AI Agent + tools] ──► Telegram reply
[Evaluation Trigger] ──eval─────┘              │
                                               └──► [Evaluation: Set Metrics] ──► Evaluations tab charts
```

Production Telegram messages use the **Telegram Trigger**. Eval runs use **Evaluation Trigger** + your CSV/Data Table so real users are not spammed.

### Steps for the visual UI

**A. Dataset (visible table)**

1. n8n → **Data tables** (or Google Sheet) → create table `telegram_eval`.
2. Import `automation/n8n/eval/telegram-agent-eval-dataset.csv` columns: `message`, `expected_tool`, `should_save`, `should_contain`, `notes`.
3. You can open this table in n8n and **see all 10 cases** before running.

**B. Wire the workflow (for metrics + per-row results)**

1. On the **same** workflow **Add ledger, Plaid Q&A**, add an **Evaluation Trigger** node.
   - Source: your data table / eval dataset.
   - Input column: `message`.
2. Connect Evaluation Trigger → the **same input** your AI Agent expects (often a Set node that sets `text` = `{{ $json.message }}`).
3. After the agent (and reply logic), add a branch with **Evaluation** node:
   - **Check if evaluating** — optional; keeps Telegram reply off during eval runs.
   - **Set metrics** — e.g.:
     - `run_ok` = `1` if execution succeeded else `0`
     - `tool_match` = `1` if you add a small Code node comparing last tool name to `expected_tool` from the row
     - `saved` = `1` if HTTP body contains `"status":"saved"` when `should_save` is true
4. **Save** and **Publish** the workflow.

**C. Run and view (the “video” part)**

1. Workflow → **Evaluations** tab.
2. Link dataset → **Run evaluation**.
3. You get:
   - A **table** of 10 runs (which passed / failed)
   - **Metric scores** per run
   - **History** when you run again after changing the system prompt (compare Run #1 vs Run #2)

That is the visualization: it lives in **n8n Cloud**, not in the Household Financial web app.

### Light mode (no Evaluation node yet)

If you only **import CSV** in the Evaluations tab and click **Run** (without Evaluation Trigger / Set Metrics), you still get a **list of executions** per row — less charting, but enough to click into each failed case. Add **Set Metrics** when you want score lines across runs like the tutorials.

---

## Setup in n8n Cloud (≈15 min)

### 1. Environment (instance or workflow)

| Variable | Example |
|----------|---------|
| `APP_API_BASE_URL` | `https://household-financial-web.vercel.app` |
| `AUTOMATION_WEBHOOK_TOKEN` | Same secret as Vercel |

### 2. Create evaluation

1. Open workflow **Add ledger, Plaid Q&A**.
2. Tab **Evaluations** → **Create evaluation** (or **New dataset**).
3. **Import CSV** → select `telegram-agent-eval-dataset.csv`.
4. Map input field **`message`** to the value your Telegram Trigger uses in production  
   (often `{{ $json.message.text }}` — in evals use the CSV `message` column).

### 3. Metrics (minimum)

| Metric | Pass when |
|--------|-----------|
| **Workflow completed** | Execution status = success |
| **No error branch** | No node ends in error |

### 4. Metrics (recommended if your n8n plan supports custom checks)

After a test run, open the execution and verify:

- **Tool routing:** AI Agent called the tool matching `expected_tool` (check agent/tool call log).
- **Ledger writes:** For `should_save=true`, HTTP response JSON includes `"status":"saved"` (not `"preview"`).
- **No wrong writes:** For `should_save=false`, `add_ledger_event` must **not** be the tool used.

If custom expressions are available, point them at the last HTTP node body, e.g.:

```javascript
{{ $json.data?.status === 'saved' }}
```

(Adjust path to match your **Parse JSON** / **HTTP Request** node output.)

### 5. Run

1. **Save** evaluation.
2. **Run all** against the **published** workflow version.
3. Target: **≥ 8/10** pass on routing; fix **system prompt** if Plaid questions call `add_ledger_event`.

## System prompt snippets (routing)

Add or reinforce in your AI Agent system message:

```text
- add / record / log / create + amount → add_ledger_event only
- bank / Plaid / credit card / checking balance → get_plaid_account_balances only (never add_ledger_event)
- total expenses / insurance / forecast / afford → ask_financial_question only (read-only)
- sync balances / refresh bank → sync_plaid_balances only
```

## Vitest (same week — repo CI)

```bash
cd apps/web
npx vitest run services/document-intelligence/extraction/__tests__/installment-schedule.parser.test.ts
npx vitest run services/scenario-chat/__tests__/scenario-chat.test.ts
```

Add projection tests for insurance one_time schedule when ready.

## What “pass” looks like for demo

- **n8n Eval:** 8–10/10 routing + no failed executions.
- **Telegram manual:** One write (`add expense …`) → appears on Vercel **Ledger → Recorded events**.
- **Vitest:** Installment parser returns 6 rows for mock schedule text.

## Eval-only branch (fix Telegram errors + tool usage)

When the dataset runs, **Telegram Trigger does not execute**. Customize the flow after **AI Agent1**:

```text
AI Agent1
  → IF / Evaluation "Check if evaluating"
       ├─ evaluating? → Set Metrics (no Telegram)
       └─ production? → Send a text message1
```

### 1. Fix prompt typo

In **AI Agent1** → Prompt (User Message) must be exactly:

```text
{{ $json.chatInput }}
```

Not `chatInpu` (your screenshot shows a typo — agent may get wrong/empty context).

**Edit Fields2** (sheet path) must set field name **`chatInput`** = `{{ $json.message }}`.

### 2. Do not require month for `add expense`

Your API already defaults: no `month` → **monthly**, `start_date` = today (`ledger-event.service.ts`).

Add to the agent **system message**:

```text
When the user says add/record/log expense or income with amount and category:
- Call add_ledger_event immediately.
- Do NOT ask which month unless they explicitly mention a past/future month.
- Omit month → monthly from today; include month in message → one_time for that month.
Example: "add expense grocery 85" → kind expense, category grocery, amount 85, no month field.
```

### 3. Skip Telegram on eval runs

Error `Node 'Telegram Trigger' hasn't been executed` on **Send a text message1** is expected if that node references Telegram trigger data.

**Fix:** Before **Send a text message1**, add **IF** or **Evaluation → Check if evaluating**:

| Branch | Next node |
|--------|-----------|
| Is evaluation run | **Set Metrics** (done) |
| Else | **Send a text message1** |

In **Send a text message1**, use only agent output, e.g. `{{ $json.output }}` — not `{{ $('Telegram Trigger').item... }}`.

### 4. Why "None of your tools were used"

The model asked a clarifying question instead of calling **add_ledger_event**. After system prompt fix + `chatInput` fix, re-run one row: `add expense grocery 85` → tool should fire → HTTP `status: saved`.

---

## String similarity → Pass/Fail → write back to Google Sheet

**You do not need an IF node.** n8n can write Pass/Fail with an expression in **Set outputs**.

### Sheet columns (Google Sheet — align with CSV)

| Column | Who fills it |
|--------|----------------|
| `message` | You (input) |
| `expected_output` | You — phrases that appear in agent **text** (`Saved:`, `balance`, …) |
| `tool_reference` | You — optional; old `expected_tool` names for manual tool audit |
| `should_save` | You — optional reminder for ledger writes |
| `actual_output` | n8n (Set outputs) |
| `similarity_score` | n8n (Set metrics) |
| `pass_fail` | n8n (expression) |

Re-import or copy from: `automation/n8n/eval/telegram-agent-eval-dataset.csv`  
Remove or ignore legacy **`expected_tool`** / **`should_contain`** columns if you still have them — use **`expected_output`** for Set metrics.

Updated template: `automation/n8n/eval/telegram-agent-eval-dataset.csv`

### Workflow tail (Evaluation branch)

```text
AI Agent1
  → Evaluation (checkIfEvaluating)
       ├─ Evaluation → Set metrics (String similarity)
       └─ Evaluation → Set outputs (write to Sheet)
       └─ Normal → Send Telegram
```

You can use **one** Evaluation node with both operations, or two Evaluation nodes in sequence.

### 1) Set metrics — String similarity

| Field | Expression |
|-------|------------|
| **Actual answer** | `{{ $('AI Agent1').item.json.output }}` |
| **Expected answer** | `{{ $('When fetching a dataset row1').item.json.expected_output }}` |

Metric type: **String similarity** (score 0–1).  
This fills the **Evaluations tab** dashboard (charts / history). No IF required.

**Pass threshold:** use ledger prefixes like `Saved: income salary`; start **`>= 0.25`** in `pass_fail` (see dataset CSV).

### 2) Set outputs — write back to the same Sheet

Operation: **Set outputs**  
Same spreadsheet + tab as the dataset.

| Sheet column | Expression |
|--------------|------------|
| `actual_output` | `{{ $('AI Agent1').item.json.output }}` |
| `similarity_score` | `{{ $json.score }}` — if empty, try `{{ $json.stringSimilarity }}` or open one execution JSON and copy the metric field name |
| `pass_fail` | See below |

**Pass/Fail without IF** — use Expression on `pass_fail`:

```text
{{ ($json.score ?? $json.stringSimilarity ?? 0) >= 0.25 ? 'Pass' : 'Fail' }}
```

Replace `0.25` with your threshold after you see real scores.

If the score lives only on the Set metrics node output, reference it:

```text
{{ ($('Evaluation').item.json.score ?? 0) >= 0.25 ? 'Pass' : 'Fail' }}
```

(Use the **exact node name** of your Set metrics node.)

### 3) Run

1. **Publish** workflow.  
2. **Evaluations** tab → **Run all**.  
3. Open Google Sheet — `actual_output`, `similarity_score`, `pass_fail` should fill per row.

### When to use IF instead

Only if you need **different nodes** after pass vs fail (e.g. send email on Fail). For labeling rows in the sheet, **Set outputs expression is enough**.

---

## “Run Test” — no reaction on the canvas

**Expected:** Clicking **Run Test** in the **Evaluations** tab usually does **not** light up nodes in the **Editor**. The run happens in the background. That is normal.

**Where to look instead (within ~10 s):**

1. Tab **Executions** (same workflow) — a new row should appear (Running → Success/Error/Cancelled).
2. **Evaluations** → open the new run (#10, …) — Test #1 should move past “Canoodling…” if the workflow finishes.

If **Executions** stays empty after **Run Test**, the eval runner never started the workflow. Use the checklist below.

### Checklist (nothing starts)

| # | Check | Fix |
|---|--------|-----|
| 1 | **Publish** button has a **yellow** dot | **Save** workflow → click **Publish** until green **Published** with **no** yellow. Run Test always uses the **last published** graph, not unsaved Editor changes. |
| 2 | Canvas has **When fetching a dataset row** (or **Evaluation Trigger**) | Add from **Evaluations** setup or insert the node; connect it → **Edit Fields** (`chatInput` = `{{ $json.message }}`) → **AI Agent**. |
| 3 | Evaluations dataset = same source as that node | Sheet **“n8n test” / Sheet1** must match the node’s document + sheet. |
| 4 | **Evaluation** node with operation **Set metrics** at end of eval path | Without it, runs fail with *No “Set metrics” node executed* and look like “nothing worked”. |
| 5 | **Select metric** in Evaluations chart | Pick the metric from your Set metrics node (e.g. String similarity); empty chart = no successful run yet. |
| 6 | Eval branch does not go through **Merge (wait for all)** | See [Stuck on “Canoodling…”](#stuck-on-canoodling--running-forever-no-results) — bypass Merge for the sheet branch. |
| 7 | Telegram path disabled for eval | After agent: **Check if evaluating** → **Set metrics** only; no **Send a text message** on eval branch. |

### Smoke test (prove the runner works)

1. **Editor:** temporarily wire only  
   `When fetching a dataset row` → **Edit Fields** → **AI Agent** → **Evaluation (Set metrics)**.  
2. **Publish.**  
3. Sheet with **1 row** (`add expense grocery 85`).  
4. **Run Test.**  
5. **Executions** must show **one** new execution.  
6. Re-attach Merge/Telegram/Set outputs when that works.

### Your screenshot (all runs **Cancelled**)

Cancelled runs mean the run was **stopped** (Cancel button or hung Test #1 then cancelled). They do **not** prove Run Test is broken — fix **Publish** + **Executions** visibility first, then re-run.

---

## Run all rows in the dataset

| What you clicked | What happens |
|------------------|--------------|
| **Execute step** on *When fetching a dataset row* | **One row only** (preview). `_rowsLeft: 7` is normal — it is not stuck; the next rows run only in a full eval. |
| **Execute workflow** on the canvas | Production path or a **single** manual run — **not** all eval rows. |
| **Evaluations** tab → **Run all** (or **Run evaluation**) | **All rows**, one execution per row, **in sequence**. This is the only button that runs the full sheet. |

Checklist before **Run all**:

1. Workflow is **Published** (green dot).
2. Evaluations tab → evaluation is linked to the **same** Google Sheet / dataset as *When fetching a dataset row*.
3. **Limit rows** on the dataset node is **OFF** (your screenshot is correct).
4. On the dataset node **Settings** tab: **Execute Once** = **OFF** (if present).

Rows run **one after another**. Test #2 stays queued until Test #1’s execution **finishes successfully**. If Test #1 never finishes, the whole run stays **Running** forever.

---

## Stuck on “Canoodling…” / Running forever, no results

This means **Test #1’s execution never completed** (n8n is still waiting inside the workflow). Test #2 will not start until Test #1 ends.

### 1. Confirm where it hangs (2 minutes)

1. **Cancel** the eval run (button on Test #2 in the Evaluations UI).
2. Open tab **Executions** (not Evaluations).
3. Open the **latest** execution for this workflow — status is often still **Running** or **Waiting**.
4. Click nodes left → right until one stays **gray / spinning**. That node is the blocker.

### 2. Most common fix: **Merge** waits for Telegram/voice

Many Telegram bots use:

```text
[Telegram Trigger] ──┐
[Voice / download] ──┼──► [Merge] ──► [Edit Fields] ──► [AI Agent]
[When fetching a dataset row] ──┘   (eval only uses this branch)
```

If **Merge** mode is **Combine** / **Wait for all inputs**, it **waits forever** in eval because Telegram and voice **never run**. The eval stays on “Canoodling…” with no metric output.

**Fix (pick one):**

| Option | Action |
|--------|--------|
| **A — Bypass Merge for eval** | Connect *When fetching a dataset row* → **Edit Fields** (`chatInput` = `{{ $json.message }}`) → **AI Agent**, **not** into Merge. Keep Telegram → Merge → agent for production only. |
| **B — Change Merge mode** | Set Merge to **Append** (or **Pass-through** / single branch), so one input is enough to continue. |
| **C — Second Merge input** | Do **not** use Combine with only the sheet branch connected during eval. |

After rewiring: **Save** → **Publish** → **Run all** again.

### 3. Eval path must **end** at Evaluation nodes (no Telegram)

```text
When fetching a dataset row
  → Edit Fields (chatInput = message)
  → AI Agent1
  → Evaluation: Check if evaluating → TRUE
       → Evaluation: Set metrics (String similarity)
       → Evaluation: Set outputs (optional; see below)
```

**Do not** leave the eval branch going to **Send a text message** or anything that references `$('Telegram Trigger')` — that can error or hang waiting for trigger data.

### 4. Temporarily simplify to unblock

To prove the eval runner works:

1. **Disconnect** *Evaluation → Set outputs* (Google Sheet write-back) for one run.
2. Keep only **Set metrics** after the agent.
3. **Run all** with a **2-row** sheet (first row: `add expense grocery 85`).
4. When Test #1 and #2 complete, reconnect **Set outputs**.

If it only hangs when Set outputs is on: check Google Sheets credential, same spreadsheet ID, and that the sheet is not locked by another process.

### 5. Slow but should still finish: HTTP tools + LLM

| Node | Typical duration | If it “never” ends |
|------|------------------|-------------------|
| `add_ledger_event` | &lt; 5 s | Wrong `APP_API_BASE_URL` / token → fix env, **Publish** |
| `ask_financial_question` | 10–60 s | Vercel `maxDuration` 60 s; set HTTP Request **Timeout** ≥ 90000 ms in n8n |
| AI Agent (Gemini) | 5–30 s | Tool loop or model hang → lower max iterations; test with one ledger row |

In the stuck **Execution**, open **AI Agent1** → see if a tool HTTP node is still running.

### 6. Cancel zombie runs

- Evaluations → **Cancel** on the run.
- If executions pile up: **Executions** → stop/delete old **Running** ones, then **Publish** again and **Run all**.

### 7. Minimal “green path” test

| Step | Check |
|------|--------|
| Publish | Green **Published** on workflow |
| Sheet | Header row + data rows; `message` column filled |
| Wire | Dataset → Edit Fields → Agent → Set metrics (no Merge, no Telegram) |
| Run | **Evaluations** → **Run all** |
| Result | Executions show **Success**; Evaluations shows scores per test |

Restore Merge/Telegram/Set outputs once this passes.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Only row 1 / Execute step shows `_rowsLeft` | Use **Evaluations → Run all**, not **Execute step** |
| **Running** forever, “Canoodling…” | **Merge** waiting for Telegram; or Telegram node on eval path; cancel run, check **Executions** |
| Test #2 never starts | Test #1 did not finish — fix hang above |
| All evals fail instantly | Workflow not **Published** |
| `UNAUTHORIZED` on HTTP | Token mismatch Vercel ↔ n8n |
| Q&A always wrong tool | Tighten system prompt; rename tools to match table above |
| `ask_financial_question` 400 | Body missing `user_id` / `current_cash` / `events: []` |
| Saves when should not | Remove “always confirm save” from wrong tool |
| Telegram Trigger hasn't been executed | Eval path: skip Send message; fix chatInput typo |
| Agent asks for month on simple add | System prompt: call tool without month |
| **Run Test**, Editor unchanged | Normal — check **Executions** tab; **Publish** first if yellow dot |
| **Executions** empty after Run Test | Missing dataset trigger node, not **Published**, or no **Set metrics** node |
| Chart empty / no metric | **Select metric** dropdown; complete a successful run first |
