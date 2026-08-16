import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, children, ...props }, ref) => {
    return (
      <div className="relative inline-block w-full">
        <select
          ref={ref}
          className={cn(
            "h-9 w-full appearance-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 pr-8 text-sm text-zinc-100 shadow-sm focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-400" />
      </div>
    );
  }
);
Select.displayName = "Select";
