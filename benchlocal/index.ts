import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  requireScoredResults,
  type ScenarioRunInput,
  type ScenarioResult
} from "@benchlocal/sdk";

import { SCENARIOS, getScenarioCards, scoreModelResults } from "../lib/benchmark";
import { runScenarioForModel } from "../lib/orchestrator";

const manifest = loadBenchPackManifest(__dirname);

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      detailCards: getScenarioCards(scenario)
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);
    return {
      async runScenario(input: ScenarioRunInput): Promise<ScenarioResult> {
        return runScenarioForModel(input, helpers) as Promise<ScenarioResult>;
      },
      async dispose() {
        // No persistent state to clean up
      }
    };
  },

  scoreModelResults(results) {
    return scoreModelResults(requireScoredResults(results));
  }
});
