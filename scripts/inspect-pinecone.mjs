const apiKey = "pcsk_5pbuA5_NLiLmPrTUVeMybS6c1cYUEwk6eH8AwKGBkueVgUZpHdwJcnsXumGv1XHg2dMXEW";
const host = "https://cograg-oubkmcx.svc.aped-4627-b74a.pinecone.io";

async function inspect() {
  console.log("=== PINECONE INDEX INSPECTOR ===");
  console.log("Connecting to:", host);

  // 1. Describe Index Stats
  try {
    const statsRes = await fetch(`${host}/describe_index_stats`, {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!statsRes.ok) {
      const err = await statsRes.text();
      console.error("Failed to describe index stats:", statsRes.status, err);
      return;
    }

    const stats = await statsRes.json();
    console.log("\n[INDEX STATS]");
    console.log(JSON.stringify(stats, null, 2));

    // 2. Sample vectors from each namespace
    const namespaces = Object.keys(stats.namespaces || {});
    console.log(`\nFound ${namespaces.length} namespace(s):`, namespaces);

    for (const ns of namespaces) {
      console.log(`\n--- Inspecting Namespace: "${ns}" (${stats.namespaces[ns].vectorCount} vectors) ---`);
      
      // Query top 3 vectors with a zero/dummy vector of the right dimension
      const dim = stats.dimension || 768;
      const dummyValues = new Array(dim).fill(0.01);
      
      const queryRes = await fetch(`${host}/query`, {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          namespace: ns,
          vector: dummyValues,
          topK: 3,
          includeMetadata: true,
          includeValues: false
        })
      });

      if (queryRes.ok) {
        const queryData = await queryRes.json();
        console.log(`Top matches in "${ns}":`);
        for (const m of (queryData.matches || [])) {
          console.log(`\n• Vector ID: ${m.id} (Score: ${m.score?.toFixed(4)})`);
          console.log(`  File: ${m.metadata?.file_name || 'N/A'}`);
          console.log(`  Department: ${m.metadata?.department_id || 'N/A'}`);
          console.log(`  Chunk Text: "${(m.metadata?.text || '').slice(0, 150)}..."`);
        }
      } else {
        console.log("Query error:", await queryRes.text());
      }
    }

  } catch (err) {
    console.error("Error inspecting Pinecone:", err);
  }
}

inspect();
