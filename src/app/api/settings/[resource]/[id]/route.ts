import { NextRequest, NextResponse } from "next/server";
import {
  updateFlavor,
  archiveFlavor,
  updatePackageType,
  archivePackageType,
  updatePaymentMethod,
  archivePaymentMethod,
  updateExpenseCategory,
  archiveExpenseCategory,
  updateContentPreset,
  archiveContentPreset,
  updateOrderType,
  archiveOrderType,
  updateProductionStage,
  archiveProductionStage,
  updateDisplayOption,
  archiveDisplayOption,
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
        if (body.archive) {
          await archivePackageType(numericId);
          return NextResponse.json({ ok: true });
        }
        const packageType = await updatePackageType(numericId, {
          name: body.name,
          unitsPerPackage: Number(body.unitsPerPackage),
        });
        return NextResponse.json(packageType);
      }
      case "payment-methods": {
        if (body.archive) {
          await archivePaymentMethod(numericId);
          return NextResponse.json({ ok: true });
        }
        const method = await updatePaymentMethod(numericId, body.name);
        return NextResponse.json(method);
      }
      case "expense-categories": {
        if (body.archive) {
          await archiveExpenseCategory(numericId);
          return NextResponse.json({ ok: true });
        }
        const category = await updateExpenseCategory(numericId, body.name);
        return NextResponse.json(category);
      }
      case "order-types": {
        if (body.archive) {
          await archiveOrderType(numericId);
          return NextResponse.json({ ok: true });
        }
        const type = await updateOrderType(numericId, { name: body.name, color: body.color, icon: body.icon ?? null });
        return NextResponse.json(type);
      }
      case "stages": {
        if (body.archive) {
          await archiveProductionStage(numericId);
          return NextResponse.json({ ok: true });
        }
        const stage = await updateProductionStage(numericId, {
          label: body.label,
          color: body.color,
          countsAsIncome: !!body.countsAsIncome,
          isFinal: !!body.isFinal,
        });
        return NextResponse.json(stage);
      }
      case "displays": {
        if (body.archive) {
          await archiveDisplayOption(numericId);
          return NextResponse.json({ ok: true });
        }
        const option = await updateDisplayOption(numericId, {
          name: body.name,
          price: Number(body.price) || 0,
        });
        return NextResponse.json(option);
      }
      case "presets": {
        if (body.archive) {
          await archiveContentPreset(numericId);
          return NextResponse.json({ ok: true });
        }
        const preset = await updateContentPreset(numericId, {
          name: body.name,
          packageTypeId: Number(body.packageTypeId),
          price:
            body.price === null || body.price === undefined || body.price === ""
              ? null
              : Number(body.price),
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
