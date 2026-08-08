import { NextRequest, NextResponse } from "next/server";
import {
  createFlavor,
  createPackageType,
  createPaymentMethod,
  createExpenseCategory,
} from "@/lib/settings";

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
      default:
        return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 404 });
    }
  } catch (error) {
    console.error(`Failed to create ${resource}:`, error);
    return NextResponse.json({ error: "Failed to create." }, { status: 500 });
  }
}
