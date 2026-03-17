/**
 * Oracle Service — Simulates a decentralized oracle network
 *
 * Demonstrates the Oracle Problem and ASTREA-like consensus:
 * - 7 independent oracle nodes providing ETH/USD price feeds
 * - 3 aggregation modes: Centralized, Simple Average, ASTREA
 * - Interactive: toggle nodes as malicious to see how each mode reacts
 */

// ---- Initial Oracle Nodes ----
const NODE_TEMPLATES = [
  { id: 1, name: "Singapore", stake: 32, reputation: 98, priceBias: 0.0005 },
  { id: 2, name: "Tokyo", stake: 28, reputation: 95, priceBias: -0.0003 },
  { id: 3, name: "New York", stake: 45, reputation: 97, priceBias: 0.0002 },
  { id: 4, name: "London", stake: 38, reputation: 96, priceBias: -0.0004 },
  { id: 5, name: "Frankfurt", stake: 25, reputation: 93, priceBias: 0.0006 },
  { id: 6, name: "Sydney", stake: 20, reputation: 91, priceBias: -0.0002 },
  { id: 7, name: "São Paulo", stake: 18, reputation: 89, priceBias: 0.0004 },
];

const INITIAL_TRUE_PRICE = 2091.0; // ETH/USD starting price
const MAX_HISTORY = 20;
const MALICIOUS_DEVIATION_MIN = 0.05; // 5%
const MALICIOUS_DEVIATION_MAX = 0.20; // 20%
const NORMAL_NOISE = 0.0015; // 0.15% typical noise
const TRUE_PRICE_DRIFT = 0.003; // 0.3% max drift per tick
const OUTLIER_THRESHOLD = 0.02; // 2% deviation = outlier
const SLASH_REPUTATION = 5;
const SLASH_STAKE = 2;
const SLASH_THRESHOLD = 30; // reputation below this → slashed

/**
 * Create initial oracle network state
 */
export function createOracleNetwork() {
  const nodes = NODE_TEMPLATES.map((t) => ({
    ...t,
    status: "active", // "active" | "malicious" | "slashed"
    latestPrice: INITIAL_TRUE_PRICE * (1 + t.priceBias),
    lastSubmitTime: Date.now(),
    slashCount: 0,
    originalStake: t.stake,
    originalReputation: t.reputation,
  }));

  const initialRound = {
    timestamp: Date.now(),
    truePrice: INITIAL_TRUE_PRICE,
    nodePrices: nodes.map((n) => n.latestPrice),
    centralizedResult: nodes[0].latestPrice,
    averageResult:
      nodes.reduce((s, n) => s + n.latestPrice, 0) / nodes.length,
    astreaResult: INITIAL_TRUE_PRICE,
    outlierNodeIds: [],
  };

  return {
    nodes,
    mode: "astrea", // "centralized" | "average" | "astrea"
    currentTruePrice: INITIAL_TRUE_PRICE,
    consensusPrice: INITIAL_TRUE_PRICE,
    confidence: 100,
    history: [initialRound],
    lastUpdateTime: Date.now(),
    accuracy: { centralized: 100, average: 100, astrea: 100 },
  };
}

/**
 * Simulate one price round — call every ~3.5s
 */
