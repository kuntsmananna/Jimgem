"use client";

import type { Order } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { Modal } from "@/components/Modal";
import { OrderForm } from "./OrderForm";

/** Centred dialog around the shared order form — used for "Add order". */
export function OrderFormModal({
  order,
  flavors,
  packageTypes,
  onSaved,
  onClose,
}: {
  /** Omit to create a new order, pass one to edit it. */
  order?: Order;
  flavors: Flavor[];
  packageTypes: PackageType[];
  onSaved: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={order ? "Edit order" : "Add order"} onClose={onClose} wide>
      <OrderForm
        order={order}
        flavors={flavors}
        packageTypes={packageTypes}
        onSaved={onSaved}
        onCancel={onClose}
      />
    </Modal>
  );
}
