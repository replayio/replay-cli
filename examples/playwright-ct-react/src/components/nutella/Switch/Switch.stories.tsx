import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "A modern, accessible switch component with multiple sizes and states.",
      },
    },
  },
  argTypes: {
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
      description: "Size variant of the switch",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Disable the switch",
    },
    defaultChecked: {
      control: { type: "boolean" },
      description: "Initial checked state",
    },
  },
  decorators: [
    Story => (
      <div className="p-8 bg-white rounded-xl shadow-sm border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: {
    children: "Enable notifications",
    defaultChecked: false,
    size: "md",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Email notifications",
    description: "Receive email updates about your account activity",
    defaultChecked: false,
    size: "md",
  },
};

export const Checked: Story = {
  args: {
    children: "Auto-save enabled",
    defaultChecked: true,
    size: "md",
  },
};

export const Small: Story = {
  args: {
    children: "Compact switch",
    defaultChecked: false,
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    children: "Large switch",
    defaultChecked: true,
    size: "lg",
  },
};

export const Disabled: Story = {
  args: {
    children: "Disabled switch",
    disabled: true,
    defaultChecked: false,
  },
};

export const DisabledChecked: Story = {
  args: {
    children: "Disabled checked",
    disabled: true,
    defaultChecked: true,
  },
};

export const SizeComparison: Story = {
  render: () => (
    <div className="space-y-6">
      <Switch size="sm" defaultChecked={false}>
        Small switch
      </Switch>
      <Switch size="md" defaultChecked={true}>
        Medium switch (default)
      </Switch>
      <Switch size="lg" defaultChecked={false}>
        Large switch
      </Switch>
    </div>
  ),
};

export const SettingsPanel: Story = {
  render: () => (
    <div className="max-w-md space-y-6 p-6 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h3>

      <Switch
        label="Push notifications"
        description="Receive push notifications on your device"
        defaultChecked={true}
      />

      <Switch
        label="Email notifications"
        description="Get email updates about important activities"
        defaultChecked={false}
      />

      <Switch
        label="SMS notifications"
        description="Receive text messages for urgent updates"
        defaultChecked={false}
      />

      <Switch
        label="Marketing emails"
        description="Stay updated with our latest features and offers"
        defaultChecked={false}
        disabled
      />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          Try interacting with these switches - they have smooth animations and proper focus states
        </div>

        <Switch defaultChecked={false}>Toggle me!</Switch>

        <Switch
          label="Dark mode"
          description="Switch between light and dark themes"
          defaultChecked={true}
        />

        <Switch size="lg" defaultChecked={false}>
          Large interactive switch
        </Switch>
      </div>
    );
  },
};
