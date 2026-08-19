import { NextRequest, NextResponse } from "next/server";
import {
  createFlavor,
  createPackageType,
  createPaymentMethod,
  createExpenseCategory,
  createContentPreset,
  createOrderType,
  createProductionStage,
  createDisplayOption,
  type ContentPresetInput,
} from "@/lib/settings";

/** Coerces the JSON body's loosely-typed recipe into numbers. */
function presetInput(body: {
  name: string;
  packageTypeId: number | string;
  price?: number | string | null;
  flavors?: { flavorId: number | string; share: number | string }[];
}): ContentPresetInput {
  return {
    name: body.name,
    packageTypeId: Number(body.packageTypeId),
    // An empty price means "no set price", not free — the line falls back
    // to per-unit tier pricing.
    price: body.price === null || body.price === undefined || body.price === "" ? null : Number(body.price),
    flavors: (body.flavors ?? []).map((f) => ({
      flavorId: Number(f.flavorId),
      share: Number(f.share),
    })),
  };
}

export const runtime = "nodejs";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/settings/[resource]">) {
  const { resource } = await ctx.params;
  const body = await request.json();

  try {
    switch (resource) {
      case "flavors": {
        const flavor = await createFlavor({
          name: body.name,
          colorGlow: body.colorGlow,
          colorBase: body.colorBase,
          colorShadow: body.colorShadow,
          isAlcoholic: !!body.isAlcoholic,
        });
        return NextResponse.json(flavor, { status: 201 });
      }
      case "package-types": {
        const packageType = await createPackageType({
          name: body.name,
          unitsPerPackage: Number(body.unitsPerPackage),
        });
        return NextResponse.json(packageType, { status: 201 });
      }
      case "payment-methods": {
        const method = await createPaymentMethod(body.name);
        return NextResponse.json(method, { status: 201 });
      }
      case "expense-categories": {
        const category = await createExpenseCategory(body.name);
        return NextResponse.json(category, { status: 201 });
      }
      case "order-types": {
        const type = await createOrderType({ name: body.name, color: body.color, icon: body.icon ?? null });
        return NextResponse.json(type, { status: 201 });
      }
      case "stages": {
        const stage = await createProductionStage({
          label: body.label,
          color: body.color,
          countsAsIncome: !!body.countsAsIncome,
          isFinal: !!body.isFinal,
        });
        return NextResponse.json(stage, { status: 201 });
      }
      case "displays": {
        const option = await createDisplayOption({ name: body.name, price: Number(body.price) || 0 });
        return NextResponse.json(option, { status: 201 });
      }
      case "presets": {
        const preset = await createContentPreset(presetInput(body));
        return NextResponse.json(preset, { status: 201 });
      }
      default:
        return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 404 });
    }
  } catch (error) {
    console.error(`Failed to create ${resource}:`, error);
    return NextResponse.json({ error: "Failed to create." }, { status: 500 });
  }
}
