// Offline input preparation/scoring. Node >=22.18 supports the TypeScript import.
import { readFile } from "node:fs/promises";
import { fixtures, continuationInput, scoreContinuation, scoreRun, SUITE_VERSION } from "../eval/continuation.ts";
const [command, argument, file] = process.argv.slice(2);
try {
	let result;
	if (command === "sources") {
		result = { suiteVersion: SUITE_VERSION, cases: fixtures.map(({ id, prefix, retained, isSplitTurn }) => ({ id, prefixToSummarize: prefix, retainedSuffix: retained, isSplitTurn })) };
	} else if (command === "prompts" && ["original", "good", "bad", "candidate"].includes(argument)) {
		const summaries = argument === "candidate" ? JSON.parse(await readFile(file, "utf8")) : {};
		result = fixtures.map((item) => continuationInput(item, argument, summaries[item.id]));
	} else if (command === "controls") {
		result = { kind: "fixture-control", modelCalls: 0, cases: fixtures.map((item) => ({ id: item.id, authoredCorrectDecision: scoreContinuation(item, item.expected), authoredIncorrectDecision: scoreContinuation(item, item.counterexample) })) };
		if (!result.cases.every((row) => row.authoredCorrectDecision.status === "pass" && row.authoredIncorrectDecision.status === "fail")) process.exitCode = 1;
	} else if (command === "score" && argument) {
		result = scoreRun(JSON.parse(await readFile(argument, "utf8")));
		if (!result.allPassed) process.exitCode = 1;
	} else throw new Error("Usage: node scripts/eval-continuation.mjs sources | prompts <original|good|bad|candidate> [summaries.json] | controls | score <results.json>");
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2;
}
