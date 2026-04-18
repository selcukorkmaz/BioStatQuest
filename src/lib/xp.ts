// XP ↔ level conversion. Square-root curve: doubling XP doesn't double levels,
// so level growth feels earned at the high end without stalling beginners.
// Shared between App.tsx and extracted component modules to avoid duplication.
export const levelFromXP = (xp: number): number => Math.floor(Math.sqrt((xp || 0) / 50)) + 1;
export const xpForLevel = (lvl: number): number => ((lvl - 1) ** 2) * 50;
