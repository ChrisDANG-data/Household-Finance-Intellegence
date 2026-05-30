/**
 * RAG Pipeline Test Script
 * 
 * Tests: list documents → index → retrieve
 * Run: node scripts/test-rag.mjs
 */

const BASE_URL = "http://localhost:3000";

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  console.log(`[${res.status}] ${options.method || "GET"} ${path}`);
  return json;
}

async function main() {
  console.log("=== RAG Pipeline Test ===\n");

  // Step 1: List documents
  console.log("1. Listing uploaded documents...");
  const listResult = await fetchJson("/api/documents/upload");
  
  if (!listResult.success || !listResult.data?.documents?.length) {
    console.log("   No documents found. Upload a PDF first:");
    console.log('   curl -X POST http://localhost:3000/api/documents/upload -F "file=@your-file.pdf"');
    return;
  }

  const docs = listResult.data.documents;
  console.log(`   Found ${docs.length} document(s):`);
  docs.forEach((d) => {
    console.log(`   - [${d.id}] ${d.filename} (status: ${d.extractionStatus})`);
    if (d.extractedText) {
      console.log(`     Text preview: "${d.extractedText.slice(0, 100)}..."`);
    }
  });

  // Pick first document with extracted text
  const doc = docs.find((d) => d.extractionStatus === "COMPLETED" && d.extractedText);
  if (!doc) {
    console.log("\n   No document has extracted text yet. Check extraction status.");
    return;
  }

  console.log(`\n   Using document: ${doc.filename} (${doc.id})`);

  // Step 2: Index the document (create embeddings)
  console.log("\n2. Indexing document (creating embeddings)...");
  console.log("   This may take a moment on first run (downloading embedding model)...");
  
  const indexResult = await fetchJson("/api/documents/embeddings", {
    method: "POST",
    body: JSON.stringify({ documentId: doc.id }),
  });

  if (!indexResult.success) {
    console.log("   ERROR:", indexResult.error);
    return;
  }

  console.log(`   Indexed ${indexResult.data.chunksIndexed} chunks`);

  // Step 3: Test retrieval only (no LLM needed)
  console.log("\n3. Testing vector retrieval (no API key needed)...");
  const question = "What is the policy number and coverage?";
  console.log(`   Question: "${question}"`);

  const retrieveResult = await fetchJson("/api/documents/rag/retrieve", {
    method: "POST",
    body: JSON.stringify({ query: question, topK: 3 }),
  });

  if (!retrieveResult.success) {
    console.log("   ERROR:", retrieveResult.error);
    console.log("   (Trying full RAG endpoint instead...)");
  } else {
    console.log(`\n   Retrieved ${retrieveResult.data.chunks.length} chunks:`);
    retrieveResult.data.chunks.forEach((s, i) => {
      console.log(`   [${i + 1}] score=${s.score.toFixed(3)} | "${s.content.slice(0, 100)}..."`);
    });
  }

  // Step 4: Full RAG with Claude (requires ANTHROPIC_API_KEY)
  console.log("\n4. Full RAG answer (requires ANTHROPIC_API_KEY)...");
  const ragResult = await fetchJson("/api/documents/rag", {
    method: "POST",
    body: JSON.stringify({ question }),
  });

  if (!ragResult.success) {
    console.log("   ERROR:", ragResult.error);
    if (ragResult.error?.code === "CONFIGURATION_ERROR") {
      console.log("   → Set ANTHROPIC_API_KEY in your .env file to enable AI answers");
    }
  } else {
    console.log(`\n   Answer:\n   ${ragResult.data.answer}`);
    console.log(`\n   Sources used: ${ragResult.data.sources.length} chunks`);
    ragResult.data.sources.forEach((s, i) => {
      console.log(`   [${i + 1}] score=${s.score.toFixed(3)} | "${s.content.slice(0, 80)}..."`);
    });
  }

  console.log("\n=== Test Complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
