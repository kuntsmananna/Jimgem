import { NextRequest, NextResponse } from "next/server";
import {
  updateFlavor,
  archiveFlavor,
  updatePackageType,
  updatePaymentMethod,
  updateExpenseCategory,
  updateContentPreset,
  archiveContentPreset,
} from "@/lib/settings";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/settings/[resource]/[id]">,
) {
  const { resource, id } = await ctx.params;
  const numericId = Number(id);
  const body = await request.json();

  try {
    switch (resource) {
      case "flavors": {
        if (body.archive) {
          await archiveFlavor(numericId);
          return NextResponse.json({ ok: true });
        }
        const flavor = await updateFlavor(numericId, {
          name: body.name,
          colorGlow: body.colorGlow,
          colorBase: body.colorBase,
          colorShadow: body.colorShadow,
          isAlcoholic: !!body.isAlcoholic,
        });
        return NextResponse.json(flavor);
      }
      case "package-types": {
        const packageType = await updatePackageType(numericId, {
          name: body.name,
          unitsPerPackage: Number(body.unitsPerPackage),
        });
        return NextResponse.json(packageType);
      }
      case "payment-methods": {
        const method = await updatePaymentMethod(numericId, body.name);
        return NextResponse.json(method);
      }
      case "expense-categories": {
        const category = await updateExpenseCategory(numericId, body.name);
        return NextResponse.json(category);
      }
      case "presets": {
        if (body.archive) {
          await archiveContentPreset(numericId);
          return NextResponse.json({ ok: true });
        }
        const preset = await updateContentPreset(numericId, {
          name: body.name,
          packageTypeId: Number(body.packageTypeId),
          flavors: (body.flavors ?? []).map(
            (f: { flavorId: number | string; share: number | string }) => ({
              flavorId: Number(f.flavorId),
              share: Number(f.share),
            }),
          ),
        });
        return NextResponse.json(preset);
      }
      default:
        return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 404 });
    }
  } catch (error) {
    console.error(`Failed to update ${resource}/${id}:`, error);
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }
}
