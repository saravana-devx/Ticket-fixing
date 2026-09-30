import "dotenv/config";
import { buildGraph } from "./graph.js";
import { completeRun, createRun } from "./db.js";
import { loadTicket } from "./tools/ticketLoader.js";

const ticket = await loadTicket(process.argv[2]);
console.log(`Ticket #${ticket.id} [${ticket.severity}]: ${ticket.title}`);

const startedAt = Date.now();
const runId = createRun(ticket.id, ticket);

try {
  const final = await buildGraph().invoke({
    ticket,
    runId,
    startedAt,
    retryCount: 0,
    status: "pending",
  });
  completeRun(runId, final.status, startedAt);
  console.log(`Finished with status: ${final.status}`);
  if (final.prUrl) console.log(`PR: ${final.prUrl}`);
  if (final.childTicketUrl) console.log(`Ticket: ${final.childTicketUrl}`);
} catch (err) {
  completeRun(runId, "failed", startedAt);
  console.error(err);
  process.exitCode = 1;
}
