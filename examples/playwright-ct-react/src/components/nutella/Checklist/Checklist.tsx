"use client";

import { stagger, useAnimate } from "framer-motion";
import { useState } from "react";

type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

interface ChecklistProps {
  initialItems: ChecklistItem[];
  title?: string;
}

export function Checklist({ initialItems, title = "Checklist" }: ChecklistProps) {
  const [items, setItems] = useState(initialItems);
  const [ref, animate] = useAnimate();

  function handleChange(id: string) {
    const newItems = items.map((item) => ({
      ...item,
      checked: item.id === id ? !item.checked : item.checked,
    }));

    setItems(newItems);

    if (newItems.every((item) => item.checked)) {
      const lastCompletedItem = items.findIndex((item) => !item.checked);
      const random = Math.random();

      const animations = [
        {
          prop: { scale: [1, 1.25, 1] },
          duration: 0.35,
        },
        {
          prop: { x: [0, 2, -2, 0] },
          duration: 0.4,
        },
        {
          prop: { rotate: [0, 10, -10, 0] },
          duration: 0.5,
        },
      ];

      const anim = animations[Math.floor(random * animations.length)];

      animate("input", anim.prop, {
        duration: anim.duration,
        delay: stagger(0.1, { from: lastCompletedItem }),
      });
    }
  }

  return (
    <div data-testid="checklist-container" className="flex w-full max-w-sm flex-col rounded bg-card px-3 py-4 shadow-xl border">
      <p className="ml-2 flex items-center text-lg font-semibold text-card-foreground">
        <svg className="mr-3 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 6h12M4 10h12M4 14h12" />
        </svg>
        <span data-testid="checklist-title">{title}</span>
      </p>
      <div ref={ref} className="mt-4">
        {items.map((item) => (
          <label
            data-testid={`checklist-item-${item.id}`}
            key={item.id}
            className={`group flex w-full cursor-pointer select-none items-center rounded p-2 text-sm font-medium transition-colors duration-300 hover:bg-muted ${
              item.checked ? "text-muted-foreground line-through" : "text-card-foreground"
            }`}
          >
            <input
              data-testid={`checkbox-${item.id}`}
              onChange={() => handleChange(item.id)}
              checked={item.checked}
              type="checkbox"
              className="mr-4 h-4 w-4 rounded-sm border-2 border-border text-primary transition-colors duration-300 focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card group-active:border-primary group-active:checked:text-primary/25"
            />
            <span data-testid={`item-text-${item.id}`}>{item.text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default Checklist; 