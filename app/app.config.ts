import { authConfig } from "./auth.config";

export default defineAppConfig({
  auth: { ...authConfig },
  // https://ui3.nuxt.dev/getting-started/theme#design-system
  ui: {
    colors: {
      primary: "blue",
      neutral: "stone",
    },
    button: {
      slots: {
        label: "text-sm font-light",
        leadingIcon: "*:stroke-[1px]",
        trailingIcon: "*:stroke-[1px]",
      },
      compoundVariants: [
        {
          color: "neutral",
          variant: "ghost",
          class: "hover:bg-(--ui-primary) hover:text-white",
        },
      ],
      defaultVariants: {
        color: "neutral",
        variant: "ghost",
        size: "xl",
      },
    },
    input: {
      slots: {
        label: "text-sm font-light",
        leadingIcon: "*:stroke-[1.5px]",
        trailingIcon: "*:stroke-[1px]",
      },
      defaultVariants: {
        size: "xl",
      },
    },
    select: {
      slots: {
        value: "text-sm font-light",
        leadingIcon: "*:stroke-[1px]",
        trailingIcon: "*:stroke-[1px] text-inherit",
        itemLeadingIcon: "*:stroke-[1px]",
        itemTrailingIcon: "*:stroke-[1px]",
        itemLabel: "text-sm font-light",
        placeholder:
          "truncate text-neutral-600 dark:text-neutral-400 text-sm font-light",
      },
      compoundVariants: [
        {
          color: "neutral",
          variant: "ghost",
          class:
            "hover:bg-(--ui-primary) hover:text-white focus:bg-(--ui-primary) focus:text-white",
        },
      ],
      defaultVariants: {
        color: "neutral",
        variant: "ghost",
        size: "xl",
      },
    },
    dropdownMenu: {
      slots: {
        label: "text-sm font-light",
        itemLeadingIcon: "*:stroke-[1px]",
        itemTrailingIcon: "*:stroke-[1px]",
        itemLabel: "text-sm font-light",
      },
      defaultVariants: {
        color: "neutral",
        variant: "ghost",
        size: "xl",
      },
    },
    breadcrumb: {
      slots: {
        linkLabel: "text-sm font-light",
      },
    },
    navigationMenu: {
      slots: {
        root: "",
        list: "",
        label: "py-2",
        linkLeadingIcon: "*:stroke-[1.5px]",
        linkTrailingIcon: "*:stroke-[1px]",
        linkLabel: "text-sm font-light",
      },
      variants: {
        active: {
          false: {
            link: "text-neutral-900 dark:text-neutral-100",
          },
        },
        orientation: {
          horizontal: {
            root: "space-y-0",
            list: "space-y-0",
          },
          vertical: {
            root: "space-y-2",
            list: "space-y-2",
            link: "py-2",
          },
        },
      },
    },
    tabs: {
      slots: {
        tab: "text-sm font-light",
      },
    },
    tooltip: {
      slots: {
        content:
          "bg-(--ui-bg-inverted) text-(--ui-bg) ring-(--ui-border-inverted)",
        arrow: "fill-(--ui-border-inverted)",
      },
    },
  },
});
