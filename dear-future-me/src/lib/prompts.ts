/** Guided questions for a letter to your future self. Keys are stable ids. */
export const FUTURE_SELF_PROMPTS = [
  { key: "five-years", prompt: "Where do you see yourself in five years?" },
  { key: "proud", prompt: "What are you most proud of today?" },
  { key: "people", prompt: "Who are the most important people in your life right now?" },
  { key: "struggle", prompt: "What are you currently struggling with?" },
  { key: "never-changes", prompt: "What do you hope never changes?" },
  { key: "decisions", prompt: "Are you happy with the decisions you are making?" },
  { key: "ordinary-day", prompt: "What does an ordinary day look like for you right now?" },
  { key: "question", prompt: "What would you like to ask your future self?" },
] as const;
