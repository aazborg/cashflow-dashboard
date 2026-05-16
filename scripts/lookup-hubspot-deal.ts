/**
 * Sucht in HubSpot nach Deals mit einer bestimmten Contact-Email, listet
 * Closedates + Deal-IDs auf. Hilft beim Setzen von Sync-Cutoff-Daten.
 *
 * Aufruf:  npx dotenv-cli -e .env.local -- tsx scripts/lookup-hubspot-deal.ts deduchek@hotmail.com
 */
async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx lookup-hubspot-deal.ts <email>");
    process.exit(1);
  }
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    console.error("HUBSPOT_PRIVATE_APP_TOKEN fehlt");
    process.exit(1);
  }
  const HUBSPOT_BASE = "https://api.hubapi.com";

  // 1) Contact finden
  const contactRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: email }],
        },
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 5,
    }),
  });
  if (!contactRes.ok) {
    console.error(`HubSpot contact search ${contactRes.status}: ${await contactRes.text()}`);
    process.exit(1);
  }
  const cj = (await contactRes.json()) as {
    results: { id: string; properties: Record<string, string> }[];
  };
  if (cj.results.length === 0) {
    console.log("Kein Contact in HubSpot.");
    return;
  }
  for (const c of cj.results) {
    console.log(
      `Contact ${c.id}: ${c.properties.firstname} ${c.properties.lastname} <${c.properties.email}>`,
    );
  }
  const contactId = cj.results[0].id;

  // 2) Associated deals
  const assocRes = await fetch(
    `${HUBSPOT_BASE}/crm/v4/objects/contacts/${contactId}/associations/deals`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!assocRes.ok) {
    console.error(`assoc ${assocRes.status}`);
    process.exit(1);
  }
  const aj = (await assocRes.json()) as {
    results: { toObjectId: string }[];
  };
  const dealIds = aj.results.map((r) => r.toObjectId);
  console.log(`\n${dealIds.length} assoziierte Deals:`);
  if (dealIds.length === 0) return;

  // 3) Deal-Details laden (Batch)
  const batchRes = await fetch(
    `${HUBSPOT_BASE}/crm/v3/objects/deals/batch/read`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: ["dealname", "dealstage", "pipeline", "amount", "closedate", "createdate"],
        inputs: dealIds.map((id) => ({ id })),
      }),
    },
  );
  const bj = (await batchRes.json()) as {
    results: { id: string; properties: Record<string, string> }[];
  };
  for (const d of bj.results) {
    console.log(
      `  Deal ${d.id}: name="${d.properties.dealname}" pipeline=${d.properties.pipeline} stage=${d.properties.dealstage} amount=${d.properties.amount} closedate=${d.properties.closedate}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
