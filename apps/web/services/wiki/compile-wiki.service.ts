import { prisma } from "@/lib/prisma";
import { formatDateIso, formatLocalDateIso } from "@/services/financial-state/dates";
import { wikiLink, wikiSlug } from "@/services/wiki/wiki-slug";

export interface WikiFile {
  /** Relative path inside the vault, e.g. Documents/abc.md */
  path: string;
  content: string;
}

export interface WikiCompileResult {
  files: WikiFile[];
  pageCount: number;
  documentCount: number;
  categoryCount: number;
  eventCount: number;
}

const USER_ID = "default";
const EXCERPT_CHARS = 600;
/** App-generated financial wiki lives under this folder in the Obsidian vault. */
export const HOUSEHOLD_WIKI_ROOT = "Household";

function householdPath(relativePath: string): string {
  return `${HOUSEHOLD_WIKI_ROOT}/${relativePath}`;
}

function householdLink(relativePath: string): string {
  return wikiLink(householdPath(relativePath));
}

function formatMoney(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return formatDateIso(d);
}

function formatUploadedDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return formatLocalDateIso(d);
}

function excerpt(text: string, max = EXCERPT_CHARS): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function categoryNotePath(category: string): string {
  return householdPath(`Categories/${wikiSlug(category)}`);
}

function documentNotePath(documentId: string): string {
  return householdPath(`Documents/${documentId}`);
}

function eventNotePath(eventId: string): string {
  return householdPath(`Events/${eventId}`);
}

function buildIndexPage(input: {
  documentLinks: string[];
  categoryLinks: string[];
  eventCount: number;
  currentCash: number | null;
}): WikiFile {
  const lines = [
    "# Household Financial Wiki",
    "",
    "Compiled from FinIntel uploads and ledger events. Open **Graph view** in Obsidian to explore links.",
    "",
    "## Hub",
    `- ${householdLink("Ledger/Overview")}`,
    `- ${householdLink("Ledger/Events")}`,
    "",
    "## Documents",
    ...input.documentLinks.map((link) => `- ${link}`),
    "",
    "## Categories",
    ...input.categoryLinks.map((link) => `- ${link}`),
    "",
    "## Stats",
    `- Documents: ${input.documentLinks.length}`,
    `- Categories: ${input.categoryLinks.length}`,
    `- Ledger events: ${input.eventCount}`,
  ];

  if (input.currentCash != null) {
    lines.push(`- Current cash: ${formatMoney(input.currentCash)}`);
  }

  return {
    path: householdPath("Household Index.md"),
    content: `${lines.join("\n")}\n`,
  };
}

function buildOverviewPage(input: {
  currentCash: number | null;
  monthlyIncome: number | null;
  eventCount: number;
  obligationCount: number;
  documentCount: number;
}): WikiFile {
  const lines = [
    "# Ledger overview",
    "",
    `Back to ${householdLink("Household Index")}.`,
    "",
    "## Balances",
    `- Current cash: ${input.currentCash != null ? formatMoney(input.currentCash) : "—"}`,
    `- Monthly income (state): ${input.monthlyIncome != null ? formatMoney(input.monthlyIncome) : "—"}`,
    "",
    "## Counts",
    `- Documents: ${input.documentCount}`,
    `- Ledger events: ${input.eventCount}`,
    `- Extracted obligations (unconfirmed): ${input.obligationCount}`,
    "",
    `See ${householdLink("Ledger/Events")} for itemized events.`,
  ];

  return {
    path: householdPath("Ledger/Overview.md"),
    content: `${lines.join("\n")}\n`,
  };
}

function buildEventsIndexPage(eventLinks: string[]): WikiFile {
  const lines = [
    "# Ledger events",
    "",
    `Back to ${householdLink("Household Index")} · ${householdLink("Ledger/Overview")}`,
    "",
    ...eventLinks.map((link) => `- ${link}`),
  ];

  if (eventLinks.length === 0) {
    lines.push("", "_No ledger events yet._");
  }

  return {
    path: householdPath("Ledger/Events.md"),
    content: `${lines.join("\n")}\n`,
  };
}

