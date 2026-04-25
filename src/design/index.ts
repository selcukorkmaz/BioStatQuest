// Barrel re-export for the design system. Import primitives via:
//   import { Card, Btn, Chip, Stat } from "@/design";
//
// (Aliased path requires the project's tsconfig + vite paths setup; without
// it, use the explicit relative path: import { Card } from "../design";)

export { Card } from "./Card";
export { Btn } from "./Btn";
export { Chip } from "./Chip";
export { Field } from "./Field";
export { SectionLabel } from "./SectionLabel";
export { Stat } from "./Stat";
export { InlineSpinner, Skeleton, SkeletonLines, EmptyState, ErrorBanner } from "./state";
export { colors, radii, fontSizes, toneStyle } from "./tokens";
export type { Tone } from "./tokens";
export type { CardProps } from "./Card";
export type { BtnProps } from "./Btn";
export type { ChipProps } from "./Chip";
export type { FieldProps } from "./Field";
export type { StatProps } from "./Stat";
export type { SectionLabelProps } from "./SectionLabel";
export type { SkeletonProps, EmptyStateProps, ErrorBannerProps } from "./state";
