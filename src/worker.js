import { solve } from "./solver.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: solve(data.model) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error.message || "Could not solve this rota.",
    });
  }
};
