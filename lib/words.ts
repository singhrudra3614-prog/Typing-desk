export const GAME_WORDS = {
  beginner: [
    "the", "and", "sky", "sun", "bat", "cat", "dog", "hat", "map", "net",
    "pen", "run", "sit", "top", "was", "how", "why", "but", "for", "get",
    "let", "man", "now", "see", "two", "use", "way", "yes", "any", "day"
  ],
  intermediate: [
    "bridge", "garden", "planet", "silver", "winter", "bright", "forest",
    "memory", "orange", "spring", "animal", "button", "energy", "island",
    "nature", "player", "summer", "autumn", "camera", "factor", "market",
    "office", "random", "target", "vision", "window", "yellow", "danger"
  ],
  advanced: [
    "algorithm", "bandwidth", "callback", "database", "endpoint", "function",
    "gradient", "hardware", "infinity", "junction", "keyboard", "language",
    "metadata", "notebook", "operator", "password", "quantity", "renderer",
    "software", "terminal", "username", "variable", "workflow", "explorer"
  ],
  expert: [
    "asynchronous", "bottleneck", "cryptography", "distributed", "encryption",
    "filesystem", "hypermedia", "interactive", "javascript", "kubernetes",
    "middleware", "normalization", "orchestration", "parallelism", "quicksort",
    "refactoring", "synchronization", "transactional", "virtualization"
  ],
  coding: [
    "const", "let", "export", "function", "async", "await", "import", "return",
    "interface", "type", "console.log", "useEffect", "useState", "Promise",
    "try", "catch", "finally", "while", "for", "switch", "case", "default"
  ],
  rush: [
    "fire", "bolt", "dash", "fast", "wind", "zap", "rush", "zoom", "zip", "fly",
    "quick", "snap", "race", "pace", "hot", "sun", "run", "jet", "ace", "pro"
  ],
  gauntlet: [
    "transcendence", "metamorphosis", "synchronicity", "juxtaposition", "exacerbation",
    "unprecedented", "comprehensive", "infrastructure", "authentication", "accessibility",
    "standardization", "documentation", "implementation", "environmental", "experimental"
  ]
};

export function getRandomWord(difficulty: keyof typeof GAME_WORDS): string {
  const words = GAME_WORDS[difficulty];
  return words[Math.floor(Math.random() * words.length)];
}

export function getSeededRandomWord(difficulty: keyof typeof GAME_WORDS, seed: number): string {
  const words = GAME_WORDS[difficulty];
  // Simple LCG seeded random
  const x = Math.sin(seed) * 10000;
  const rand = x - Math.floor(x);
  return words[Math.floor(rand * words.length)];
}