function buildDocumentPage(input: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: string;
  createdAt: Date;
  extractedText: string | null;
  categories: string[];
  eventIds: string[];
}): WikiFile {
  const lines = [
    `# ${input.filename}`,
    "",
    `Back to ${householdLink("Household Index")}.`,
    "",
    "## Metadata",
    `- ID: \`${input.id}\``,
    `- Type: ${input.mimeType}`,
    `- Size: ${input.sizeBytes.toLocaleString()} bytes`,
    `- Uploaded: ${formatUploadedDate(input.createdAt)}`,
    `- Extraction: ${input.extractionStatus}`,
    "",
    "## Related",
  ];

  if (input.categories.length > 0) {
    for (const category of input.categories) {
      lines.push(`- Category: ${wikiLink(categoryNotePath(category))}`);
    }
  } else {
    lines.push("- _No linked categories yet._");
  }

  if (input.eventIds.length > 0) {
    for (const eventId of input.eventIds) {
      lines.push(`- Event: ${wikiLink(eventNotePath(eventId))}`);
    }
  }

  lines.push("", "## Extracted text (excerpt)");
  if (input.extractedText) {
    lines.push("", excerpt(input.extractedText));
  } else {
    lines.push("", "_No extracted text._");
  }

  return {
    path: `${documentNotePath(input.id)}.md`,
    content: `${lines.join("\n")}\n`,
  };
}

function buildCategoryPage(input: {
  category: string;
  documentLinks: string[];
  eventLinks: string[];
  obligationLines: string[];
}): WikiFile {
  const lines = [
    `# ${input.category}`,
    "",
    `Back to ${householdLink("Household Index")}.`,
    "",
    "## Source documents",
    ...input.documentLinks.map((link) => `- ${link}`),
    "",
    "## Ledger events",
    ...input.eventLinks.map((link) => `- ${link}`),
    "",
    "## Detected obligations",
  ];

  if (input.obligationLines.length > 0) {
    lines.push(...input.obligationLines.map((line) => `- ${line}`));
  } else {
    lines.push("- _None detected._");
  }

  return {
    path: `${categoryNotePath(input.category)}.md`,
    content: `${lines.join("\n")}\n`,
  };
}

function buildEventPage(input: {
  id: string;
  type: string;
  category: string;
  amount: number;
  currency: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  sourceDocumentId: string | null;
  sourceFilename: string | null;
}): WikiFile {
  const lines = [
    `# ${input.category} (${input.type})`,
    "",
    `Back to ${householdLink("Ledger/Events")} · ${wikiLink(categoryNotePath(input.category))}`,
    "",
    "## Details",
    `- Amount: ${formatMoney(input.amount, input.currency)}`,
    `- Frequency: ${input.frequency}`,
    `- Start: ${formatDate(input.startDate)}`,
    `- End: ${formatDate(input.endDate)}`,
    "",
    "## Links",
    `- Category: ${wikiLink(categoryNotePath(input.category))}`,
  ];

  if (input.sourceDocumentId) {
    lines.push(
      `- Source document: ${wikiLink(documentNotePath(input.sourceDocumentId))}${input.sourceFilename ? ` (${input.sourceFilename})` : ""}`,
    );
  }

  lines.push("", `Event ID: \`${input.id}\``);

  return {
    path: `${eventNotePath(input.id)}.md`,
    content: `${lines.join("\n")}\n`,
  };
}

function buildReadmePage(): WikiFile {
  return {
    path: householdPath("README.md"),
    content: [
      "# FinIntel household wiki",
      "",
      "Auto-generated by **Household Financial Intelligence** (uploads + ledger).",
      "",
      `Start at ${householdLink("Household Index")}.`,
      "",
      "Engineering notes, decisions, and chat code live in the vault root folders (`00_Dashboard`, `02_Decisions`, `09_Code_From_Chat`, etc.).",
      "",
    ].join("\n"),
  };
}

