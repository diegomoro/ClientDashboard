import { useMemo, useState } from "react";

type WithId = { id: string };

export function useSelection<T extends WithId>() {
  const [selected, setSelected] = useState<Map<string, T>>(new Map());

  const toggle = (item: T) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  };

  const clear = () => setSelected(new Map());

  const remove = (id: string) => {
    setSelected((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const snapshot = useMemo(() => Array.from(selected.values()), [selected]);

  const isSelected = (id: string) => selected.has(id);

  return {
    items: snapshot,
    toggle,
    clear,
    remove,
    isSelected,
    count: selected.size,
  };
}
