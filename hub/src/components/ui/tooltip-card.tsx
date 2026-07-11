"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export const Tooltip = ({
  content,
  children,
  containerClassName,
}: {
  content: string | React.ReactNode;
  children: React.ReactNode;
  containerClassName?: string;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [height, setHeight] = useState(0);
  // Position is tracked in VIEWPORT (fixed) coordinates, not relative to the
  // trigger, because the popup is portaled to document.body — see below for
  // why: rendering it inside the trigger's own DOM subtree let ancestor
  // elements with overflow/stacking rules (e.g. the horizontally-scrollable
  // Dugout table) clip or bury the popup behind sibling cells.
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isVisible && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [isVisible, content]);

  const calculatePosition = (mouseX: number, mouseY: number) => {
    if (!containerRef.current) return { x: mouseX + 12, y: mouseY + 12 };

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Get tooltip dimensions
    const tooltipWidth = 240; // min-w-[15rem] = 240px
    const tooltipHeight = contentRef.current?.scrollHeight ?? 0;

    // mouseX/mouseY are relative to the trigger; convert to viewport coords
    // since the popup now renders in a portal at document.body, positioned
    // with `position: fixed`.
    const absoluteX = containerRect.left + mouseX;
    const absoluteY = containerRect.top + mouseY;

    let finalX = absoluteX + 12;
    let finalY = absoluteY + 12;

    // Check if tooltip goes beyond right edge
    if (finalX + tooltipWidth > viewportWidth) {
      finalX = absoluteX - tooltipWidth - 12;
    }
    if (finalX < 4) finalX = 4;

    // Check if tooltip goes beyond bottom edge
    if (finalY + tooltipHeight > viewportHeight) {
      finalY = absoluteY - tooltipHeight - 12;
    }
    if (finalY < 4) finalY = 4;

    return { x: finalX, y: finalY };
  };

  const updateMousePosition = (mouseX: number, mouseY: number) => {
    setMouse({ x: mouseX, y: mouseY });
    const newPosition = calculatePosition(mouseX, mouseY);
    setPosition(newPosition);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsVisible(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    updateMousePosition(mouseX, mouseY);
  };

  const handleMouseLeave = () => {
    setMouse({ x: 0, y: 0 });
    setPosition({ x: 0, y: 0 });
    setIsVisible(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVisible) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    updateMousePosition(mouseX, mouseY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = touch.clientX - rect.left;
    const mouseY = touch.clientY - rect.top;
    updateMousePosition(mouseX, mouseY);
    setIsVisible(true);
  };

  const handleTouchEnd = () => {
    // Delay hiding to allow for tap interaction
    setTimeout(() => {
      setIsVisible(false);
      setMouse({ x: 0, y: 0 });
      setPosition({ x: 0, y: 0 });
    }, 2000);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Toggle visibility on click for mobile devices
    if (window.matchMedia("(hover: none)").matches) {
      e.preventDefault();
      if (isVisible) {
        setIsVisible(false);
        setMouse({ x: 0, y: 0 });
        setPosition({ x: 0, y: 0 });
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        updateMousePosition(mouseX, mouseY);
        setIsVisible(true);
      }
    }
  };

  // Update position when tooltip becomes visible or content changes
  useEffect(() => {
    if (isVisible && contentRef.current) {
      const newPosition = calculatePosition(mouse.x, mouse.y);
      setPosition(newPosition);
    }
  }, [isVisible, height, mouse.x, mouse.y]);

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", containerClassName)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <motion.div
                key={String(isVisible)}
                initial={{ height: 0, opacity: 1 }}
                animate={{ height, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
                className="pointer-events-none fixed z-[999] min-w-[15rem] overflow-hidden rounded-md border border-transparent bg-white shadow-sm ring-1 shadow-black/5 ring-black/5 dark:bg-neutral-900 dark:shadow-white/10 dark:ring-white/5"
                style={{
                  top: position.y,
                  left: position.x,
                }}
              >
                <div
                  ref={contentRef}
                  className="p-2 text-sm text-neutral-600 md:p-4 dark:text-neutral-400"
                >
                  {content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
