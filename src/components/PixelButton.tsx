"use client";

import { ButtonHTMLAttributes, AnchorHTMLAttributes, forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "muted" | "ghost";
type Size = "sm" | "md" | "lg";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

const sizeCls: Record<Size, string> = {
  sm: "px-4 py-2 text-[12px]",
  md: "px-5 py-3 text-[13px]",
  lg: "px-7 py-3.5 text-[14px]",
};

// Variant: fill color of the button body. Outline + raised drop are drawn
// by an outer wrapper via `filter: drop-shadow(...)` so they follow the
// chamfered clip-path edge instead of the unclipped rectangle.
const fillCls: Record<Variant, string> = {
  primary: "bg-accent text-bg",
  muted:   "bg-surface text-ink",
  ghost:   "bg-bg text-sub",
};

const shadowCls: Record<Variant, string> = {
  primary: "pixel-shadow-primary",
  muted:   "pixel-shadow-muted",
  ghost:   "pixel-shadow-ghost",
};

function classes(variant: Variant, size: Size, block?: boolean) {
  const inner = [
    "pixel-clip select-none font-semibold tracking-[0.02em] inline-flex items-center justify-center",
    sizeCls[size],
    fillCls[variant],
    "transition-transform duration-75 ease-out",
    "active:translate-y-[3px]",
    block ? "w-full" : "",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ]
    .filter(Boolean)
    .join(" ");
  const outer = [
    "inline-block",
    shadowCls[variant],
    block ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { inner, outer };
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & CommonProps;

export const PixelButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function PixelButton(
    { variant = "primary", size = "md", block, className = "", children, ...rest },
    ref,
  ) {
    const { inner, outer } = classes(variant, size, block);
    return (
      <span className={outer}>
        <button ref={ref} className={[inner, className].join(" ")} {...rest}>
          {children}
        </button>
      </span>
    );
  },
);

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  CommonProps & { href: string };

export function PixelLink({
  variant = "primary",
  size = "md",
  block,
  className = "",
  children,
  href,
  ...rest
}: LinkProps) {
  const { inner, outer } = classes(variant, size, block);
  return (
    <span className={outer}>
      <Link href={href} className={[inner, className].join(" ")} {...rest}>
        {children}
      </Link>
    </span>
  );
}
