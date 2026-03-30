// frontend/lib/costAnalysis.ts

export type GreenspaceType = "park" | "forest" | "garden" | "wetland";

export interface CostAnalysisInputs {
    areaSqM: number;
    greenspaceType: GreenspaceType;
    nearbyPropertyValue: number; // avg $ per property
    numPropertiesAffected: number;
}

export interface YearlySnapshot {
    year: number;
    cumulativeCost: number;
    cumulativeRevenue: number;
    netCashFlow: number;
}

export interface CostAnalysisResult {
    // Costs
    capex: number;
    opexAnnual: number;
    totalCost20yr: number;
    // Revenue streams (all annual)
    carbonCreditAnnual: number;
    propertyUpliftAnnual: number;
    sewageSavingsAnnual: number;
    energySavingsAnnual: number;
    totalAnnualRevenue: number;
    // Summary
    totalRevenue20yr: number;
    netAt20yr: number;
    breakEvenYear: number | null;
    timeline: YearlySnapshot[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CARBON_CREDIT_PRICE = 95;    // $ per tonne CO₂
export const PROPERTY_UPLIFT_RATE = 0.03; // 3%
export const PROJECTION_YEARS = 25;

// ─── Per-type coefficients ────────────────────────────────────────────────────

const TYPE_PARAMS: Record<
    GreenspaceType,
    {
        capexPerM2: number;
        opexPerM2: number;
        carbonTonnesPerHaPerYear: number;
        sewageSavingsPerM2: number;
        energySavingsPerM2: number;
    }
> = {
    park: {
        capexPerM2: 120,
        opexPerM2: 8,
        carbonTonnesPerHaPerYear: 4,
        sewageSavingsPerM2: 2.5,
        energySavingsPerM2: 1.8,
    },
    forest: {
        capexPerM2: 180,
        opexPerM2: 5,
        carbonTonnesPerHaPerYear: 10,
        sewageSavingsPerM2: 4.0,
        energySavingsPerM2: 3.2,
    },
    garden: {
        capexPerM2: 90,
        opexPerM2: 12,
        carbonTonnesPerHaPerYear: 2,
        sewageSavingsPerM2: 1.8,
        energySavingsPerM2: 1.0,
    },
    wetland: {
        capexPerM2: 200,
        opexPerM2: 10,
        carbonTonnesPerHaPerYear: 6,
        sewageSavingsPerM2: 8.0,
        energySavingsPerM2: 2.0,
    },
};

// ─── Main calculation ─────────────────────────────────────────────────────────

export function runCostAnalysis(inputs: CostAnalysisInputs): CostAnalysisResult {
    const { areaSqM, greenspaceType, nearbyPropertyValue, numPropertiesAffected } = inputs;
    const p = TYPE_PARAMS[greenspaceType];
    const ha = areaSqM / 10000;

    // Costs
    const capex = areaSqM * p.capexPerM2;
    const opexAnnual = areaSqM * p.opexPerM2;

    // Revenue streams (annual)
    const carbonCreditAnnual = ha * p.carbonTonnesPerHaPerYear * CARBON_CREDIT_PRICE;
    // Property uplift is a one-time gain — amortize over 20 yrs for annual comparison
    const propertyUpliftAnnual = (numPropertiesAffected * nearbyPropertyValue * PROPERTY_UPLIFT_RATE) / 20;
    const sewageSavingsAnnual = areaSqM * p.sewageSavingsPerM2;
    const energySavingsAnnual = areaSqM * p.energySavingsPerM2;
    const totalAnnualRevenue =
        carbonCreditAnnual + propertyUpliftAnnual + sewageSavingsAnnual + energySavingsAnnual;

    // Timeline
    const timeline: YearlySnapshot[] = [];
    let breakEvenYear: number | null = null;

    for (let year = 0; year <= PROJECTION_YEARS; year++) {
        const cumulativeCost = Math.round(capex + opexAnnual * year);
        const cumulativeRevenue = Math.round(totalAnnualRevenue * year);
        const netCashFlow = cumulativeRevenue - cumulativeCost;

        if (breakEvenYear === null && netCashFlow >= 0 && year > 0) {
            breakEvenYear = year;
        }

        timeline.push({ year, cumulativeCost, cumulativeRevenue, netCashFlow });
    }

    const totalCost20yr = capex + opexAnnual * 20;
    const totalRevenue20yr = totalAnnualRevenue * 20;
    const netAt20yr = totalRevenue20yr - totalCost20yr;

    return {
        capex,
        opexAnnual,
        totalCost20yr,
        carbonCreditAnnual,
        propertyUpliftAnnual,
        sewageSavingsAnnual,
        energySavingsAnnual,
        totalAnnualRevenue,
        totalRevenue20yr,
        netAt20yr,
        breakEvenYear,
        timeline,
    };
}

// ─── Formatting helper ────────────────────────────────────────────────────────

export function formatCurrency(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${Math.round(abs).toLocaleString()}`;
}

// ─── Derive area from grid cell dimensions ────────────────────────────────────
// Lets the cost panel auto-calculate area from the existing grid — no manual input.

import { KW_BOUNDS } from "@/lib/suitability";

export function cellAreaSqM(rows: number, cols: number): number {
    const latDeg = (KW_BOUNDS.north - KW_BOUNDS.south) / rows;
    const lngDeg = (KW_BOUNDS.east - KW_BOUNDS.west) / cols;
    // 1° lat ≈ 111,320 m; 1° lng ≈ 111,320 * cos(lat)
    const centerLat = (KW_BOUNDS.north + KW_BOUNDS.south) / 2;
    const latM = latDeg * 111_320;
    const lngM = lngDeg * 111_320 * Math.cos((centerLat * Math.PI) / 180);
    return Math.round(latM * lngM);
}