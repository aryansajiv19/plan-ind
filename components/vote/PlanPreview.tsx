"use client";

import { createContext, useContext } from "react";
import type { PlanSharePreview } from "@/lib/types";

// The keyless share preview (plan_share_preview, migration 062), fetched by
// app/plan/[id]/layout.tsx on the server so the join card has the plan's
// title and host in the first paint, before any session exists.
const PlanPreviewContext = createContext<PlanSharePreview | null>(null);

export const PlanPreviewProvider = PlanPreviewContext.Provider;
export const usePlanPreview = () => useContext(PlanPreviewContext);
