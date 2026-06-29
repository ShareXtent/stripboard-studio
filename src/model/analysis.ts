import { deriveCopperSegments } from "./copperSegments";
import { runDesignRuleChecks } from "./drc";
import { buildElectricalGraphFromSegments } from "./graph";
import { buildNetsFromGraph } from "./nets";
import { ProjectElectricalAnalysis, ProjectModel } from "./types";

export function deriveProjectElectricalAnalysis(project: ProjectModel): ProjectElectricalAnalysis {
  const copperSegments = deriveCopperSegments(project);
  const electricalGraph = buildElectricalGraphFromSegments(project, copperSegments);
  const nets = buildNetsFromGraph(project, copperSegments, electricalGraph);
  const drcIssues = runDesignRuleChecks(project);

  return {
    copperSegments,
    electricalGraph,
    nets,
    drcIssues,
  };
}
