"use client";

import { useCallback, useState } from "react";
import type { Order, Rates } from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import type { Client } from "@/lib/clients";
import { ClipboardList } from "lucide-react";
import { Modal } from "@/components/Modal";
import { OrderForm } from "./OrderForm";

/** Centred dialog around the shared order form — used for "Add order". */
export function OrderFormModal({
  order,
  flavors,
  packageTypes,
  presets,
  clients,
  rates,
  onSaved,
  onClose,
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  clients: Client[];
  rates: Rates;
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
    <Modal
      title={order ? "Edit order" : "Add order"}
      icon={<ClipboardList size={17} />}
      onClose={requestClose}
      wide
    >
      <OrderForm
        order={order}
        flavors={flavors}
        packageTypes={packageTypes}
        presets={presets}
        clients={clients}
        rates={rates}
        onSaved={onSaved}
        onCancel={requestClose}
        onDirtyChange={setDirty}
      />
    </Modal>
  );
}
