"use client";

import { motion, useMotionTemplate, useMotionValue, useScroll, useTransform } from "framer-motion";
import { useEffect } from "react";

function useBoundedScroll(threshold: number) {
  const { scrollY } = useScroll();
  const scrollYBounded = useMotionValue(0);
  const scrollYBoundedProgress = useTransform(scrollYBounded, [0, threshold], [0, 1]);

  useEffect(() => {
    return scrollY.on("change", current => {
      const previous = scrollY.getPrevious() ?? 0;
      const diff = current - previous;
      const newScrollYBounded = scrollYBounded.get() + diff;

      scrollYBounded.set(clamp(newScrollYBounded, 0, threshold));
    });
  }, [threshold, scrollY, scrollYBounded]);

  return { scrollYBounded, scrollYBoundedProgress };
}

export default function Header() {
  const { scrollYBoundedProgress } = useBoundedScroll(400);
  const scrollYBoundedProgressDelayed = useTransform(scrollYBoundedProgress, [0, 0.75, 1], [0, 0, 1]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 overflow-hidden text-muted-foreground">
      <div className="z-0 flex-1 overflow-y-scroll">
        <motion.header
          style={{
            height: useTransform(scrollYBoundedProgressDelayed, [0, 1], [80, 50]),
            backgroundColor: useMotionTemplate`rgb(255 255 255 / ${useTransform(
              scrollYBoundedProgressDelayed,
              [0, 1],
              [1, 0.1]
            )})`,
          }}
          className="fixed inset-x-0 flex h-20 shadow backdrop-blur-md"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-8">
            <motion.p
              data-testid="header-logo"
              style={{
                scale: useTransform(scrollYBoundedProgressDelayed, [0, 1], [1, 0.9]),
              }}
              className="flex origin-left items-center text-xl font-semibold uppercase"
            >
              <span className="-ml-1.5 inline-block -rotate-90 text-[10px] leading-[0]">The</span>
              <span className="-ml-1 text-2xl tracking-[-.075em]">Daily Bugle</span>
            </motion.p>
            <motion.nav
              data-testid="header-nav"
              style={{
                opacity: useTransform(scrollYBoundedProgressDelayed, [0, 1], [1, 0]),
              }}
              className="flex space-x-4 text-sm font-medium text-muted-foreground"
            >
              <a href="#">News</a>
              <a href="#">Sports</a>
              <a href="#">Culture</a>
            </motion.nav>
          </div>
        </motion.header>

        <main data-testid="main-content" className="px-8 pt-28">
          <h1 className="h-10 w-4/5 rounded bg-muted text-2xl font-bold" />
          <div className="mt-8 space-y-6">
            {Array.from(Array(2).keys()).map(i => (
              <div key={i} className="space-y-2 text-sm">
                <p className="h-4 w-5/6 rounded bg-muted" />
                <p className="h-4 rounded bg-muted" />
                <p className="h-4 w-4/6 rounded bg-muted" />
              </div>
            ))}

            <div className="h-64 rounded bg-muted"></div>

            {Array.from(Array(90).keys()).map(i => (
              <div key={i} className="space-y-2 text-sm">
                <p className="h-4 w-5/6 rounded bg-muted" />
                <p className="h-4 rounded bg-muted" />
                <p className="h-4 w-4/6 rounded bg-muted" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

const clamp = (number: number, min: number, max: number) => Math.min(Math.max(number, min), max);
