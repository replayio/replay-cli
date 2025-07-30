import * as SwitchPrimitive from "@radix-ui/react-switch";
import { ComponentProps, ReactNode } from "react";
import { cn } from "../../../lib/utils";

type SwitchProps = {
  children?: ReactNode;
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
} & ComponentProps<typeof SwitchPrimitive.Root>;

const switchVariants = {
  size: {
    sm: {
      root: "h-5 w-8",
      thumb: "h-4 w-4 data-[state=checked]:translate-x-3",
      label: "text-sm",
      spacing: "ml-3"
    },
    md: {
      root: "h-6 w-11",
      thumb: "h-5 w-5 data-[state=checked]:translate-x-5",
      label: "text-base",
      spacing: "ml-4"
    },
    lg: {
      root: "h-7 w-12",
      thumb: "h-6 w-6 data-[state=checked]:translate-x-5",
      label: "text-lg",
      spacing: "ml-4"
    }
  }
};

export function Switch({ 
  children, 
  label, 
  description, 
  size = "md", 
  className,
  disabled,
  ...props 
}: SwitchProps) {
  const displayText = children || label;
  const variants = switchVariants.size[size];

  return (
    <div className={cn("flex items-start space-x-3", className)}>
      <SwitchPrimitive.Root
        {...props}
        disabled={disabled}
        data-testid="switch-root"
        className={cn(
          // Base styles
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
          "transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          
          // Size variants
          variants.root,
          
          // Color states
          "bg-gray-200 hover:bg-gray-300",
          "data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-500 data-[state=checked]:to-blue-600",
          "data-[state=checked]:hover:from-blue-600 data-[state=checked]:hover:to-blue-700",
          
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-200",
          "disabled:data-[state=checked]:bg-gray-400 disabled:data-[state=checked]:hover:bg-gray-400"
        )}
      >
        <SwitchPrimitive.Thumb
          data-testid="switch-thumb"
          className={cn(
            // Base styles
            "pointer-events-none block rounded-full bg-white shadow-lg ring-0",
            "transition-all duration-200 ease-in-out",
            
            // Size and position
            variants.thumb,
            
            // Interactive states
            "group-hover:shadow-xl",
            "data-[state=checked]:shadow-lg"
          )}
        />
      </SwitchPrimitive.Root>

      {displayText && (
        <div className="flex flex-col">
          <label 
            className={cn(
              "cursor-pointer font-medium text-gray-900 select-none",
              variants.label,
              disabled && "cursor-not-allowed opacity-50"
            )}
            data-testid="switch-label"
          >
            {displayText}
          </label>
          {description && (
            <p 
              className={cn(
                "text-sm text-gray-500 mt-1",
                disabled && "opacity-50"
              )}
              data-testid="switch-description"
            >
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Switch; 