export function simulatePriceRound(state) {
  const newState = { ...state, nodes: state.nodes.map((n) => ({ ...n })) };

  // 1. Random-walk the true price
  const drift = (Math.random() - 0.5) * 2 * TRUE_PRICE_DRIFT;
  newState.currentTruePrice = state.currentTruePrice * (1 + drift);

  const truePrice = newState.currentTruePrice;

  // 2. Each node submits a price
  const nodePrices = newState.nodes.map((node) => {
    if (node.status === "slashed") {
      return null; // slashed nodes don't submit
    }

    let price;
    if (node.status === "malicious") {
      // Malicious: deviate significantly (5-20%) in a random direction
      const deviation =
        MALICIOUS_DEVIATION_MIN +
        Math.random() * (MALICIOUS_DEVIATION_MAX - MALICIOUS_DEVIATION_MIN);
      const direction = Math.random() > 0.5 ? 1 : -1;
      price = truePrice * (1 + direction * deviation);
    } else {
      // Honest: small noise around true price + node's inherent bias
      const noise = (Math.random() - 0.5) * 2 * NORMAL_NOISE;
      price = truePrice * (1 + node.priceBias + noise);
    }

    node.latestPrice = price;
    node.lastSubmitTime = Date.now();
    return price;
  });

  // 3. Compute all three aggregation results
  const centralizedResult = aggregateCentralized(nodePrices, newState.nodes);
  const averageResult = aggregateSimpleAverage(nodePrices, newState.nodes);
  const astreaResult = aggregateASTREA(nodePrices, newState.nodes);

  // 4. Build the history entry
  const round = {
    timestamp: Date.now(),
    truePrice,
    nodePrices,
    centralizedResult: centralizedResult.price,
    averageResult: averageResult.price,
    astreaResult: astreaResult.price,
    outlierNodeIds: astreaResult.outlierNodeIds,
  };

  newState.history = [...state.history, round].slice(-MAX_HISTORY);
  newState.lastUpdateTime = Date.now();

  // 5. Set consensus price based on current mode
  if (newState.mode === "centralized") {
    newState.consensusPrice = centralizedResult.price;
    newState.confidence = centralizedResult.confidence;
  } else if (newState.mode === "average") {
    newState.consensusPrice = averageResult.price;
    newState.confidence = averageResult.confidence;
  } else {
    newState.consensusPrice = astreaResult.price;
    newState.confidence = astreaResult.confidence;
  }

  // 6. Compute accuracy over history
  newState.accuracy = computeAccuracy(newState.history);

  return newState;
}

/**
 * Centralized: Use only node #1 (Singapore)
 */
function aggregateCentralized(nodePrices, nodes) {
  const primaryNode = nodes[0];

  // Primary node is healthy — use its price
  if (primaryNode.status !== "slashed" && nodePrices[0] !== null) {
    return {
      price: nodePrices[0],
      confidence: primaryNode.status === "active" ? 100 : 0,
    };
  }

  // Fallback: find first non-slashed node
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].status !== "slashed" && nodePrices[i] !== null) {
      return { price: nodePrices[i], confidence: 50 };
    }
  }

  // All nodes slashed — return stale initial price
  return { price: INITIAL_TRUE_PRICE, confidence: 0 };
}

/**
 * Simple Average: Mean of all active node prices
 */
function aggregateSimpleAverage(nodePrices, nodes) {
  const activePrices = nodePrices.filter(
    (p, i) => p !== null && nodes[i].status !== "slashed"
  );

  if (activePrices.length === 0) {
    return { price: INITIAL_TRUE_PRICE, confidence: 0 };
  }

  const avg = activePrices.reduce((s, p) => s + p, 0) / activePrices.length;
  const maxDev = Math.max(...activePrices.map((p) => Math.abs(p - avg) / avg));
  const confidence = Math.max(0, (1 - maxDev * 10) * 100);

  return { price: avg, confidence: Math.round(confidence) };
}

/**
 * ASTREA Decentralized Oracle — Stake-weighted median with outlier slashing
 *
 * Algorithm:
 * 1. Filter out slashed nodes
 * 2. Sort prices ascending
 * 3. Compute stake-weighted median (50th percentile by stake)
 * 4. Flag outliers (>2% deviation from median)
 * 5. Slash outlier nodes (reputation - 5, stake - 2)
 * 6. Final price = stake-weighted average of non-outliers
 * 7. Confidence based on valid stake ratio and price spread
 */
