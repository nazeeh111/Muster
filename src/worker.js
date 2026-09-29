import { solve } from "./solver.js?v=0.2.0";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: solve(data.model, { budgetMs: 6500 }) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error.message || "Could not solve this rota.",
    });
  }
};
