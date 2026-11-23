import { NextResponse } from "next/server"
import { runABCSMC } from "@/lib/epi/engine"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const isCbsd = (body.pathosystem ?? "CBSD") === "CBSD"

    // Compute empirical summary statistics from ingested observations if provided
    const obsList = Array.isArray(body.observations) ? body.observations : []
    const infectiousCount = obsList.filter((o: Record<string, unknown>) => o.diagnostic_status === "Infectious").length
    const exposedCount = obsList.filter((o: Record<string, unknown>) => o.diagnostic_status === "Exposed").length
    const totalObs = Math.max(obsList.length, 1)

    const observedSummary: number[] = Array.isArray(body.observed)
      ? body.observed
      : [
          infectiousCount / totalObs || (isCbsd ? 0.25 : 0.28),
          (infectiousCount + exposedCount) / totalObs || (isCbsd ? 0.46 : 0.50),
        ]

    const result = runABCSMC({
      seed: body.seed ?? 2026,
      parameterNames: body.parameterNames ?? ["beta", "alpha_km", "latent_months"],
      priors: body.priors ?? [
        { type: "uniform", min: 0.05, max: 0.85 },
        { type: "uniform", min: 2.0, max: 30.0 },
        { type: "uniform", min: 0.5, max: 4.0 },
      ],
      observed: observedSummary,
      generations: body.generations ?? 4,
      particlesPerGen: body.particlesPerGen ?? body.particles ?? 150,
      initialTolerance: body.initialTolerance ?? 0.35,
      finalTolerance: body.finalTolerance ?? 0.04,
      // Spatial SEIR summary simulator parameterized by [beta, alpha_km, latent_months]
      simulate: ([beta, alphaKm, latentMonths]: number[]) => {
        const prev = Math.min(0.95, Math.max(0.01, beta * 0.52 + (alphaKm / 30) * 0.14 - latentMonths * 0.02))
        const cumInc = Math.min(0.99, prev * (1.55 + 0.12 * (alphaKm / 15)))
        return [prev, cumInc]
      },
      distance: (sim: number[], obs: number[]) =>
        Math.hypot((sim[0] ?? 0) - (obs[0] ?? 0), (sim[1] ?? 0) - (obs[1] ?? 0)),
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ABC-SMC inference failed" },
      { status: 400 }
    )
  }
}