export async function compileWikiVault(): Promise<WikiCompileResult> {
  const [documents, events, obligations, state] = await Promise.all([
    prisma.document.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.financialEvent.findMany({
      where: { userId: USER_ID },
      include: { sourceDocument: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.financialObligation.findMany({
      include: { sourceDocument: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialState.findUnique({ where: { userId: USER_ID } }),
  ]);

  const categories = new Set<string>();
  for (const event of events) categories.add(event.category);
  for (const ob of obligations) categories.add(ob.category);

  const files: WikiFile[] = [buildReadmePage()];

  const documentCategoryMap = new Map<string, Set<string>>();
  const documentEventMap = new Map<string, string[]>();

  for (const event of events) {
    if (!event.sourceDocumentId) continue;
    const cats =
      documentCategoryMap.get(event.sourceDocumentId) ?? new Set<string>();
    cats.add(event.category);
    documentCategoryMap.set(event.sourceDocumentId, cats);

    const eventIds = documentEventMap.get(event.sourceDocumentId) ?? [];
    eventIds.push(event.id);
    documentEventMap.set(event.sourceDocumentId, eventIds);
  }

  for (const ob of obligations) {
    if (!ob.sourceDocumentId) continue;
    const cats =
      documentCategoryMap.get(ob.sourceDocumentId) ?? new Set<string>();
    cats.add(ob.category);
    documentCategoryMap.set(ob.sourceDocumentId, cats);
  }

  const documentLinks: string[] = [];
  for (const doc of documents) {
    const cats = [...(documentCategoryMap.get(doc.id) ?? new Set<string>())];
    const eventIds = documentEventMap.get(doc.id) ?? [];
    files.push(
      buildDocumentPage({
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        extractionStatus: doc.extractionStatus,
        createdAt: doc.createdAt,
        extractedText: doc.extractedText,
        categories: cats,
        eventIds,
      }),
    );
    documentLinks.push(wikiLink(documentNotePath(doc.id)));
  }

  const categoryLinks: string[] = [];
  for (const category of [...categories].sort()) {
    const docIds = new Set<string>();
    const eventLinks: string[] = [];
    const obligationLines: string[] = [];

    for (const event of events) {
      if (event.category !== category) continue;
      eventLinks.push(
        `${wikiLink(eventNotePath(event.id))} — ${formatMoney(Number(event.amount), event.currency)} / ${event.frequency}`,
      );
      if (event.sourceDocumentId) docIds.add(event.sourceDocumentId);
    }

    for (const ob of obligations) {
      if (ob.category !== category) continue;
      obligationLines.push(
        `${ob.name}: ${formatMoney(Number(ob.amount), ob.currency)} / ${ob.frequency}${ob.sourceDocumentId ? ` (${wikiLink(documentNotePath(ob.sourceDocumentId))})` : ""}`,
      );
      if (ob.sourceDocumentId) docIds.add(ob.sourceDocumentId);
    }

    const documentLinksForCategory = [...docIds].map((id) => {
      const doc = documents.find((d) => d.id === id);
      const label = doc?.filename ?? id;
      return `${wikiLink(documentNotePath(id))} — ${label}`;
    });

    files.push(
      buildCategoryPage({
        category,
        documentLinks: documentLinksForCategory,
        eventLinks,
        obligationLines,
      }),
    );
    categoryLinks.push(wikiLink(categoryNotePath(category)));
  }

  const eventLinks = events.map((event) => {
    return `${wikiLink(eventNotePath(event.id))} — ${event.category} ${formatMoney(Number(event.amount), event.currency)}`;
  });

  for (const event of events) {
    files.push(
      buildEventPage({
        id: event.id,
        type: event.type,
        category: event.category,
        amount: Number(event.amount),
        currency: event.currency,
        frequency: event.frequency,
        startDate: event.startDate,
        endDate: event.endDate,
        sourceDocumentId: event.sourceDocumentId,
        sourceFilename: event.sourceDocument?.filename ?? null,
      }),
    );
  }

  files.push(
    buildOverviewPage({
      currentCash: state ? Number(state.currentCash) : null,
      monthlyIncome: state ? Number(state.monthlyIncome) : null,
      eventCount: events.length,
      obligationCount: obligations.length,
      documentCount: documents.length,
    }),
  );
  files.push(buildEventsIndexPage(eventLinks));
  files.push(
    buildIndexPage({
      documentLinks,
      categoryLinks,
      eventCount: events.length,
      currentCash: state ? Number(state.currentCash) : null,
    }),
  );

  return {
    files,
    pageCount: files.length,
    documentCount: documents.length,
    categoryCount: categories.size,
    eventCount: events.length,
  };
}
