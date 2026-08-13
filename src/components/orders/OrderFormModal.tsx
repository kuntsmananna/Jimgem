"use client";

import { useCallback, useState } from "react";
import type { Order } from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { Modal } from "@/components/Modal";
import { OrderForm } from "./OrderForm";

/** Centred dialog around the shared order form — used for "Add order". */
export function OrderFormModal({
  order,
  flavors,
  packageTypes,
  presets,
  onSaved,
  onClose,
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);

  /** Same unsaved-edit guard as the details pane — see its requestClose. */
  const requestClose = useCallback(() => {
    if (dirty && !confirm("Discard this order without saving?")) return;
    onClose();
  }, [dirty, onClose]);

  return (
    <Modal title={order ? "Edit order" : "Add order"} onClose={requestClose} wide>
      <OrderForm
        order={order}
        flavors={flavors}
        packageTypes={packageTypes}
        presets={presets}
        onSaved={onSaved}
        onCancel={requestClose}
        onDirtyChange={setDirty}
      />
    </Modal>
  );
}