function aggregateASTREA(nodePrices, nodes) {
  // 1. Filter eligible nodes (not slashed)
  const eligible = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].status !== "slashed" && nodePrices[i] !== null) {
      eligible.push({ node: nodes[i], price: nodePrices[i] });
    }
  }

  if (eligible.length === 0) {
    return {
      price: INITIAL_TRUE_PRICE,
      confidence: 0,
      outlierNodeIds: [],
    };
  }

  // 2. Sort by price ascending
  eligible.sort((a, b) => a.price - b.price);

  // 3. Stake-weighted median
  const totalStake = eligible.reduce((s, e) => s + e.node.stake, 0);
  let cumStake = 0;
  let medianPrice = eligible[0].price;
  for (const e of eligible) {
    cumStake += e.node.stake;
    if (cumStake >= totalStake / 2) {
      medianPrice = e.price;
      break;
    }
  }

  // 4. Outlier detection (relative deviation > 2%)
  const outlierNodeIds = [];
  const valid = [];

  for (const e of eligible) {
    const relativeDeviation = medianPrice > 0
      ? Math.abs(e.price - medianPrice) / medianPrice
      : 0;
    if (relativeDeviation > OUTLIER_THRESHOLD) {
      // This node is an outlier
      outlierNodeIds.push(e.node.id);

      // 5. Slash the outlier
      e.node.reputation = Math.max(0, e.node.reputation - SLASH_REPUTATION);
      e.node.stake = Math.max(0, e.node.stake - SLASH_STAKE);
      e.node.slashCount += 1;

      if (e.node.reputation < SLASH_THRESHOLD) {
        e.node.status = "slashed";
      }
    } else {
      valid.push(e);
    }
  }

  if (valid.length === 0) {
    return { price: medianPrice, confidence: 50, outlierNodeIds };
  }

  // 6. Stake-weighted average of non-outliers
  const validStake = valid.reduce((s, e) => s + e.node.stake, 0);
  if (validStake === 0) {
    return { price: medianPrice, confidence: 50, outlierNodeIds };
  }
  const consensusPrice =
    valid.reduce((s, e) => s + e.price * e.node.stake, 0) / validStake;

  // 7. Confidence
  const priceRange =
    Math.max(...valid.map((e) => e.price)) -
    Math.min(...valid.map((e) => e.price));
  const spread = medianPrice > 0 ? priceRange / medianPrice : 0;
  const stakeRatio = validStake / totalStake;
  const confidence = Math.round(stakeRatio * 100 * Math.max(0, 1 - spread * 5));

  return {
    price: consensusPrice,
    confidence: Math.min(100, Math.max(0, confidence)),
    outlierNodeIds,
  };
}

/**
 * Compute accuracy for each mode over price history
 */
function computeAccuracy(history) {
  if (history.length < 2) {
    return { centralized: 100, average: 100, astrea: 100 };
  }

  const calc = (key) => {
    const deviations = history.map((h) =>
      h.truePrice > 0 ? Math.abs(h[key] - h.truePrice) / h.truePrice : 0
    );
    const avgDeviation =
      deviations.reduce((s, d) => s + d, 0) / deviations.length;
    return Math.round(Math.max(0, (1 - avgDeviation) * 100 * 10) / 10);
  };

  return {
    centralized: calc("centralizedResult"),
    average: calc("averageResult"),
    astrea: calc("astreaResult"),
  };
}

/**
 * Toggle a node between active and malicious
 */
export function toggleMalicious(state, nodeId) {
  const newState = { ...state, nodes: state.nodes.map((n) => ({ ...n })) };
  const node = newState.nodes.find((n) => n.id === nodeId);

  if (!node) return newState;

  if (node.status === "malicious") {
    node.status = "active";
  } else if (node.status === "slashed") {
    // Restore slashed node to original parameters
    node.status = "active";
    node.reputation = node.originalReputation;
    node.stake = node.originalStake;
    node.slashCount = 0;
  } else {
    node.status = "malicious";
  }

  return newState;
}

/**
 * Switch aggregation mode
 */
export function setMode(state, mode) {
  const newState = { ...state, mode };

  // Recalculate consensus price for the new mode from latest history
  const latest = state.history[state.history.length - 1];
  if (latest) {
    if (mode === "centralized") newState.consensusPrice = latest.centralizedResult;
    else if (mode === "average") newState.consensusPrice = latest.averageResult;
    else newState.consensusPrice = latest.astreaResult;
  }

  return newState;
}

/**
 * Reset the entire oracle network to initial state
 */
export function resetNetwork() {
  return createOracleNetwork();
}
