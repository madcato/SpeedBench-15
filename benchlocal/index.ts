import {
  createHostHelpers,
  defineBenchPack,
  loadBenchPackManifest,
  requireScoredResults,
  type ScenarioRunInput,
  type ScenarioResult,
  type ProgressEmitter
} from "@benchlocal/sdk";

import { SCENARIOS, getScenarioCards, scoreModelResults } from "../lib/benchmark";
import { runScenario } from "../lib/orchestrator";

const manifest = loadBenchPackManifest(__dirname);

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      description: scenario.description,
      detailCards: getScenarioCards(scenario)
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);

    return {
      async runScenario(input: ScenarioRunInput, emit: ProgressEmitter): Promise<ScenarioResult> {
        const endpoint = helpers.getRequiredInferenceEndpoint(input.model.id);

        return runScenario(
          input.scenario.id,
          {
            baseUrl: endpoint.baseUrl,
            authMode: endpoint.authMode,
            apiKey: endpoint.apiKey,
            model: endpoint.exposedModel
          },
          {
            temperature: input.generation.temperature,
            top_p: input.generation.top_p
          },
          (msg) => {
            void emit({
              type: "model_progress",
              modelId: input.model.id,
              scenarioId: input.scenario.id,
              message: msg
            });
          }
        );
      },

      async dispose() {}
    };
  },

  scoreModelResults(results) {
    return scoreModelResults(requireScoredResults(results));
  }
});
